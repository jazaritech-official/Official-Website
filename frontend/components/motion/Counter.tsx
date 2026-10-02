"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

interface CounterProps {
  /** Final value counted up to when scrolled into view. */
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

function subscribeMotion(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const readReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function format(value: number, decimals: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Animated number counter.
 *
 * Counting runs on requestAnimationFrame only while the element is visible.
 * Under prefers-reduced-motion the final value renders immediately — the
 * animation simply never starts, so no state has to be forced from an effect.
 */
export function Counter({
  value,
  duration = 1700,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [counted, setCounted] = useState(0);
  const reduced = useSyncExternalStore(subscribeMotion, readReducedMotion, () => false);

  useEffect(() => {
    const element = ref.current;
    if (reduced || !element || typeof IntersectionObserver === "undefined") return;

    let frame = 0;
    let startedAt: number | null = null;

    const tick = (time: number) => {
      if (startedAt === null) startedAt = time;
      const progress = Math.min((time - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounted(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          frame = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [reduced, value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(reduced ? value : counted, decimals)}
      {suffix}
    </span>
  );
}

export default Counter;
