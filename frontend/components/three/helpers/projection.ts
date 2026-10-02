import { Camera, Vector3 } from "three";

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

const scratch = new Vector3();

/**
 * Project a world-space position into container-relative CSS pixels.
 *
 * Writes into `out` (no per-frame allocation). `visible` is false when the
 * point sits behind the camera (NDC z > 1) — the overlay hides itself then.
 */
export function projectToContainerPx(
  world: Vector3,
  camera: Camera,
  width: number,
  height: number,
  out: ScreenPoint,
): ScreenPoint {
  scratch.copy(world).project(camera);
  out.x = (scratch.x * 0.5 + 0.5) * width;
  out.y = (-scratch.y * 0.5 + 0.5) * height;
  out.visible = scratch.z < 1;
  return out;
}
