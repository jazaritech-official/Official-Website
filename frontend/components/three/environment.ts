/**
 * Procedural environment lighting — RoomEnvironment baked through PMREMGenerator
 * (no downloaded HDRIs, spec §8/§21). Generated once per renderer; dark/light
 * differences are applied through `scene.environmentIntensity` so a theme
 * switch never re-bakes the environment.
 */

import { PMREMGenerator, type Scene, type Texture, type WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface SceneEnvironment {
  /** PMREM-filtered equirect texture — assign to `scene.environment`. */
  readonly texture: Texture | null;
  /** Update `scene.environmentIntensity` from palette × tier budget. */
  applyIntensity(scene: Scene, intensity: number): void;
  /** Free the render target. Call before `renderer.dispose()` — owns its RT. */
  dispose(): void;
}

export function createEnvironment(renderer: WebGLRenderer): SceneEnvironment {
  let renderTarget: ReturnType<PMREMGenerator["fromScene"]> | null = null;

  try {
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    renderTarget = pmrem.fromScene(room, 0.04);
    // The source room is only an input to the bake — dispose immediately.
    room.dispose();
    pmrem.dispose();
  } catch {
    // Environment is an enhancement — scene still renders with direct lights.
    renderTarget = null;
  }

  return {
    texture: renderTarget?.texture ?? null,
    applyIntensity(scene, intensity): void {
      scene.environmentIntensity = intensity;
    },
    dispose(): void {
      renderTarget?.dispose();
      renderTarget = null;
    },
  };
}
