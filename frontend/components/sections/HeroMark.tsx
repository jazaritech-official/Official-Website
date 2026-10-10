"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { LogoMarkSvg } from "@/components/brand/LogoMarkSvg";
import { HUB_PIECES } from "@/components/services/hubLayout";
import type { LogoPieceId } from "@/components/services/logoGeometry";
import { heroServices, restingLine } from "@/lib/serviceCopy";
import {
  HERO_ANCHORS,
  HERO_DESIGN,
  anchorPoint,
  leaderPath,
  tooltipSlotStyle,
} from "@/components/sections/heroLayout";

/**
 * THE HERO MARK — the real logo as inline SVG, exploding into its five real
 * pieces with up to ten neon service tooltips.
 *
 * WHAT THIS REPLACES
 * The previous hero rendered a WebGL `THREE.js` scene: neon "dust", a Voronoi
 * fracture of a boxed support object and a glass "Featured service" card. All
 * of it is gone (see the Task L changelog in PROJECT_NOTES.md). There is no
 * canvas, no `requestAnimationFrame` loop and no shader here — only the traced
 * SVG artwork, CSS `transform`/`opacity` transitions and one design-space
 * geometry module (`heroLayout.ts`).
 *
 * CONTENT CONTRACT
 * Every tooltip's title, summary and tags come from `GET /api/services` through
 * the resilient public-content loader. With fewer than 8 services the diagram
 * shows what exists; with none it shows a designed empty state. The frontend
 * never invents service copy.
 *
 * ACCESSIBILITY
 * The mark is a real `<button>` with `aria-expanded` + `aria-controls`. Every
 * tooltip is always in the DOM — collapsed tooltips are `opacity: 0` with
 * `tabIndex={-1}` (never `display: none`), so assistive technology and no-JS
 * visitors always get the full service list. Escape reassembles; a coarse
 * pointer toggles with a tap; under `prefers-reduced-motion` the mark never
 * animates and the tooltips render as a plain static list.
 */

type HeroPhase = "assembled" | "exploding" | "exploded" | "reassembling";

const EXPLODE_MS = 620;
const REASSEMBLE_MS = 460;
/** Auto-open once, then leave it alone: this is a one-shot, never a loop. */
const IDLE_AFTER_MS = 3000;
const IDLE_AUTO_CLOSE_MS = 7000;

/** Per-piece CSS custom properties (SVG user units, explicit px for CSS). */
function pieceVars(piece: LogoPieceId, index: number): CSSProperties {
  const { tx, ty, rot } = HUB_PIECES[piece].explode;
  return {
    "--i": index,
    "--tx": `${tx}px`,
    "--ty": `${ty}px`,
    "--rot": `${rot}deg`,
  } as CSSProperties;
}

export function HeroMark() {
  const { data } = useApiData(() => api.services(), "services");
  const reduced = useReducedMotion();
  const services = useMemo(() => heroServices(data ?? [], 10), [data]);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "exploding" | "reassembling">("idle");
  const [active, setActive] = useState<LogoPieceId | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const lastInputRef = useRef(0);
  const idleFiredRef = useRef(false);

  /* Mirrors `open` for event handlers/observers without re-creating them. */
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const expand = useCallback(() => {
    clearTimer();
    openRef.current = true;
    setOpen(true);
    if (reduced) return;
    setPhase("exploding");
    timerRef.current = window.setTimeout(() => setPhase("idle"), EXPLODE_MS);
  }, [clearTimer, reduced]);

  const collapse = useCallback(() => {
    clearTimer();
    openRef.current = false;
    setOpen(false);
    setActive(null);
    if (reduced) return;
    setPhase("reassembling");
    timerRef.current = window.setTimeout(() => setPhase("idle"), REASSEMBLE_MS);
  }, [clearTimer, reduced]);

  useEffect(() => clearTimer, [clearTimer]);

  /* --- Any real input cancels the idle auto-open (and closes it) ---------- */
  useEffect(() => {
    if (reduced) return;
    const onInput = () => {
      lastInputRef.current = Date.now();
      if (idleFiredRef.current && openRef.current) collapse();
      idleFiredRef.current = true;
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, onInput, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, onInput));
  }, [collapse, reduced]);

  /* --- Idle auto-open: once, only when the hero is the thing on screen ----
   * The same observer also broadcasts `is-inview`/`is-paused` so the CSS idle
   * float pauses off-screen and in hidden tabs. */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const node = rootRef.current;
    if (!node) return;

    let inView = false;
    let armTimer: number | null = null;
    let closeTimer: number | null = null;

    const setInView = (value: boolean) => {
      inView = value;
      node.classList.toggle("is-inview", value && document.visibilityState !== "hidden");
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = Boolean(entry?.isIntersecting) && (entry?.intersectionRatio ?? 0) >= 0.5;
        setInView(visible);
        if (!visible || idleFiredRef.current || reduced) return;
        if (armTimer) window.clearTimeout(armTimer);
        armTimer = window.setTimeout(() => {
          if (!inView || document.hidden || idleFiredRef.current || openRef.current) return;
          if (Date.now() - lastInputRef.current < IDLE_AFTER_MS) return;
          idleFiredRef.current = true;
          expand();
          closeTimer = window.setTimeout(() => {
            if (openRef.current) collapse();
          }, IDLE_AUTO_CLOSE_MS);
        }, IDLE_AFTER_MS);
      },
      { threshold: [0.5] },
    );
    observer.observe(node);

    const onVisibility = () => {
      node.classList.toggle("is-inview", inView && document.visibilityState !== "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (armTimer) window.clearTimeout(armTimer);
      if (closeTimer) window.clearTimeout(closeTimer);
    };
  }, [collapse, expand, reduced]);

  const onPointerEnter = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") expand();
    },
    [expand],
  );

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") collapse();
    },
    [collapse],
  );

  const onBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (!next || !event.currentTarget.contains(next)) collapse();
    },
    [collapse],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      collapse();
      (document.activeElement as HTMLElement | null)?.blur?.();
    },
    [collapse],
  );

  const onTriggerClick = useCallback(
    (event: React.MouseEvent) => {
      if (window.matchMedia("(pointer: coarse)").matches) {
        event.preventDefault();
        if (openRef.current) collapse();
        else expand();
      }
    },
    [collapse, expand],
  );

  const exploded = reduced ? true : open;
  const state: HeroPhase = reduced
    ? "assembled"
    : open
      ? phase === "exploding"
        ? "exploding"
        : "exploded"
      : phase === "reassembling"
        ? "reassembling"
        : "assembled";

  const empty = services.length === 0;

  return (
    <div
      ref={rootRef}
      className={`hero-mark-root${reduced ? " is-static" : ""}${open ? " is-open" : ""}`}
      data-hero="svg-v2"
      data-hero-state={state}
      data-tooltips={services.length}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={expand}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <div className={`hero-diagram hero-diagram--${state}${exploded ? " is-exploded" : ""}`}>
        {/* ---- Leader lines + anchor nodes (design space, decorative) ------ */}
        <svg
          className="hero-diagram__leaders"
          viewBox={`0 0 ${HERO_DESIGN.width} ${HERO_DESIGN.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {services.map((service, index) => {
            const anchor = HERO_ANCHORS[index];
            if (!anchor) return null;
            const point = anchorPoint(anchor);
            const lit = active === anchor.piece;
            return (
              <g key={service._id} data-hero-leader-group={index} className={lit ? "is-lit" : undefined}>
                <path
                  className="hero-leader"
                  data-hero-leader={index}
                  data-hero-leader-piece={anchor.piece}
                  d={leaderPath(index, anchor)}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  className="hero-anchor"
                  data-hero-anchor={anchor.id}
                  data-hero-anchor-piece={anchor.piece}
                  cx={point.x}
                  cy={point.y}
                  r="3.4"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>

        {/* ---- The mark ---------------------------------------------------- */}
        <div className="hero-diagram__mark">
          <button
            type="button"
            className="hero-mark__trigger"
            aria-expanded={exploded}
            aria-controls="hero-service-list"
            onClick={onTriggerClick}
          >
            <span className="sr-only">
              {exploded ? "Hide the Jazari Tech service diagram" : "Show the Jazari Tech service diagram"}
            </span>
            {/* Static, pre-blurred duplicate: only its OPACITY is ever animated. */}
            <span className="hero-mark__glow" aria-hidden="true">
              <LogoMarkSvg idPrefix="hero-glow-" className="hero-mark__glow-svg" />
            </span>
            <LogoMarkSvg
              idPrefix="hero-"
              className="hero-mark__svg"
              svgProps={{ "aria-hidden": true, focusable: false }}
              pieceClassName={(piece) => (active === piece ? "is-lit" : undefined)}
              pieceStyle={(piece, index) => pieceVars(piece, index)}
              pieceProps={(piece) => ({ onPointerEnter: () => setActive(piece) })}
            />
            <span className="hero-mark__frame" aria-hidden="true" />
          </button>
        </div>

        {/* ---- Tooltips: ALWAYS in the DOM --------------------------------- */}
        <ul className="hero-tooltips" id="hero-service-list" aria-label="Services offered by Jazari Tech">
          {services.map((service, index) => {
            const anchor = HERO_ANCHORS[index];
            const piece = anchor?.piece ?? "top";
            const lit = active === piece;
            const chips = (service.highlights ?? []).slice(0, 2);
            return (
              <li
                key={service._id}
                className={`hero-tooltip${lit ? " is-lit" : ""}`}
                data-hero-tooltip={index}
                data-hero-tooltip-piece={piece}
                data-hero-tooltip-slug={service.slug}
                style={{ ...tooltipSlotStyle(index), "--i": index } as CSSProperties}
                onPointerEnter={() => setActive(piece)}
                onPointerLeave={() => setActive(null)}
              >
                <a
                  href={`#service-${service.slug}`}
                  className="hero-tooltip__link"
                  tabIndex={exploded ? 0 : -1}
                  onFocus={() => setActive(piece)}
                  onBlur={() => setActive(null)}
                >
                  <span className="hero-tooltip__head">
                    <span className="hero-tooltip__index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="hero-tooltip__dot" aria-hidden="true" />
                  </span>
                  <span className="hero-tooltip__title">{service.title}</span>
                  <span className="hero-tooltip__desc">{restingLine(service, 78)}</span>
                  {chips.length > 0 && (
                    <span className="hero-tooltip__tags" aria-hidden="true">
                      {chips.map((chip) => (
                        <span key={chip} className="hero-tooltip__tag">
                          {chip}
                        </span>
                      ))}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {empty && (
        <p className="hero-diagram__empty" data-hero-empty>
          Our service catalogue is loading — the full list appears in the Services section below.
        </p>
      )}

      <p className="hero-diagram__hint" aria-hidden="true">
        <span className="hero-diagram__hint--desktop">Hover or focus the mark to see every discipline</span>
        <span className="hero-diagram__hint--touch">Tap the mark to see every discipline</span>
      </p>
    </div>
  );
}

export default HeroMark;
