/**
 * Hero explosion state machine — pure logic, no Three.js, no DOM.
 *
 *   assembled → separating → fracturing → floating → reassembling → assembled
 *
 *   A separating   the five real logo parts pull apart as one exploded diagram
 *   B fracturing   each fragment takes its own path — the Voronoi cracks open
 *   C floating     full drift + tumble (dwell, then auto-return)
 *   D reassembling magnetic snap home (slight overshoot, then settle)
 *
 * The progress scale stays 0 → 1 (assembled → fully exploded) so the render
 * loop, the solid-logo cross-fade and every existing hook keep their meaning:
 *   0 … SEPARATE_END   stage A
 *   SEPARATE_END … 1   stage B
 *   1                  stage C
 *   1 → 0              stage D
 *
 * The DOM keeps TWO views of it:
 *   `canvas.dataset.stage`   the five new names, verbatim
 *   `canvas.dataset.explode` the legacy names (see `legacyExplodeState`), so
 *                            every pre-existing assertion and integration keeps
 *                            working unchanged.
 *
 * Triggers (any one starts an explosion):
 *   a. a fine pointer enters the hero visual column,
 *   b. idle dwell — the hero is at least ~50% in view, the tab is visible and
 *      there has been no pointer/scroll/key input for ~3 s,
 *   c. a touch tap on the visual column (toggles).
 *
 * It reassembles on pointer leave, on scroll, or after a max hold (~8 s); a
 * ~10 s cool-down prevents an idle-triggered explosion from looping annoyingly.
 * Reduced motion never explodes.
 *
 * TUNING: all timings below.
 */

import { clamp } from "./helpers/math";
import type { LegacyShatterState, ShatterState, ShatterStateInput } from "./types";

export const SHATTER_DURATION = 0.75; // s — assembled → floating (stages A + B)
export const REASSEMBLE_DURATION = 0.85; // s — floating → assembled (stage D)
/** Fraction of `SHATTER_DURATION` spent in stage A (the exploded diagram). */
export const SEPARATE_END = 0.42;
export const IDLE_DWELL = 3; // s of no input before the idle trigger
export const MAX_HOLD = 8; // s an explosion may stay open before auto-return
export const SHATTER_COOLDOWN = 10; // s after an idle/touch explosion

/** Where a forced (test) state parks the timeline — deterministic captures. */
const FORCED_PROGRESS: Record<ShatterState, number> = {
  assembled: 0,
  separating: 0.3,
  fracturing: 0.75,
  floating: 1,
  reassembling: 0.5,
};

/** Legacy `shattering` still means "in transition" — park it in stage B. */
export function canonicalState(input: ShatterStateInput): ShatterState {
  return input === "shattering" ? "fracturing" : input;
}

/** The value written to `canvas.dataset.explode` (pre-rebuild vocabulary). */
export function legacyExplodeState(state: ShatterState): LegacyShatterState {
  return state === "separating" || state === "fracturing" ? "shattering" : state;
}

export type ShatterReason = "pointer" | "idle" | "touch";

export interface ShatterFrame {
  dt: number;
  time: number;
  reduced: boolean;
  /** Fine pointer is inside the hero visual column. */
  pointerInside: boolean;
  /** Hero is at least ~50% in the viewport. */
  heroInView: boolean;
  /** Document is visible (not a hidden tab). */
  pageVisible: boolean;
}

export interface ShatterController {
  readonly state: ShatterState;
  readonly progress: number;
  readonly reason: ShatterReason | null;
  update(frame: ShatterFrame): void;
  setReducedMotion(value: boolean): void;
  /** Any pointer/key input — resets the idle dwell timer only. */
  noteActivity(time: number): void;
  /** A scroll past the small threshold — resets idle AND closes an open explosion. */
  scroll(time: number): void;
  /** Touch tap on the visual column (toggle). */
  tap(time: number): void;
  /** Debug/test override; `null` releases it. Legacy `shattering` accepted. */
  force(state: ShatterStateInput | null): void;
  /** Read-only diagnostic snapshot (no secrets, test/tuning aid). */
  snapshot(time: number): ShatterSnapshot;
}

export interface ShatterSnapshot {
  state: ShatterState;
  progress: number;
  reason: ShatterReason | null;
  reduced: boolean;
  forced: ShatterState | null;
  idleFor: number;
  cooldownFor: number;
}

export function createShatterController(): ShatterController {
  let state: ShatterState = "assembled";
  let progress = 0;
  let reason: ShatterReason | null = null;
  let reduced = false;

  let beginTime = 0;
  let lastActivity = 0;
  let cooldownUntil = 0;
  let forced: ShatterState | null = null;
  /** Set by a touch tap; consumed on the next update. */
  let tapPending = false;
  /** A pointer/touch explosion that the user explicitly asked to release. */
  let releaseRequested = false;
  let scrollRelease = false;

  const begin = (next: ShatterReason, time: number): void => {
    if (state !== "assembled") return;
    reason = next;
    beginTime = time;
    state = "separating";
    releaseRequested = false;
    scrollRelease = false;
  };

  const setForced = (next: ShatterState): void => {
    forced = next;
    state = next;
    reason = "pointer";
    progress = FORCED_PROGRESS[next];
    releaseRequested = false;
    scrollRelease = false;
  };

  const update = (frame: ShatterFrame): void => {
    const { dt, time, pointerInside, heroInView, pageVisible } = frame;
    reduced = frame.reduced;

    if (forced) {
      // A forced state holds the timeline exactly where the caller put it, so
      // stage captures are deterministic instead of racing the clock.
      progress = FORCED_PROGRESS[forced];
      return;
    }

    // Advance the transition currently in flight (stages A → B → C, then D).
    if (state === "separating" || state === "fracturing") {
      progress += dt / SHATTER_DURATION;
      if (progress >= 1) {
        progress = 1;
        state = "floating";
      } else {
        state = progress >= SEPARATE_END ? "fracturing" : "separating";
      }
    } else if (state === "reassembling") {
      progress -= dt / REASSEMBLE_DURATION;
      if (progress <= 0) {
        progress = 0;
        state = "assembled";
        reason = null;
      }
    }

    if (reduced) {
      // Never explode: collapse to assembled immediately and stop.
      if (state !== "assembled") {
        state = "reassembling";
        progress = clamp(progress, 0, 1);
      }
      return;
    }

    if (tapPending) {
      tapPending = false;
      if (state === "assembled") {
        if (time >= cooldownUntil) begin("touch", time);
      } else {
        releaseRequested = true;
      }
    }

    if (state === "assembled") {
      if (time < cooldownUntil) return;
      if (pointerInside) begin("pointer", time);
      else if (heroInView && pageVisible && time - lastActivity >= IDLE_DWELL) begin("idle", time);
      return;
    }

    // separating | fracturing | floating — decide whether to go home.
    const held = time - beginTime;
    const pointerGone = reason === "pointer" && !pointerInside;
    const idleDone = reason === "idle" && (!heroInView || !pageVisible);
    if (pointerGone || idleDone || releaseRequested || scrollRelease || held >= MAX_HOLD) {
      if (state === "separating" || state === "fracturing" || state === "floating") {
        state = "reassembling";
        if (reason !== "pointer") cooldownUntil = time + SHATTER_COOLDOWN;
      }
    }
  };

  return {
    get state(): ShatterState {
      return state;
    },
    get progress(): number {
      return progress;
    },
    get reason(): ShatterReason | null {
      return reason;
    },
    update,
    setReducedMotion(value: boolean): void {
      reduced = value;
    },
    noteActivity(time: number): void {
      lastActivity = time;
    },
    scroll(time: number): void {
      lastActivity = time;
      // A real scroll always wins — it also releases a forced (test) state.
      forced = null;
      if (state === "separating" || state === "fracturing" || state === "floating") {
        scrollRelease = true;
      }
    },
    tap(time: number): void {
      lastActivity = time;
      tapPending = true;
    },
    force(next: ShatterStateInput | null): void {
      if (next === null) {
        forced = null;
        return;
      }
      setForced(canonicalState(next));
    },
    snapshot(time: number): ShatterSnapshot {
      return {
        state,
        progress,
        reason,
        reduced,
        forced,
        idleFor: Math.max(0, time - lastActivity),
        cooldownFor: Math.max(0, cooldownUntil - time),
      };
    },
  };
}
