import type { CSSProperties, ReactNode } from "react";
import "./scenes.css";

/**
 * THE SCENE FRAME — the one container every service illustration draws inside.
 *
 * CONTRACT (see PROJECT_NOTES.md §"How to add a new scene"):
 *   · viewBox `0 0 440 190`, pure SVG + CSS keyframes from `scenes.css`;
 *   · decorative only — `aria-hidden`, `focusable="false"`, no text content;
 *   · only `transform`, `opacity` and `stroke-dashoffset` animate (dasharray is
 *     set once), so every scene stays on the compositor;
 *   · each element carries a shared animation class (`.s-up`, `.s-draw`, …) plus
 *     an inline `--delay`/`--dur`, so a 4–8 s loop reads start → build → payoff →
 *     settle → loop without a single line of JavaScript;
 *   · the element's NATURAL state is the FINAL state, so `data-static="true"`
 *     (reduced motion) simply switches the animation off and the scene renders
 *     its finished illustration — never a blank box;
 *   · colour comes from the `--scene-*` illustration tokens only.
 */
export function SceneFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      className={`scene${className ? ` ${className}` : ""}`}
      viewBox="0 0 440 190"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      data-scene-frame=""
    >
      {children}
    </svg>
  );
}

/** Timing helper: `at(0.4)` → 0.4 s delay; `at(0.4, 6)` also sets the cycle. */
export function at(delay: number, duration?: number): CSSProperties {
  return {
    "--delay": `${delay}s`,
    ...(duration === undefined ? {} : { "--dur": `${duration}s` }),
  } as CSSProperties;
}

/** Scene palette shorthand (never a raw hex — always the tokens). */
export const C = {
  1: "var(--scene-1)",
  2: "var(--scene-2)",
  3: "var(--scene-3)",
  4: "var(--scene-4)",
  5: "var(--scene-5)",
  6: "var(--scene-6)",
  7: "var(--scene-7)",
  8: "var(--scene-8)",
} as const;

/** A soft panel every scene can stand its content on. */
export function Panel({ x, y, w, h, fill = "var(--vip-grid)" }: { x: number; y: number; w: number; h: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx="8" fill={fill} />;
}

export default SceneFrame;
