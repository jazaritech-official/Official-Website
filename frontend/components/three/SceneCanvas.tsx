"use client";

import { useEffect, useRef } from "react";
import { createHeroEngine } from "./engine";
import type { AnchorUpdate, EngineHandle, SceneStatus, SceneTheme } from "./types";
import { supportsWebGL } from "./helpers/webgl";
import { detectInitialTier } from "./quality";

interface SceneCanvasProps {
  theme: SceneTheme;
  reducedMotion: boolean;
  /** Status funnel → the DOM overlay crossfades via `data-scene`. */
  onStatus?: (status: SceneStatus) => void;
  /** Hotspot projection sink (container pixels) — DOM writes only, no renders. */
  onAnchor?: AnchorUpdate;
}

/**
 * Owns the *lifecycle* around the engine: capability detection, one
 * IntersectionObserver, one ResizeObserver, visibility + context-loss
 * handling and complete teardown. Three.js objects never leak into React
 * state — the engine lives behind a ref.
 *
 * The component itself is loaded through `next/dynamic` (`ssr: false`) from
 * `HeroScene`, so none of this — nor `three` — reaches the initial bundle.
 */
export function SceneCanvas({ theme, reducedMotion, onStatus, onAnchor }: SceneCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EngineHandle | null>(null);

  // Keep the latest callbacks/settings reachable from long-lived engine
  // callbacks without re-running the init effect (same pattern as useApiData).
  const propsRef = useRef({ theme, reducedMotion, onStatus, onAnchor });
  useEffect(() => {
    propsRef.current = { theme, reducedMotion, onStatus, onAnchor };
  });

  /* --- Init / teardown (runs once; Strict Mode safe) --------------------- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let engine: EngineHandle | null = null;

    const report = (status: SceneStatus): void => {
      if (!disposed) propsRef.current.onStatus?.(status);
    };

    // No WebGL / tier "static" → stay on the static fallback forever. Silent.
    if (!supportsWebGL()) {
      report("fallback");
      return;
    }
    const tier = detectInitialTier();
    if (tier === "static") {
      report("fallback");
      return;
    }

    try {
      engine = createHeroEngine({
        container: host,
        theme: propsRef.current.theme,
        tier,
        reducedMotion: propsRef.current.reducedMotion,
        onFirstFrame: () => report("ready"),
        onAnchor: (x, y, visible) => propsRef.current.onAnchor?.(x, y, visible),
      });
    } catch {
      // Renderer creation failure (driver block, context cap…) — silent
      // degradation: the static fallback stays up, no error UI, no throw.
      report("fallback");
      return;
    }

    engineRef.current = engine;
    engine.start();

    /* --- WebGL context loss: pause + fallback, restore: controlled resume - */
    const canvas = engine.canvas;
    const onContextLost = (event: Event): void => {
      event.preventDefault(); // allow restoration instead of permanent loss
      if (disposed) return;
      engine?.pause();
      report("fallback");
    };
    const onContextRestored = (): void => {
      if (disposed) return;
      // Engine kept every resource — resume the same loop, no duplicates.
      engine?.resume();
      report("ready");
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    /* --- Resize: renderer size + camera projection ----------------------- */
    const resizeObserver = new ResizeObserver(() => engine?.resize());
    resizeObserver.observe(host);

    /* --- Pause when the tab is hidden ------------------------------------ */
    let isNearViewport = true;
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") engine?.pause();
      else if (isNearViewport) engine?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);

    /* --- Pause when the hero scrolls away -------------------------------- */
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isNearViewport = entry?.isIntersecting ?? true;
        if (isNearViewport && document.visibilityState === "visible") engine?.resume();
        else engine?.pause();
      },
      { rootMargin: "120px" },
    );
    intersectionObserver.observe(host);

    return () => {
      // Re-mount (Strict Mode / remount): show the static fallback again
      // before the guard flips, so the next mount can re-report "ready".
      propsRef.current.onStatus?.("fallback");
      disposed = true;
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  /* --- In-place updates: never recreate the scene ------------------------ */
  useEffect(() => {
    engineRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

export default SceneCanvas;
