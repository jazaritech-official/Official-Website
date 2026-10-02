"use client";

import { useEffect, useRef } from "react";

/**
 * Pointer-follow 3D tilt for cards — writes `--tilt-x` / `--tilt-y` custom
 * properties straight to the element (no React renders), rAF-throttled to one
 * update per frame. Disabled on coarse pointers and for reduced-motion users;
 * the element keeps its normal hover state when the hook is inactive.
 *
 * Pair with the `.tilt-card` class (perspective + rotateX/rotateY) and an
 * optional `.tilt-depth` child for parallax elevation.
 */
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    const onMove = (event: PointerEvent): void => {
      const { clientX, clientY } = event; // copy — events may be recycled
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const px = (clientX - rect.left) / rect.width - 0.5;
        const py = (clientY - rect.top) / rect.height - 0.5;
        element.style.setProperty("--tilt-x", `${(-py * 5).toFixed(2)}deg`);
        element.style.setProperty("--tilt-y", `${(px * 7).toFixed(2)}deg`);
      });
    };

    const onLeave = (): void => {
      cancelAnimationFrame(frame);
      element.style.setProperty("--tilt-x", "0deg");
      element.style.setProperty("--tilt-y", "0deg");
    };

    element.addEventListener("pointermove", onMove, { passive: true });
    element.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return ref;
}

export default useTilt;
