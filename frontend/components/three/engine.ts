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
import type { EngineHandle, EngineOptions, QualityTier, SceneTheme } from "./types";
import { disposeObject } from "./helpers/disposeScene";
import { PALETTES, readPageBackground } from "./theme";
import { createFpsMonitor, renderConfig, type FpsMonitor } from "./quality";
import { clamp, damp } from "./helpers/math";
import { createEnvironment, type SceneEnvironment } from "./environment";
import { createLighting, type LightingRig } from "./lighting";
import { createJazariRibbon, type JazariRibbon } from "./createRibbonPieces";
import { createSupportSystem, type SupportSystem } from "./createTechObjects";
import { createAnimator, type Animator } from "./animation";
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
  const onScroll = (): void => {
    scrollOffset = clamp(window.scrollY, 0, SCROLL_RANGE_PX) / SCROLL_RANGE_PX;
  };
  window.addEventListener("scroll", onScroll, { passive: true });

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

  const composition = new Group(); // scroll + primary parallax shift this unit
  composition.add(ribbon.group, supports.group);
  scene.add(composition);

  const animator: Animator = createAnimator({ ribbon, supports, composition, camera });
  const interaction: InteractionHandle = createInteraction(container);

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
    hoverAmounts.clear(); // stale keys would target now-hidden roots
    rebuildPickTargets(); // visible-object set changed
    resize();
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

  /* --- The single RAF loop ---------------------------------------------- */
  const frame = (now: number): void => {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    const dt = Math.min((now - lastTime) / 1000, 0.1); // clamp tab-switch spikes
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
    interaction.dispose();
    fpsMonitor.dispose();
    hoverAmounts.clear();
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
      applyTierBudget();
    },
    resize,
    dispose,
  };
}
