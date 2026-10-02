"use client";

import { useEffect, useRef, type ElementType, type ReactNode, type CSSProperties } from "react";

export type RevealVariant =
  | "fade-up"
  | "fade-in"
  | "fade-scale"
  | "blur-in"
  | "scale-in"
  | "left"
  | "right";

interface RevealProps {
  children: ReactNode;
  /** Visual variant of the entrance. Default: fade-up. */
  variant?: RevealVariant;
  /** Stagger delay in ms (also used by `.stagger` parents). */
  delay?: number;
  /** Element type — keep the wrapper semantic (section, li, article…). */
  as?: ElementType;
  className?: string;
  /** Reveal again every time it re-enters the viewport. Default: once. */
  reappear?: boolean;
}

/**
 * Scroll-triggered reveal built on IntersectionObserver — no animation library.
 * Off-screen elements never animate; the observer disconnects after the first
 * reveal unless `reappear` is set. Reduced motion users always see content.
 */
export function Reveal({
  children,
  variant = "fade-up",
  delay = 0,
  as: Tag = "div",
  className = "",
  reappear = false,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      element.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            element.classList.add("is-visible");
            if (!reappear) observer.disconnect();
          } else if (reappear) {
            element.classList.remove("is-visible");
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [reappear]);

  const style: CSSProperties | undefined =
    delay > 0 ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined;

  return (
    <Tag
      ref={ref}
      data-reveal={variant === "fade-up" ? undefined : variant}
      style={style}
      className={`reveal ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
