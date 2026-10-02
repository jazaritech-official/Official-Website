import type { CSSProperties } from "react";

/** Accessible loading spinner. Announced politely to screen readers. */
export function Spinner({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`spinner text-accent ${className}`.trim()} role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/** Shimmering placeholder used while data loads. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

/** Multi-line text placeholder. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className="h-3.5"
          style={{ width: index === lines - 1 ? "60%" : `${88 - index * 6}%` }}
        />
      ))}
    </div>
  );
}

export default Spinner;
