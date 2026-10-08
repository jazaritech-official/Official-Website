/**
 * Hero WebGL engine — ONE renderer, ONE RAF loop, delta-time driven.
 *
 * Owns: renderer, camera, scene, loop, theme application and full disposal.
 * React never touches Three.js objects directly; `SceneCanvas` wraps this
 * factory and orchestrates observers/listeners around it.
 *
 * Scene graph:
 *   scene → fog, lighting rig, environment
 *         → composition (scroll + primary parallax)
 *             → ribbon diamond (assembly/idle via animator)
 *             → support system (chip/cloud/shield/gear/data + shadow + points)
 * Per frame: interaction damping → animator (all spatial writes) → render →
 * hotspot projection + throttled hover poll (fresh matrices) → hover easing.
 */

import {
  ACESFilmicToneMapping,
  Box3,
  Fog,
  Group,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import type {
  EngineHandle,
  EngineOptions,
  QualityTier,
  SceneTheme,
  ShatterState,
  ShatterStateInput,
} from "./types";
import { disposeObject } from "./helpers/disposeScene";
import { BRAND, PALETTES, readPageBackground } from "./theme";
import { createFpsMonitor, renderConfig, type FpsMonitor } from "./quality";
import { clamp, damp } from "./helpers/math";
import { createEnvironment, type SceneEnvironment } from "./environment";
import { createLighting, type LightingRig } from "./lighting";
import { createJazariRibbon, type JazariRibbon } from "./createLogoPieces";
import { createSupportSystem, type SupportSystem } from "./createTechObjects";
import { createAnimator, type Animator } from "./animation";
import { createShatterField, type ShatterField } from "./shatter";
import { createShatterController, legacyExplodeState } from "./shatterState";
import { createInteraction, type InteractionHandle } from "./interaction";
import { projectToContainerPx, type ScreenPoint } from "./helpers/projection";

const TIERS: Array<Exclude<QualityTier, "static">> = ["high", "medium", "low"];
const MIN_CAMERA_Z = 9.0;
const FIT_CAMERA_Z = 9.3; // keeps the enlarged logo + recomposed supports in frame

export function createHeroEngine(options: EngineOptions): EngineHandle {
  const { container, theme, tier: initialTier, reducedMotion, onFirstFrame, onAnchor } = options;

  let tier = initialTier;
  let config = renderConfig(tier);
  let themeState: SceneTheme = theme;
  let reduced = reducedMotion;
  let disposed = false;
  let running = false;
  let rafId = 0;
  let lastTime = performance.now();
  let elapsed = 0;
  let firstFrameDone = false;
  /** Normalized hero scroll progress 0..1 (passive listener below). */
  let scrollOffset = 0;

  /* --- Scroll (hero range only — never a global 3D scroll loop) ---------- */
  const SCROLL_RANGE_PX = 600; // TUNING: scroll distance over which the hero reacts
  const SHATTER_SCROLL_RELEASE_PX = 40; // a small scroll closes an open shatter
  const onScroll = (): void => {
    scrollOffset = clamp(window.scrollY, 0, SCROLL_RANGE_PX) / SCROLL_RANGE_PX;
    if (window.scrollY > SHATTER_SCROLL_RELEASE_PX) shatterController.scroll(elapsed);
    else shatterController.noteActivity(elapsed);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  /* --- Idle-dwell activity: any pointer or key input resets the timer ----- */
  const onActivity = (): void => shatterController.noteActivity(elapsed);
  window.addEventListener("pointermove", onActivity, { passive: true });
  window.addEventListener("keydown", onActivity);
  window.addEventListener("wheel", onActivity, { passive: true });

  /* --- Renderer ---------------------------------------------------------- */
  const renderer = new WebGLRenderer({
    alpha: true, // page background (design tokens) shows through
    antialias: true,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = PALETTES[themeState].exposure;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.pixelRatioCap));
  renderer.domElement.setAttribute("aria-hidden", "true");
  // Live tier marker — inspect/tune quality from DevTools (documented in §3D Architecture).
  renderer.domElement.setAttribute("data-quality", tier);

  const canvas = renderer.domElement;
  container.appendChild(canvas);

  /* --- Scene, camera, content ------------------------------------------- */
  const scene = new Scene();
  const fog = new Fog(readPageBackground(themeState), 9, 24);
  scene.fog = fog;

  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0.25, MIN_CAMERA_Z);
  camera.lookAt(0, 0, 0);

  const environment: SceneEnvironment = createEnvironment(renderer);
  scene.environment = environment.texture;

  const lighting: LightingRig = createLighting(PALETTES[themeState]);
  scene.add(lighting.group);

  const ribbon: JazariRibbon = createJazariRibbon(tier);
  const supports: SupportSystem = createSupportSystem(tier, PALETTES[themeState]);

  // Explosion field (additive state — the solid logo is untouched): the mark's
  // real Voronoi fragments plus the neon dust they release.
  const glowFor = (next: SceneTheme): number => (next === "dark" ? 1.3 : 0.8);
  let shatter: ShatterField = createShatterField(
    config.shardCount,
    config.fragmentCount,
    ribbon.scale,
    glowFor(themeState),
    BRAND.blue,
  );
  ribbon.group.add(shatter.group);

  // Solid-piece cross-fade targets (transparent only while a shatter is open).
  const pieceMaterials = ribbon.pieces.map((piece) => piece.material as MeshStandardMaterial);
  let solidOpacity = 1;
  const applySolidFade = (opacity: number): void => {
    const clampedOpacity = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity;
    if (Math.abs(clampedOpacity - solidOpacity) < 0.004) return;
    solidOpacity = clampedOpacity;
    const fading = clampedOpacity < 0.999;
    for (const material of pieceMaterials) {
      if (material.transparent !== fading) material.transparent = fading;
      material.opacity = clampedOpacity;
    }
  };

  const composition = new Group(); // scroll + primary parallax shift this unit
  composition.add(ribbon.group, supports.group);
  scene.add(composition);

  const animator: Animator = createAnimator({ ribbon, supports, composition, camera });
  const interaction: InteractionHandle = createInteraction(container);

  /* --- Shatter inputs + state machine ----------------------------------- */
  const shatterController = createShatterController();
  shatterController.setReducedMotion(reducedMotion);
  let pointerInside = false;
  let heroInView = true;
  let pageVisible = typeof document === "undefined" || document.visibilityState !== "hidden";
  let lastStageAttr = "";
  canvas.dataset.stage = "assembled";
  canvas.dataset.explode = "assembled";
  canvas.dataset.shards = String(shatter.count);
  canvas.dataset.fragments = String(shatter.fragmentCount);

  const applyEnvironmentIntensity = (): void => {
    environment.applyIntensity(
      scene,
      PALETTES[themeState].environmentIntensity * config.environmentIntensity,
    );
  };
  applyEnvironmentIntensity();

  const applyTierBudget = (): void => {
    supports.setSupportCount(config.supportCount);
    supports.setParticleVisibility(config.atmospheric && config.particleCount > 0);
    interaction.settings.hover = interaction.finePointer && config.hover;
    interaction.settings.parallax = interaction.finePointer && !reduced;
  };
  applyTierBudget();

  /* --- Sizing (responsive fit, no layout dependence) ---------------------
   * Container dimensions are cached here and reused by the loop, so the RAF
   * frame never reads layout (clientWidth/Height) — no per-frame reflow. */
  let viewWidth = 0;
  let viewHeight = 0;

  const resize = (): void => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height || disposed) return;
    viewWidth = width;
    viewHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Narrow containers pull the camera back so the composition always fits.
    camera.position.z = Math.max(MIN_CAMERA_Z, FIT_CAMERA_Z / Math.max(camera.aspect, 0.01));
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  };
  resize();

  /* --- Theme (in place — never rebuilds the scene) ----------------------- */
  const applyTheme = (next: SceneTheme): void => {
    themeState = next;
    const palette = PALETTES[next];
    fog.color.set(readPageBackground(next));
    renderer.toneMappingExposure = palette.exposure;
    lighting.apply(palette);
    supports.applyTheme(palette);
    shatter.setGlow(glowFor(next));
    applyEnvironmentIntensity();
  };

  /* --- Adaptive quality (downgrade-only, see quality.ts) ------------------ */
  const fpsMonitor: FpsMonitor = createFpsMonitor(() => {
    const index = TIERS.indexOf(tier);
    if (index < TIERS.length - 1) setTier(TIERS[index + 1]);
  });

  function setTier(next: Exclude<QualityTier, "static">): void {
    tier = next;
    config = renderConfig(next);
    canvas.setAttribute("data-quality", next);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.pixelRatioCap));
    applyEnvironmentIntensity();
    applyTierBudget(); // object counts + hover/parallax budgets
    rebuildShatter(); // tier budgets (dust shards + Voronoi fragments) stay truthful
    hoverAmounts.clear(); // stale keys would target now-hidden roots
    rebuildPickTargets(); // visible-object set changed
    resize();
  }

  /**
   * Rebuild the explosion field so BOTH tier budgets track `data-quality`:
   * dust shards (1000/500/200) and Voronoi fragments (100/50/20). A tier
   * change is rare (downgrade-only, never at start-up), so one synchronous
   * rebuild beats carrying three pre-built fractures around.
   */
  function rebuildShatter(): void {
    ribbon.group.remove(shatter.group);
    shatter.dispose();
    shatter = createShatterField(
      config.shardCount,
      config.fragmentCount,
      ribbon.scale,
      glowFor(themeState),
      BRAND.blue,
    );
    ribbon.group.add(shatter.group);
    // Re-apply the live timeline so a mid-explosion rebuild never flashes.
    shatter.setProgress(shatterController.progress);
    shatter.setMagnetic(shatterController.state === "reassembling");
    shatter.setTime(elapsed);
    shatter.setGlow(glowFor(themeState));
    canvas.dataset.shards = String(shatter.count);
    canvas.dataset.fragments = String(shatter.fragmentCount);
  }

  /* --- Hover: pick-root resolution + eased feedback ----------------------
   * Everything hover-related is resolved ONCE per scene/tier — never per
   * frame:
   *   `pickTargets`  — flat list of raycastable objects; the raycast runs with
   *                    `recursive:false`, so three never re-walks the graph.
   *   `rootByMesh`   — hit object → the root hover state is keyed on.
   *   `hoverTargets` — per root, the materials whose emissive lifts on hover,
   *                    with their base values captured up front (no traversal).
   */
  interface HoverTarget {
    material: MeshStandardMaterial;
    baseEmissive: number;
  }

  const hoverAmounts = new Map<Object3D, number>();
  const pickTargets: Object3D[] = [];
  const rootByMesh = new Map<Object3D, Object3D>();
  const hoverTargets = new Map<Object3D, HoverTarget[]>();
  const screen: ScreenPoint = { x: 0, y: 0, visible: false };
  const anchorWorld = new Vector3();

  /** Walk up to the child of ribbon.group / supports.group that owns hover. */
  function resolvePickRoot(object: Object3D): Object3D | null {
    let current: Object3D | null = object;
    while (
      current &&
      current.parent &&
      current.parent !== ribbon.group &&
      current.parent !== supports.group
    ) {
      current = current.parent;
    }
    if (!current || current === supports.shadow || current === supports.points) return null;
    return current;
  }

  /** Rebuild the flattened pick/hover tables. Called once and on tier change. */
  function rebuildPickTargets(): void {
    pickTargets.length = 0;
    rootByMesh.clear();
    hoverTargets.clear();

    const sources: Object3D[] = [ribbon.group];
    for (const root of supports.roots) if (root.visible) sources.push(root);

    for (const source of sources) {
      source.traverse((child) => {
        // The shatter field is decorative — never a hover target.
        if (child.userData.noPick) return;
        // Meshes and line segments are raycastable; points/groups are not picks.
        const target = child as Object3D & { isMesh?: boolean; isLine?: boolean };
        if (!target.isMesh && !target.isLine) return;
        const resolved = resolvePickRoot(child);
        if (!resolved || !resolved.visible) return;

        pickTargets.push(child);
        rootByMesh.set(child, resolved);

        const material = (child as Mesh).material;
        if (!material || Array.isArray(material)) return;
        if (!("emissiveIntensity" in material)) return;
        const list = hoverTargets.get(resolved) ?? [];
        list.push({
          material: material as MeshStandardMaterial,
          baseEmissive: (material.userData.baseEmissive as number | undefined) ?? 0,
        });
        hoverTargets.set(resolved, list);
      });
    }
  }

  function applyHover(dt: number, hoveredRoot: Object3D | null): void {
    if (hoveredRoot) {
      hoverAmounts.set(hoveredRoot, damp(hoverAmounts.get(hoveredRoot) ?? 0, 1, 9, dt));
    }
    for (const [object, amount] of hoverAmounts) {
      if (object === hoveredRoot) continue;
      const next = damp(amount, 0, 7, dt);
      if (next < 0.01) {
        hoverAmounts.delete(object);
        continue;
      }
      hoverAmounts.set(object, next);
    }
    for (const [object, amount] of hoverAmounts) {
      // Scale: subtle pop — except the leaf, whose scale the animator owns.
      if (object !== ribbon.leaf) {
        const baseScale = (object.userData.baseScale as number | undefined) ?? 1;
        object.scale.setScalar(baseScale * (1 + 0.05 * amount));
      }
      // Emissive lift straight from the precomputed table (no per-frame traversal).
      const targets = hoverTargets.get(object);
      if (!targets) continue;
      for (const target of targets) {
        target.material.emissiveIntensity = target.baseEmissive + amount * 0.3;
      }
    }
  }

  rebuildPickTargets();

  /* --- Harness introspection (decorative, deterministic, no secrets) ----
   * Lets the verification harness confirm the five real logo pieces, the five
   * support objects, the assembled logo extents and a supports-hidden view of
   * the logo silhouette without guessing from pixels alone. */
  const logoBounds = new Box3().setFromObject(ribbon.group);
  const logoSize = logoBounds.getSize(new Vector3());
  canvas.dataset.scenePieces = ribbon.pieces
    .map((piece) => (piece.userData.logoPiece as string | undefined) ?? piece.name)
    .join(",");
  canvas.dataset.sceneSupports = String(supports.roots.length);
  canvas.dataset.sceneLogoSize = `${logoSize.x.toFixed(3)}x${logoSize.y.toFixed(3)}`;
  Object.assign(canvas, {
    __jazariDebug: {
      setSupportsVisible: (visible: boolean): void => {
        supports.group.visible = visible;
      },
      // Freezes idle motion (same path as prefers-reduced-motion) so a
      // silhouette can be captured upright and deterministically.
      setReducedMotion: (value: boolean): void => {
        reduced = value;
        applyTierBudget();
      },
      logoSize: (): { x: number; y: number } => ({ x: logoSize.x, y: logoSize.y }),
      // Test hook: force a stage (null releases the override). Legacy names
      // (`shattering`) are accepted and map onto stage B.
      forceShatter: (state: ShatterStateInput | null): void => {
        if (reduced && state !== null) return; // reduced motion never explodes
        shatterController.force(state);
      },
      shatterState: (): ShatterState => shatterController.state,
      shardCount: (): number => shatter.count,
      fragmentCount: (): number => shatter.fragmentCount,
      /** Hide the dust layer so a screenshot isolates the real fragments. */
      setDustVisible: (visible: boolean): void => shatter.setDustVisible(visible),
      /** Hide the fracture layer (screenshot A/B isolation against the dust). */
      setFragmentsVisible: (visible: boolean): void => shatter.setFragmentsVisible(visible),
      /**
       * Test/tuning hook: override the neon glow of the fracture faces so the
       * harness can prove the neon-edge layer really drives rendered pixels.
       */
      setFractureGlow: (glow: number): void => shatter.setGlow(glow),
      /**
       * Fracture fidelity: raster IoU vs the traced silhouette, tiling overlap
       * and the median fragment size — measured, never asserted from vibes.
       */
      fractureMetrics: () => shatter.metrics(),
      /**
       * The spec's "median projected fragment": every fragment's rest bbox
       * projected into container pixels, median over the logo's own projected
       * width. Camera-exact (not a source-space guess) and deterministic at a
       * fixed scroll position.
       */
      fragmentProjection: (): {
        fragments: number;
        medianRatio: number;
        medianWidth: number;
        logoWidth: number;
        iou: number;
        overlapRatio: number;
      } | null => {
        const boxes = shatter.restBoxes;
        if (!boxes || boxes.length < 4 || viewWidth <= 0 || viewHeight <= 0) return null;
        shatter.group.updateWorldMatrix(true, false);
        const scratch = new Vector3();
        const project = (x: number, y: number): { x: number; y: number } => {
          scratch.set(x, y, 0).applyMatrix4(shatter.group.matrixWorld).project(camera);
          return { x: (scratch.x * 0.5 + 0.5) * viewWidth, y: (-scratch.y * 0.5 + 0.5) * viewHeight };
        };
        const widths: number[] = [];
        let minX = Infinity;
        let maxX = -Infinity;
        for (let i = 0; i < boxes.length; i += 4) {
          const corners = [
            project(boxes[i], boxes[i + 2]),
            project(boxes[i + 1], boxes[i + 2]),
            project(boxes[i + 1], boxes[i + 3]),
            project(boxes[i], boxes[i + 3]),
          ];
          let lo = Infinity;
          let hi = -Infinity;
          for (const corner of corners) {
            if (corner.x < lo) lo = corner.x;
            if (corner.x > hi) hi = corner.x;
            if (corner.x < minX) minX = corner.x;
            if (corner.x > maxX) maxX = corner.x;
          }
          widths.push(hi - lo);
        }
        widths.sort((a, b) => a - b);
        const logoWidth = maxX - minX;
        const medianWidth = widths[Math.floor(widths.length / 2)];
        const metrics = shatter.metrics();
        return {
          fragments: widths.length,
          medianRatio: logoWidth > 0 ? medianWidth / logoWidth : 0,
          medianWidth,
          logoWidth,
          iou: metrics ? metrics.iou : 0,
          overlapRatio: metrics ? metrics.overlapRatio : 1,
        };
      },
      // Test/tuning hook: restart the idle-dwell timer without freezing motion.
      noteActivity: (): void => shatterController.noteActivity(elapsed),
      shatter: () => ({
        ...shatterController.snapshot(elapsed),
        heroInView,
        pageVisible,
        pointerInside,
        running,
        elapsed,
      }),
    },
  });

  /* --- The single RAF loop ---------------------------------------------- */
  const frame = (now: number): void => {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    // Clamp BOTH ends: the first RAF timestamp can predate the engine's creation
    // clock, and a negative delta would rewind `elapsed` (shifting every phase and
    // silently delaying the idle-dwell trigger).
    const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
    lastTime = now;
    elapsed += dt;
    fpsMonitor.sample(dt);

    // 1) Damping + all spatial writes (animator is the single writer).
    interaction.update(dt);
    animator.update({
      dt,
      time: elapsed,
      reduced,
      scroll: scrollOffset,
      pointerX: interaction.pointer.x,
      pointerY: interaction.pointer.y,
    });

    // 1b) Shatter state machine + GPU uniform hand-off.
    shatterController.update({ dt, time: elapsed, reduced, pointerInside, heroInView, pageVisible });
    const shatterProgress = shatterController.progress;
    shatter.setProgress(shatterProgress);
    shatter.setMagnetic(shatterController.state === "reassembling");
    shatter.setTime(elapsed);
    // Solid pieces cross-fade out over the first ~150 ms and back in on the way
    // home, so the hand-off between solid mark and fragments is seamless.
    applySolidFade(1 - clamp(shatterProgress / 0.22, 0, 1));
    const stage = shatterController.state;
    if (stage !== lastStageAttr) {
      lastStageAttr = stage;
      canvas.dataset.stage = stage;
      canvas.dataset.explode = legacyExplodeState(stage);
    }

    // 2) Render (also refreshes world matrices).
    renderer.render(scene, camera);

    // 3) Post-render with fresh matrices: hotspot projection + hover poll.
    ribbon.anchor.getWorldPosition(anchorWorld);
    projectToContainerPx(anchorWorld, camera, viewWidth, viewHeight, screen);
    onAnchor?.(screen.x, screen.y, screen.visible);

    const hit = interaction.poll(camera, pickTargets);
    const hoveredRoot = hit ? (rootByMesh.get(hit) ?? null) : null;
    applyHover(dt, hoveredRoot);

    if (!firstFrameDone) {
      firstFrameDone = true;
      onFirstFrame?.();
    }
  };

  const start = (): void => {
    if (disposed || running) return;
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  };

  const pause = (): void => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
  };

  const resume = (): void => {
    if (disposed || running) return;
    start();
  };

  /* --- Teardown ---------------------------------------------------------- */
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    pause();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("pointermove", onActivity);
    window.removeEventListener("keydown", onActivity);
    window.removeEventListener("wheel", onActivity);
    interaction.dispose();
    fpsMonitor.dispose();
    hoverAmounts.clear();
    shatter.dispose();
    ribbon.dispose();
    supports.dispose();
    lighting.dispose();
    environment.dispose(); // free PMREM RT before the renderer goes
    disposeObject(scene);
    renderer.dispose();
    renderer.forceContextLoss(); // frees the WebGL context immediately
    canvas.remove();
  };

  return {
    canvas,
    start,
    pause,
    resume,
    setTier,
    setTheme: applyTheme,
    setReducedMotion: (value: boolean) => {
      reduced = value;
      shatterController.setReducedMotion(value);
      applyTierBudget();
    },
    setPointerInside: (value: boolean) => {
      pointerInside = value;
    },
    setHeroInView: (value: boolean) => {
      heroInView = value;
    },
    setPageVisible: (value: boolean) => {
      pageVisible = value;
    },
    noteActivity: () => shatterController.noteActivity(elapsed),
    tap: () => {
      if (reduced) return; // reduced motion never shatters
      shatterController.tap(elapsed);
    },
    forceShatterState: (state: ShatterState | null) => {
      if (reduced && state !== null) return;
      shatterController.force(state);
    },
    resize,
    dispose,
  };
}
