/** Tiny deterministic math helpers for the hero scene. */

export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Frame-rate independent exponential damping (Lerp's "smoothed" cousin).
 * `lambda` ≈ 2 is sleepy, ≈ 8 is responsive; `dt` is seconds.
 */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Hermite smoothstep over 0..1. */
export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** easeOutCubic — the assembly curve (fast start, premium settle). */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/**
 * Deterministic pseudo-random in [-1, 1] from an integer seed — keeps decor
 * placement identical between reloads (art direction, not noise).
 */
export const seededNoise = (seed: number): number => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};
