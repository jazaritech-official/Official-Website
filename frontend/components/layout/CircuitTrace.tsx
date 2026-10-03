/**
 * Decorative circuit-trace connector between sections — a thin, low-opacity
 * blueprint line with one tiny Growth-Green pulse travelling along it. Pure
 * SVG/CSS (offset-path); disabled under `prefers-reduced-motion` by the global
 * override. Never carries content and never intercepts pointers.
 */
const PATH = "M 2 14 H 96 Q 116 14 116 34 V 150 Q 116 168 134 168 H 198";

export function CircuitTrace({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none ${className}`.trim()}
      viewBox="0 0 200 182"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="trace-line trace-line--dashed" d={PATH} />
      <circle
        className="trace-pulse"
        r="2.3"
        style={{ offsetPath: `path("${PATH}")`, offsetRotate: "0deg" }}
      />
    </svg>
  );
}

export default CircuitTrace;
