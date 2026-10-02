import type { CSSProperties, ReactNode } from "react";

interface MarqueeProps {
  children: ReactNode;
  direction?: "left" | "right";
  /** Seconds for one full loop. */
  duration?: number;
  className?: string;
}

/**
 * Infinite CSS marquee — duplicated group guarantees a seamless -50% loop with
 * no jump, and playback pauses on hover/focus (see `.marquee` in globals.css).
 * Pure CSS: no carousel dependency, no JavaScript animation loop.
 */
export function Marquee({ children, direction = "left", duration = 46, className = "" }: MarqueeProps) {
  const style = { "--marquee-duration": `${duration}s` } as CSSProperties;

  return (
    <div className={`marquee ${className}`.trim()} data-direction={direction}>
      <div className="marquee-track" style={style}>
        <div className="marquee-group">{children}</div>
        <div className="marquee-group" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

export default Marquee;
