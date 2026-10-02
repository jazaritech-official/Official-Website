/**
 * Theme bridge — maps the site's design tokens onto the WebGL scene.
 *
 * `useTheme` (existing system) remains the single source of truth; this module
 * only translates `light | dark` into palette values and reads the live CSS
 * custom properties so fog/background always match the page exactly.
 *
 * TUNING: brand colors live in `BRAND`, per-theme light/palette values live in
 * `PALETTES`. Nothing else in the codebase hardcodes scene colors.
 */

import type { SceneTheme } from "./types";

/** Exact brand system from globals.css — the only hardcoded scene colors. */
export const BRAND = {
  navy: "#212c65", // Deep Navy — primary anchor
  navyDeep: "#1a2352", // darker navy variant for ribbon depth
  blue: "#3d76bb", // Technology Blue — primary accent
  blueSoft: "#5d97da", // light-mode accent tint
  blueDeep: "#2f5f9e", // deeper blue variant
  green: "#95c93d", // Growth Green — MICRO accent only
  slate: "#a7b3c8", // Official Slate — secondary text
  white: "#ffffff",
  darkBg: "#0a0f24", // navy-black, never pure black
  darkSurface: "#111838",
} as const;

export interface ScenePalette {
  /** Fog color — always the page background so depth blends seamlessly. */
  fog: string;
  /** Hemisphere fill. */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** Key light. */
  keyColor: string;
  keyIntensity: number;
  /** Technology-blue rim light. */
  rimColor: string;
  rimIntensity: number;
  /** Micro green accent point light. */
  accentColor: string;
  accentIntensity: number;
  /** Environment-map multiplier (dark mode dials reflections down). */
  environmentIntensity: number;
  /** Tone-mapping exposure. */
  exposure: number;
  /** Fake contact-shadow / floor-haze tint. */
  shadowColor: string;
  shadowOpacity: number;
}

/**
 * Light = premium white studio product photography (dark navy silhouettes,
 * blue reflections, soft contact shadow).
 * Dark = cinematic Jazari technology (navy-black, blue rim, tiny green glow).
 */
export const PALETTES: Record<SceneTheme, ScenePalette> = {
  light: {
    fog: BRAND.white,
    hemiSky: "#eef3fb",
    hemiGround: "#dfe6f2",
    hemiIntensity: 0.85,
    keyColor: "#ffffff",
    keyIntensity: 1.35,
    rimColor: BRAND.blue,
    rimIntensity: 1.1,
    accentColor: BRAND.green,
    accentIntensity: 0.25,
    environmentIntensity: 1,
    exposure: 1.05,
    shadowColor: BRAND.navy,
    shadowOpacity: 0.16,
  },
  dark: {
    fog: BRAND.darkBg,
    hemiSky: "#182256",
    hemiGround: BRAND.darkBg,
    hemiIntensity: 0.6,
    keyColor: "#a8c4e8",
    keyIntensity: 0.85,
    rimColor: BRAND.blue,
    rimIntensity: 2.1,
    accentColor: BRAND.green,
    accentIntensity: 0.55,
    environmentIntensity: 0.55,
    exposure: 1,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
  },
};

/**
 * Live page background from the design tokens (falls back to the palette's own
 * fog color when CSS variables are unavailable). Reading the computed value
 * keeps the WebGL fog matched to `--background` in both themes — including any
 * future token change — without rebuilding the scene.
 */
export function readPageBackground(theme: SceneTheme): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    if (value) return value;
  } catch {
    // getComputedStyle unavailable — palette fallback below.
  }
  return PALETTES[theme].fog;
}
