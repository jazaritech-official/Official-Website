/**
 * Adaptive quality system — tier detection, per-tier budgets and a lightweight
 * FPS monitor with hysteresis (poor *and sustained* FPS triggers a downgrade;
 * one frame spike never does, and tiers never oscillate).
 */

import type { QualityTier } from "./types";

export interface QualityConfig {
  /** Renderer pixel-ratio cap (spec budget: `Math.min(dpr, 1.75)` at HIGH). */
  pixelRatioCap: number;
  /** Number of supporting tech objects to build (ribbon is always built). */
  supportCount: number;
  /** Environment-map intensity multiplier for reflections. */
  environmentIntensity: number;
  /** Raycast hover interactions allowed. */
  hover: boolean;
  /** Atmospheric point count (0 = none). */
  particleCount: number;
  /** Soft spot particles enabled. */
  atmospheric: boolean;
  /**
   * Hero shatter budget — number of instanced neon shards sampled inside the
   * real logo silhouette. 0 disables the shatter field entirely (static /
   * reduced-motion). The FPS downgrade path reduces this too (see engine).
   */
  shardCount: number;
}

export type RenderQualityConfig = QualityConfig & { tier: Exclude<QualityTier, "static"> };

/**
 * TUNING: per-tier budgets live here — object counts, pixel ratio, reflection
 * strength. Adjust these numbers to restyle the quality ladder.
 */
export const QUALITY: Record<Exclude<QualityTier, "static">, QualityConfig> = {
  high: {
    pixelRatioCap: 1.75,
    supportCount: 5,
    environmentIntensity: 1,
    hover: true,
    particleCount: 140,
    atmospheric: true,
    shardCount: 1000,
  },
  medium: {
    pixelRatioCap: 1.5,
    supportCount: 3,
    environmentIntensity: 0.85,
    hover: true,
    particleCount: 70,
    atmospheric: true,
    shardCount: 500,
  },
  low: {
    pixelRatioCap: 1.25,
    supportCount: 1,
    environmentIntensity: 0.65,
    hover: false,
    particleCount: 0,
    atmospheric: false,
    shardCount: 200,
  },
};

export const renderConfig = (tier: Exclude<QualityTier, "static">): RenderQualityConfig => ({
  tier,
  ...QUALITY[tier],
});

/**
 * Initial tier from device signals: coarse pointer / small viewport phones
 * never receive the desktop scene; modest CPU/RAM steps down; everything else
 * starts HIGH and may be demoted at runtime by the FPS monitor.
 */
export function detectInitialTier(): QualityTier {
  if (typeof navigator === "undefined") return "high";

  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const small = typeof window !== "undefined" && window.innerWidth < 768;

  if (coarse || small) {
    return cores >= 8 && (memory === undefined || memory >= 6) ? "medium" : "low";
  }
  if (cores <= 4 || (memory !== undefined && memory <= 4)) return "low";
  if (cores <= 6 || (memory !== undefined && memory <= 6)) return "medium";
  return "high";
}

export interface FpsMonitor {
  /** Feed the elapsed seconds of every rendered frame. */
  sample(dtSeconds: number): void;
  dispose(): void;
}

interface FpsMonitorOptions {
  /** Sampling window length. Default 3 s — long enough to ignore spikes. */
  windowMs?: number;
  /** FPS considered poor within a window. Default 42. */
  poorFps?: number;
  /** Consecutive poor windows required before downgrading. Default 2. */
  poorWindows?: number;
  /** Cooldown after a downgrade so tiers never oscillate. Default 10 s. */
  cooldownMs?: number;
}

/**
 * Bounded-window FPS sampler: counts frames over `windowMs`, evaluates once
 * per window, requires `poorWindows` consecutive bad windows, then enforces a
 * cooldown before it may fire again. Downgrade-only by design — the scene
 * never auto-upgrades mid-session.
 */
export function createFpsMonitor(onPoor: () => void, options: FpsMonitorOptions = {}): FpsMonitor {
  const windowMs = options.windowMs ?? 3000;
  const poorFps = options.poorFps ?? 42;
  const poorWindows = options.poorWindows ?? 2;
  const cooldownMs = options.cooldownMs ?? 10_000;

  let frames = 0;
  let elapsedMs = 0;
  let consecutivePoor = 0;
  let cooldownUntil = 0;

  return {
    sample(dtSeconds: number): void {
      const now = performance.now();
      frames += 1;
      elapsedMs += dtSeconds * 1000;
      if (elapsedMs < windowMs) return;

      const fps = (frames * 1000) / elapsedMs;
      frames = 0;
      elapsedMs = 0;

      if (fps < poorFps) {
        consecutivePoor += 1;
        if (consecutivePoor >= poorWindows && now >= cooldownUntil) {
          consecutivePoor = 0;
          cooldownUntil = now + cooldownMs;
          onPoor();
        }
      } else {
        consecutivePoor = 0;
      }
    },
    dispose(): void {
      frames = 0;
      elapsedMs = 0;
      consecutivePoor = 0;
    },
  };
}
