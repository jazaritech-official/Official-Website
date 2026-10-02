/**
 * Studio lighting rig — as few lights as possible, zero shadow casters
 * (grounding comes from the fake contact shadow, spec §22/§65).
 *
 * Hemisphere fill + key + technology-blue rim + one tiny green accent point.
 * `apply()` updates colors/intensities in place on theme switch.
 *
 * TUNING: positions live here; intensities/colors come from `theme.ts` palettes.
 */

import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PointLight,
} from "three";
import type { ScenePalette } from "./theme";

export interface LightingRig {
  group: Group;
  /** Re-style the rig for a palette — never rebuilds. */
  apply(palette: ScenePalette): void;
  dispose(): void;
}

export function createLighting(initial: ScenePalette): LightingRig {
  const group = new Group();

  const hemisphere = new HemisphereLight(initial.hemiSky, initial.hemiGround, initial.hemiIntensity);

  const key = new DirectionalLight(initial.keyColor, initial.keyIntensity);
  key.position.set(4.5, 6.5, 5.5);

  const rim = new DirectionalLight(initial.rimColor, initial.rimIntensity);
  rim.position.set(-5.5, 2.5, -4.5);

  const accent = new PointLight(initial.accentColor, initial.accentIntensity, 8, 2);
  accent.position.set(2.6, 3.1, 1.8);

  group.add(hemisphere, key, rim, accent);

  return {
    group,
    apply(palette): void {
      hemisphere.color.set(palette.hemiSky);
      hemisphere.groundColor.set(palette.hemiGround);
      hemisphere.intensity = palette.hemiIntensity;

      key.color.set(palette.keyColor);
      key.intensity = palette.keyIntensity;

      rim.color.set(palette.rimColor);
      rim.intensity = palette.rimIntensity;

      accent.color.set(palette.accentColor);
      accent.intensity = palette.accentIntensity;
    },
    dispose(): void {
      // Lights hold no GPU resources; dropping references is sufficient.
      group.clear();
    },
  };
}
