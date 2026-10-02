"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `prefers-reduced-motion` as reactive state, mirroring the pattern used by
 * `useTheme` (useSyncExternalStore — safe under SSR and Strict Mode).
 * Server snapshot is `false`; the no-flash inline script already ensures
 * reduced-motion users never see animated-first paint.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export default useReducedMotion;
