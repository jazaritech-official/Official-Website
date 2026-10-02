"use client";

import { useEffect, useRef } from "react";

/**
 * Subtle pointer-following spotlight (desktop, fine pointers only).
 *
 * - rAF-throttled; writes two CSS custom properties directly to the DOM (zero
 *   React renders)
 * - disabled entirely on coarse pointers, small viewports and under
 *   prefers-reduced-motion
 * - `pointer-events: none`, so it never intercepts clicks or focus
 * - sits at z-index 0, behind `main`/`footer` content (see `globals.css` §9)
 */
export function PointerGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined") return;

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const wideEnough = window.innerWidth >= 768;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || !wideEnough || reduced) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight * 0.3;
    let currentX = targetX;
    let currentY = targetY;
    let frame = 0;
    let visible = false;

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!visible) {
        visible = true;
        element.classList.add("is-on");
      }
    };

    const onLeave = () => {
      visible = false;
      element.classList.remove("is-on");
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      currentX += (targetX - currentX) * 0.14;
      currentY += (targetY - currentY) * 0.14;
      element.style.setProperty("--glow-x", `${currentX.toFixed(1)}px`);
      element.style.setProperty("--glow-y", `${currentY.toFixed(1)}px`);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      element.classList.remove("is-on");
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className="pointer-glow" />;
}

export default PointerGlow;
