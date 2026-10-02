/**
 * Motion system — assembly state machine, idle hierarchy, pointer parallax
 * and scroll response. One writer per frame (the engine's single RAF loop).
 *
 * Transform composition (spec §64): every frame final transforms are computed
 * from BASE + idle + pointer + scroll contributions — never mutated
 * incrementally, so toggling reduced motion or themes can't accumulate drift.
 *
 * TUNING: ASSEMBLY_DURATION, stagger and all amplitudes live here.
 */

import type { Group, PerspectiveCamera } from "three";
import type { JazariRibbon } from "./createRibbonPieces";
import type { SupportSystem } from "./createTechObjects";
import type { ScenePhase } from "./types";
import { clamp, damp, easeOutCubic, lerp } from "./helpers/math";

export const ASSEMBLY_DURATION = 1.4; // seconds — short and premium
const PIECE_STAGGER = 0.08; // fraction of duration between piece starts
const LEAF_START = 0.55; // leaf joins the assembly late

export interface MotionFrame {
  /** Delta seconds (clamped upstream). */
  dt: number;
  /** Total elapsed seconds — deterministic idle clocks. */
  time: number;
  reduced: boolean;
  /** Hero scroll progress 0..1. */
  scroll: number;
  /** Damped pointer -1..1 (0 when parallax is off). */
  pointerX: number;
  pointerY: number;
}

export interface Animator {
  readonly phase: ScenePhase;
  update(frame: MotionFrame): void;
}

interface PieceBase {
  rotX: number;
  rotZ: number;
  /** Assembled target position (may carry a small z-stagger). */
  posX: number;
  posY: number;
  posZ: number;
  startRotZ: number;
  startPos: { x: number; y: number; z: number };
}

export function createAnimator(dependencies: {
  ribbon: JazariRibbon;
  supports: SupportSystem;
  composition: Group;
  camera: PerspectiveCamera;
}): Animator {
  const { ribbon, supports, composition, camera } = dependencies;

  // Capture assembled targets once — the single source of truth for BASE.
  const pieceBases: PieceBase[] = ribbon.pieces.map((mesh, index) => ({
    rotX: mesh.rotation.x,
    rotZ: mesh.rotation.z,
    posX: mesh.position.x,
    posY: mesh.position.y,
    posZ: mesh.position.z,
    startRotZ: ribbon.specs[index].startRotationZ,
    startPos: {
      x: ribbon.specs[index].startPosition.x,
      y: ribbon.specs[index].startPosition.y,
      z: ribbon.specs[index].startPosition.z,
    },
  }));
  const leafBase = {
    x: ribbon.leaf.position.x,
    y: ribbon.leaf.position.y,
    z: ribbon.leaf.position.z,
    rotZ: ribbon.leaf.rotation.z,
  };
  const cameraBase = { x: camera.position.x, y: camera.position.y };

  let progress = 0;
  let phase: ScenePhase = "assembling";

  const update = (frame: MotionFrame): void => {
    const { dt, time, reduced, scroll, pointerX, pointerY } = frame;

    /* --- Assembly state machine (deterministic, elapsed-time driven) ----- */
    if (phase === "assembling") {
      if (reduced) {
        progress = 1; // no assembly animation under reduced motion
      } else {
        progress = clamp(progress + dt / ASSEMBLY_DURATION, 0, 1);
      }
      if (progress >= 1) phase = "idle";
    }

    const amplitude = reduced ? 0 : 1;
    const span = 1 - 3 * PIECE_STAGGER;

    ribbon.pieces.forEach((piece, index) => {
      const base = pieceBases[index];
      const t = easeOutCubic(clamp((progress - index * PIECE_STAGGER) / span, 0, 1));

      // BASE (assembled) blended from the assembly start offset…
      let x = lerp(base.startPos.x, base.posX, t);
      let y = lerp(base.startPos.y, base.posY, t);
      const z = lerp(base.startPos.z, base.posZ, t);
      let rotZ = lerp(base.startRotZ, base.rotZ, t);
      const rotX = base.rotX;

      // …plus idle float/wobble once assembled.
      if (phase === "idle") {
        y += Math.sin(time * 0.75 + index * 1.6) * 0.045 * amplitude;
        rotZ += Math.sin(time * 0.5 + index) * 0.012 * amplitude;
        x += Math.cos(time * 0.42 + index * 2.1) * 0.02 * amplitude;
      }

      piece.position.set(x, y, z);
      piece.rotation.set(rotX, 0, rotZ);
    });

    // Leaf settles last (spec §18 step 7).
    const leafT = easeOutCubic(clamp((progress - LEAF_START) / (1 - LEAF_START), 0, 1));
    const leafIdle = phase === "idle" ? Math.sin(time * 0.9) * 0.05 * amplitude : 0;
    ribbon.leaf.position.set(
      lerp(leafBase.x + 0.55, leafBase.x, leafT),
      lerp(leafBase.y + 0.95, leafBase.y, leafT) + leafIdle,
      lerp(leafBase.z + 1.1, leafBase.z, leafT),
    );
    ribbon.leaf.rotation.z = leafBase.rotZ + (1 - leafT) * 0.6 + (phase === "idle" ? Math.sin(time * 0.8) * 0.04 * amplitude : 0);
    const leafScale = lerp(0.35, 1, leafT);
    ribbon.leaf.scale.setScalar(leafScale);

    /* --- Idle hierarchy (spec §62): ribbon slow, supports faster, haze --- */
    ribbon.group.rotation.z = time * 0.05 * amplitude;
    ribbon.group.scale.setScalar(1 + Math.sin(time * 0.6) * 0.012 * amplitude);

    supports.roots.forEach((root, index) => {
      const base = supports.bases[index];
      root.position.y = base.position.y + Math.sin(time * 0.6 + base.phase) * base.bob * amplitude;
      if (index === 3) {
        root.rotation.z = time * base.spin * 0.8 * amplitude; // gear spins in-plane
      } else {
        root.rotation.y = time * base.spin * amplitude;
      }
    });
    supports.points.rotation.z = time * 0.012 * amplitude;

    /* --- Pointer parallax (damped, disabled under reduced motion) -------- */
    // Depth hierarchy: composition (less) → supports (more) → camera (least).
    composition.rotation.y = damp(composition.rotation.y, pointerX * 0.09, 3, dt);
    composition.rotation.x = damp(composition.rotation.x, -pointerY * 0.06, 3, dt);
    supports.group.rotation.y = damp(supports.group.rotation.y, pointerX * 0.07, 3, dt);
    supports.group.position.x = damp(supports.group.position.x, pointerX * 0.14, 2.6, dt);
    camera.position.x = damp(camera.position.x, cameraBase.x + pointerX * 0.16, 2.4, dt);
    camera.position.y = damp(camera.position.y, cameraBase.y - pointerY * 0.1, 2.4, dt);

    /* --- Scroll (hero range only): drift, slight shrink, depth ----------- */
    composition.position.y = -scroll * 0.55 * amplitude;
    composition.scale.setScalar((1 - scroll * 0.08) * amplitude + (1 - amplitude));
  };

  return {
    get phase(): ScenePhase {
      return phase;
    },
    update,
  };
}
