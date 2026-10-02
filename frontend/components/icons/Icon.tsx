import type { ReactNode, SVGProps } from "react";

export type IconAnimation = "none" | "pulse" | "orbit" | "bounce" | "spin" | "draw";
export type IconVariant = "stroke" | "solid";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children" | "width" | "height"> {
  /** Rendered size in px (or any CSS length). Default 24. */
  size?: number | string;
  /** Accessible name. Omit for decorative icons (they become aria-hidden). */
  "aria-label"?: string;
  /** CSS-driven motion state — no per-icon JavaScript. */
  animated?: IconAnimation | boolean;
  /** Stroke keeps the line-art system; solid fills the primary shape. */
  variant?: IconVariant;
  className?: string;
}

const SIZE_FALLBACK = 24;

/**
 * Builds a consistent icon component. Every icon shares the same API so the
 * system is interchangeable across site, admin, loading and empty states.
 */
export function createIcon(displayName: string, artwork: ReactNode) {
  function Icon({
    size = SIZE_FALLBACK,
    className = "",
    animated = "none",
    variant = "stroke",
    ...rest
  }: IconProps) {
    const label = rest["aria-label"];
    const animation: IconAnimation = animated === true ? "pulse" : animated || "none";

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={variant === "solid" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={variant === "solid" ? 0.6 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        data-anim={animation !== "none" ? animation : undefined}
        className={`icon-anim ${className}`.trim()}
        {...rest}
      >
        {artwork}
      </svg>
    );
  }

  Icon.displayName = displayName;
  return Icon;
}

export default createIcon;
