/**
 * Shared contracts for the Jazari hero WebGL system.
 *
 * Type-only file — importing it never pulls `three` into an eager bundle.
 */

/** Adaptive quality tiers (see `quality.ts`). `static` = no WebGL at all. */
export type QualityTier = "high" | "medium" | "low" | "static";

/** Resolved theme, mirrored from the existing `useTheme` system. */
export type SceneTheme = "light" | "dark";

/** Lifecycle of the hero scene reported to the DOM overlay. */
export type SceneStatus = "loading" | "ready" | "fallback";

/** Assembly state machine: initializing → assembling → idle. */
export type ScenePhase = "initializing" | "assembling" | "idle";

/**
 * Hero shatter state machine (additive to the assembly phase).
 * `assembled` = the solid logo is whole; `shattering`/`reassembling` are the
 * transitions; `floating` = fully exploded neon shards. */
export type ShatterState = "assembled" | "shattering" | "floating" | "reassembling";

/** Live shatter telemetry written to `canvas.dataset` for the harness. */
export interface ShatterDebug {
  state: ShatterState;
  shards: number;
}

/**
 * Hotspot sink — projected anchor position in container-relative CSS pixels.
 * Called from the render loop; implementations must write straight to the DOM
 * (refs) and never trigger React renders.
 */
export type AnchorUpdate = (x: number, y: number, visible: boolean) => void;

export interface EngineOptions {
  /** Sized container the canvas fills (absolute inset-0 layer). */
  container: HTMLElement;
  theme: SceneTheme;
  tier: Exclude<QualityTier, "static">;
  reducedMotion: boolean;
  /** Fired once after the first successful `renderer.render`. */
  onFirstFrame?: () => void;
  /** Per-frame hotspot projection sink (optional). */
  onAnchor?: AnchorUpdate;
}

export interface EngineHandle {
  /** Begin the single RAF loop. Idempotent. */
  start(): void;
  /** Stop the RAF loop (tab hidden / off-screen / context lost). Idempotent. */
  pause(): void;
  /** Resume the RAF loop with a fresh delta baseline. Idempotent. */
  resume(): void;
  /** Re-apply renderer/scene parameters for a different quality tier. */
  setTier(tier: Exclude<QualityTier, "static">): void;
  /** Update palette, lights, fog and environment in place — never rebuilds. */
  setTheme(theme: SceneTheme): void;
  /** Reduced-motion switches land in place (idle motion amplitude → ~0). */
  setReducedMotion(value: boolean): void;
  /** Manual resize (ResizeObserver calls this). */
  resize(): void;
  /** Full teardown: RAF, listeners, geometries, materials, textures, renderer. */
  dispose(): void;
  /** The rendered canvas (context-loss listeners attach here). */
  readonly canvas: HTMLCanvasElement;

  /* --- Hero shatter inputs (all no-ops under reduced motion) ------------- */
  /** Fine pointer entered/left the hero visual column. */
  setPointerInside(value: boolean): void;
  /** Hero is at least ~50% in the viewport. */
  setHeroInView(value: boolean): void;
  /** Document visibility — hidden tabs never start an idle shatter. */
  setPageVisible(value: boolean): void;
  /** Any pointer/scroll/key input — resets the idle dwell timer. */
  noteActivity(): void;
  /** Touch tap on the visual column — toggles shatter. */
  tap(): void;
  /** Debug/test hook: force a state (null releases the override). */
  forceShatterState(state: ShatterState | null): void;
}
