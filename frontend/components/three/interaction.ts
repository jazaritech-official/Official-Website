/**
 * Pointer interaction (spec §25/§28): normalized tracking, damped parallax
 * state and a throttled raycast against a small pick list.
 *
 * Listeners attach to the hero container (the canvas itself is
 * `pointer-events: none`, so nothing here can block links, forms or scroll).
 * Touch / coarse pointers: parallax and raycast stay off entirely.
 */

import { Raycaster, Vector2, type Camera, type Object3D } from "three";
import { damp } from "./helpers/math";

export interface InteractionSettings {
  /** Pointer-follow parallax allowed (false on touch / reduced motion). */
  parallax: boolean;
  /** Hover raycast allowed (tier budget). */
  hover: boolean;
}

export interface InteractionHandle {
  /** Device capability: fine pointer (mouse/trackpad) — not touch. */
  readonly finePointer: boolean;
  readonly settings: InteractionSettings;
  /** Damped pointer -1..1 — read by the animator every frame. */
  readonly pointer: { x: number; y: number };
  /** Advance damping toward the latest pointer target. */
  update(dt: number): void;
  /**
   * Throttled raycast (≈14 Hz, only after pointer movement). `targets` is a
   * pre-flattened list (the engine builds it once per tier), so the cast runs
   * with `recursive:false` and never re-walks the scene graph.
   */
  poll(camera: Camera, targets: Object3D[]): Object3D | null;
  dispose(): void;
}

const POLL_INTERVAL_MS = 70;
const IDLE_REFRESH_MS = 160;

export function createInteraction(container: HTMLElement): InteractionHandle {
  const finePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: fine)").matches;

  const settings: InteractionSettings = { parallax: finePointer, hover: finePointer };
  const pointer = { x: 0, y: 0 };
  const ndc = new Vector2();
  const raycaster = new Raycaster();
  raycaster.far = 40;

  let targetX = 0;
  let targetY = 0;
  let moved = false;
  let lastPoll = 0;
  let hovered: Object3D | null = null;

  const onPointerMove = (event: PointerEvent): void => {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    targetX = x;
    targetY = y;
    ndc.set(x, -y);
    moved = true;
  };

  const onPointerLeave = (): void => {
    targetX = 0;
    targetY = 0;
    moved = true; // one last poll so the highlight clears
  };

  container.addEventListener("pointermove", onPointerMove, { passive: true });
  container.addEventListener("pointerleave", onPointerLeave);

  return {
    finePointer,
    settings,
    pointer,
    update(dt): void {
      const lambda = settings.parallax ? 2.8 : 7; // snap home when disabled
      pointer.x = damp(pointer.x, settings.parallax ? targetX : 0, lambda, dt);
      pointer.y = damp(pointer.y, settings.parallax ? targetY : 0, lambda, dt);
    },
    poll(camera, targets): Object3D | null {
      if (!settings.hover) return null;
      const now = performance.now();
      if (now - lastPoll < POLL_INTERVAL_MS) return hovered;
      if (!moved && now - lastPoll < IDLE_REFRESH_MS) return hovered;

      lastPoll = now;
      moved = false;
      raycaster.setFromCamera(ndc, camera);
      // Pre-flattened targets → recursive:false avoids re-traversing per cast.
      const hits = raycaster.intersectObjects(targets, false);
      hovered = hits.length > 0 ? hits[0].object : null;
      return hovered;
    },
    dispose(): void {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
    },
  };
}
