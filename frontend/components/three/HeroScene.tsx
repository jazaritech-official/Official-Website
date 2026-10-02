"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useApiData } from "@/hooks/useApiData";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/Spinner";
import { iconRegistry, InfoIcon, type IconName } from "@/components/icons";
import type { Service } from "@/types/api";
import type { SceneStatus } from "./types";

/**
 * Lazily loaded renderer. `ssr: false` + `dynamic()` keeps `three` out of the
 * initial bundle and out of every route except `/`. If the chunk ever fails to
 * load we resolve to a null component — the static fallback simply stays up.
 */
const SceneCanvas = dynamic(
  () => import("./SceneCanvas").then((module) => module.SceneCanvas).catch(() => () => null),
  { ssr: false, loading: () => null },
);

interface HeroSceneProps {
  /** Hero visual container — scene status is written to its `data-scene` attr. */
  hostRef: RefObject<HTMLDivElement | null>;
}

/** Prefer a build/engineering discipline; otherwise first by sort order. */
function pickFeatured(services: Service[]): Service | null {
  if (services.length === 0) return null;
  return (
    services.find((service) => /software|ai|code|develop/i.test(`${service.icon} ${service.slug}`)) ??
    services[0]
  );
}

/**
 * React-facing shell of the 3D hero: theme bridge (existing `useTheme`),
 * reduced-motion bridge, lazy scene loading, the fallback↔WebGL crossfade
 * (`data-scene`), and the HTML overlay system — pulsing hotspot, SVG
 * connector and a glass card whose content comes from the existing
 * `GET /api/services` data (same cached call the Services section uses).
 *
 * The `three` chunk loads only when this component mounts — it is imported by
 * the homepage Hero, never by the root layout or `/admin`.
 */
export function HeroScene({ hostRef }: HeroSceneProps) {
  const { resolved } = useTheme();
  const reducedMotion = useReducedMotion();
  const { data, loading } = useApiData(() => api.services(), "services");
  const featured = pickFeatured(data ?? []);

  const layerRef = useRef<HTMLDivElement | null>(null);
  const hotspotRef = useRef<HTMLSpanElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  /** True once the engine drives the hotspot (projected coordinates). */
  const drivenRef = useRef(false);

  /* --- Overlay placement: hotspot + connector, container pixels ---------- */
  const place = useCallback((x: number, y: number, visible: boolean) => {
    const hotspot = hotspotRef.current;
    const path = pathRef.current;
    if (!hotspot) return;

    hotspot.style.opacity = visible ? "1" : "0";
    hotspot.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (!path) return;

    const card = cardRef.current;
    if (!visible || !card) {
      path.setAttribute("opacity", "0");
      return;
    }
    path.setAttribute("opacity", "1");

    // Connector: hotspot → near corner of the glass card (spec §30).
    const ax = card.offsetLeft;
    const ay = card.offsetTop + 20;
    const controlX = (x + ax) / 2;
    const controlY = (y + ay) / 2 - 36;
    path.setAttribute("d", `M ${x.toFixed(1)} ${y.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${ax.toFixed(1)} ${ay.toFixed(1)}`);
  }, []);

  /* --- Engine sink (container pixels, called per frame — DOM writes only) - */
  const onAnchor = useCallback(
    (x: number, y: number, visible: boolean) => {
      drivenRef.current = true;
      place(x, y, visible);
    },
    [place],
  );

  /* --- Static placement before/without WebGL (fallback keeps the design) -- */
  const placeDefault = useCallback(() => {
    if (drivenRef.current) return;
    const card = cardRef.current;
    if (!card) return;
    const x = Math.max(card.offsetLeft - 64, 10);
    const y = Math.max(card.offsetTop - 8, 10);
    place(x, y, true);
  }, [place]);

  useEffect(() => {
    placeDefault();
    const onResize = (): void => placeDefault();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [placeDefault]);

  // Direct DOM write (not React state) — status can flip on any frame.
  const handleStatus = useCallback(
    (status: SceneStatus) => {
      const host = hostRef.current;
      if (!host) return;
      host.dataset.scene = status === "ready" ? "webgl" : "fallback";
      if (status === "fallback") placeDefault();
    },
    [hostRef, placeDefault],
  );

  const Icon = featured ? (iconRegistry[featured.icon as IconName] ?? InfoIcon) : null;

  return (
    <>
      {/* WebGL layer — decorative, transparent, never blocks pointers */}
      <div ref={layerRef} className="hero-scene absolute inset-0" aria-hidden="true">
        <SceneCanvas theme={resolved} reducedMotion={reducedMotion} onStatus={handleStatus} onAnchor={onAnchor} />
      </div>

      {/* Connector: hotspot → glass card (SVG follows every frame) */}
      <svg
        className="hero-connector pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
        fill="none"
      >
        <path
          ref={pathRef}
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          strokeLinecap="round"
          opacity="0.75"
        />
      </svg>

      {/* Pulsing hotspot — Growth Green core, navy/blue ring (spec §29) */}
      <span ref={hotspotRef} className="hero-hotspot hotspot absolute" aria-hidden="true" />

      {/* Glass preview card — real backend service data, accessible HTML */}
      {loading ? (
        <div
          ref={cardRef}
          className="glass absolute bottom-4 right-0 w-60 rounded-2xl p-4 shadow-[var(--shadow-card)]"
          aria-hidden="true"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-4 w-36" />
          <Skeleton className="mt-2 h-3 w-full" />
        </div>
      ) : featured && Icon ? (
        <div
          ref={cardRef}
          className="glass hero-card absolute bottom-4 right-0 z-10 w-60 rounded-2xl p-4 shadow-[var(--shadow-card)] transition-transform duration-300 hover:-translate-y-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
              Featured service
            </span>
            <span className="badge-dot" aria-hidden="true" />
          </div>
          <div className="mt-2.5 flex items-start gap-2.5">
            <span
              className="icon-interactive inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
              aria-hidden="true"
            >
              <Icon size={16} animated="pulse" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{featured.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                {featured.description}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default HeroScene;
