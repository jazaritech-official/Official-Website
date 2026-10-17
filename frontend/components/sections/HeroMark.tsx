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
import { LogoMarkSvg, logoGradientIdFor } from "@/components/brand/LogoMarkSvg";
import { LOGO_PIECES } from "@/components/services/logoGeometry";
import { HUB_PIECES } from "@/components/services/hubLayout";
import type { LogoPieceId } from "@/components/services/logoGeometry";
import { heroServices, restingLine } from "@/lib/serviceCopy";
import {
  HERO_ANCHORS,
  HERO_DESIGN,
  HERO_LOGO_BOX,
  anchorPoint,
  leaderPath,
  tooltipSlotStyle,
} from "@/components/sections/heroLayout";
import { HERO_FRAGMENTS, badgeStyle } from "@/components/sections/heroFragments";

/**
 * THE HERO MARK — the real logo splits into ten real slices that fly along the
 * leader wires and dock as badges in the ten service tooltips.
 *
 * WHAT THIS REPLACES
 * The previous hero rendered a WebGL `THREE.js` scene (neon dust, a Voronoi
 * fracture of a boxed support object, a glass "Featured service" card). All of
 * it is gone (PROJECT_NOTES.md, Task L). Task M then replaced the simple
 * "explode / explode-back" motion with the delivery choreography below: still no
 * canvas, no shader, no `requestAnimationFrame` loop — the flight is a WAAPI
 * `transform` keyframe track on two nested groups per fragment (a translate
 * track and a rotate/scale track), created ONCE and replayed with
 * `play()` / `reverse()`, never re-created and never stacked.
 *
 * THE STATES (`data-hero-state`)
 *   assembled → splitting → flying → docked      (open)
 *   docked → returning → merging → assembled     (close)
 * At rest the ten tooltips are calm ghost slots (outline + dimmed text) so the
 * layout never jumps; the wires are drawn dimly, like a real busbar. Opening
 * splits the five pieces a few percent apart, cuts each piece in two along its
 * own centroid, sends the ten slices down the wires (each wire lights behind its
 * slice) and docks them in the badge sockets, where the tooltip text comes up to
 * full emphasis. Everything is interrupt-safe: a second hover mid-return simply
 * plays the same tracks forward again from their current time.
 *
 * CONTENT CONTRACT
 * Every tooltip's title, summary and tags come from `GET /api/services` through
 * the resilient public-content loader. The frontend never invents service copy.
 *
 * ACCESSIBILITY
 * The mark is a real `<button>` with `aria-expanded` + `aria-controls`. Every
 * tooltip is always in the DOM (never `display: none`), so assistive technology
 * and no-JS visitors always get the full service list. Escape reassembles; a
 * coarse pointer toggles on tap; under `prefers-reduced-motion` nothing flies —
 * the tooltips render as a plain static list and open/close is instant.
 */

type HeroState = "assembled" | "splitting" | "flying" | "docked" | "returning" | "merging";

/** Choreography timings (ms). Total open ≈ 1000 ms, close ≈ 790 ms. */
const SPLIT_MS = 220;
const CUT_MS = 120;
const FLIGHT_DELAY_MS = 100;
const FLY_MS = 540;
const RETURN_MS = 600;
const MERGE_MS = 200;
/** Auto-open once, then leave it alone: this is a one-shot, never a loop. */
const IDLE_AFTER_MS = 3000;
const IDLE_AUTO_CLOSE_MS = 10000;
const IDLE_COOLDOWN_MS = 10000;
/** Hover-out is debounced; hover-in is not. */
const OUT_DEBOUNCE_MS = 120;
/** Scrolling away this many pixels reassembles the mark. */
const SCROLL_AWAY_PX = 40;

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

/** The source→design scale, reused for the fragment overlay placement. */
const FRAG_SCALE = HERO_LOGO_BOX.size / 4096;

export function HeroMark() {
  const { data } = useApiData(() => api.services(), "services");
  const reduced = useReducedMotion();
  const services = useMemo(() => heroServices(data ?? [], 10), [data]);

  const [state, setState] = useState<HeroState>("assembled");
  const [active, setActive] = useState<LogoPieceId | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<HeroState>("assembled");
  const timerRef = useRef<number | null>(null);
  const outTimerRef = useRef<number | null>(null);
  const animsRef = useRef<Array<{ move: Animation; spin: Animation }>>([]);
  const lastInputRef = useRef(0);
  const idleFiredRef = useRef(false);
  const openScrollRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearOutTimer = useCallback(() => {
    if (outTimerRef.current !== null) {
      window.clearTimeout(outTimerRef.current);
      outTimerRef.current = null;
    }
  }, []);

  /* ── The flight tracks: built ONCE from the precomputed geometry ───────── */
  const ensureAnims = useCallback(() => {
    if (animsRef.current.length > 0) return animsRef.current;
    const root = rootRef.current;
    if (!root) return [];
    const timing: KeyframeAnimationOptions = {
      duration: FLY_MS,
      delay: FLIGHT_DELAY_MS,
      easing: "linear",
      fill: "both",
      iterations: 1,
    };
    const created = HERO_FRAGMENTS.flatMap((fragment) => {
      const move = root.querySelector<SVGGElement>(`[data-hero-fragment="${fragment.index}"]`);
      const spin = move?.querySelector<SVGGElement>(".hero-frag__spin") ?? null;
      if (!move || !spin || typeof move.animate !== "function") return [];
      const steps = fragment.steps;

      /* The translate and the scale are solved together in geometry space, so
         each keyframe keeps the slice's centre exactly on its own wire. */
      const moveFrames: Keyframe[] = steps.map((step) => ({
        transform: `translate(${step.translate.x.toFixed(2)}px, ${step.translate.y.toFixed(2)}px)`,
        offset: step.offset,
      }));
      const spinFrames: Keyframe[] = steps.map((step) => ({
        transform: `rotate(${step.rotate.toFixed(2)}deg) scale(${step.scale.toFixed(4)})`,
        offset: step.offset,
      }));

      const moveAnim = move.animate(moveFrames, timing);
      const spinAnim = spin.animate(spinFrames, timing);
      moveAnim.pause();
      spinAnim.pause();
      return [{ move: moveAnim, spin: spinAnim }];
    });
    animsRef.current = created;
    return created;
  }, []);

  /** Replay the shared tracks forward from wherever they are. */
  const flyForward = useCallback(() => {
    ensureAnims().forEach(({ move, spin }) => {
      [move, spin].forEach((animation) => {
        animation.playbackRate = 1;
        if (animation.playState === "finished") animation.currentTime = 0;
        if (animation.playState !== "running") animation.play();
      });
    });
  }, [ensureAnims]);

  /** Send the same tracks backwards — from their CURRENT progress. */
  const flyBack = useCallback(() => {
    ensureAnims().forEach(({ move, spin }) => {
      [move, spin].forEach((animation) => {
        animation.playbackRate = 1.12; // the return is slightly faster
        animation.reverse();
      });
    });
  }, [ensureAnims]);

  /* ── Open / close ──────────────────────────────────────────────────────── */
  const expand = useCallback(() => {
    const current = stateRef.current;
    /* Already open or on its way: do NOT cancel the docking timer on a stray
       re-entry (a pointer moving between the mark's own children fires enter
       again), or the delivery would stall mid-flight. */
    if (current === "docked" || current === "flying" || current === "splitting") return;
    clearTimer();
    clearOutTimer();

    if (reduced) {
      setState("docked");
      return;
    }
    if (current === "returning" || current === "merging") {
      // Interrupt mid-return: the tracks keep their progress and play forward.
      setState("flying");
      flyForward();
      timerRef.current = window.setTimeout(() => setState("docked"), FLY_MS + FLIGHT_DELAY_MS);
      return;
    }
    openScrollRef.current = typeof window === "undefined" ? 0 : window.scrollY;
    setState("splitting");
    timerRef.current = window.setTimeout(() => {
      setState("flying");
      flyForward();
      timerRef.current = window.setTimeout(() => setState("docked"), FLY_MS + FLIGHT_DELAY_MS);
    }, CUT_MS);
  }, [clearOutTimer, clearTimer, flyForward, reduced]);

  const collapse = useCallback(() => {
    clearTimer();
    clearOutTimer();
    const current = stateRef.current;
    if (current === "assembled" || current === "returning" || current === "merging") return;
    setActive(null);

    if (reduced) {
      setState("assembled");
      return;
    }
    setState("returning");
    flyBack();
    timerRef.current = window.setTimeout(() => {
      setState("merging");
      timerRef.current = window.setTimeout(() => setState("assembled"), MERGE_MS);
    }, RETURN_MS);
  }, [clearOutTimer, clearTimer, flyBack, reduced]);

  useEffect(() => {
    return () => {
      clearTimer();
      clearOutTimer();
      animsRef.current.forEach(({ move, spin }) => {
        move.cancel();
        spin.cancel();
      });
      animsRef.current = [];
    };
  }, [clearOutTimer, clearTimer]);

  /* ── Trigger wiring: hover, focus, tap, Escape ─────────────────────────── */
  const onPointerEnter = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      clearOutTimer();
      expand();
    },
    [clearOutTimer, expand],
  );

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const current = stateRef.current;
      if (current === "assembled" || current === "returning" || current === "merging") return;
      clearOutTimer();
      outTimerRef.current = window.setTimeout(() => {
        /* The debounce also guards against the browser re-running hover
           processing (a spurious boundary event while the pointer never left):
           if the mark is still hovered, the delivery stays docked. */
        if (rootRef.current?.matches(":hover")) return;
        collapse();
      }, OUT_DEBOUNCE_MS);
    },
    [clearOutTimer, collapse],
  );

  const onBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (!next || !event.currentTarget.contains(next)) collapse();
      /* Keyboard users who tab away must not leave the mark stuck at rest. */
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
      if (!window.matchMedia("(pointer: coarse)").matches) return;
      event.preventDefault();
      const current = stateRef.current;
      if (current === "docked" || current === "flying" || current === "splitting") collapse();
      else expand();
    },
    [collapse, expand],
  );

  /* ── Any real input cancels the idle auto-open (and closes it) ─────────── */
  useEffect(() => {
    if (reduced) return;
    const onInput = () => {
      lastInputRef.current = Date.now();
      if (idleFiredRef.current) {
        idleFiredRef.current = false;
        if (stateRef.current !== "assembled") collapse();
      }
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "wheel", "touchstart"];
    events.forEach((event) => window.addEventListener(event, onInput, { passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, onInput));
  }, [collapse, reduced]);

  /* ── Scroll away → reassemble ─────────────────────────────────────────── */
  useEffect(() => {
    if (reduced) return;
    const onScroll = () => {
      const current = stateRef.current;
      if (current === "assembled") {
        openScrollRef.current = window.scrollY;
        return;
      }
      if (Math.abs(window.scrollY - openScrollRef.current) > SCROLL_AWAY_PX) collapse();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [collapse, reduced]);

  /* ── In-view gating + the one-time idle auto-open ──────────────────────── */
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
          if (!inView || document.hidden || idleFiredRef.current || stateRef.current !== "assembled") return;
          if (Date.now() - lastInputRef.current < IDLE_COOLDOWN_MS) return;
          idleFiredRef.current = true;
          expand();
          closeTimer = window.setTimeout(() => {
            if (stateRef.current !== "assembled") collapse();
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

  /* ── Dev-only state forcing (never present in a production build) ──────── */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const target = window as unknown as { __heroDebug?: { force: (next: HeroState | null) => void } };
    target.__heroDebug = {
      force: (next) => (next === null ? collapse() : setState(next)),
    };
    return () => {
      delete target.__heroDebug;
    };
  }, [collapse]);

  const docked = state === "docked";
  const flying = state === "flying" || state === "docked" || state === "returning";
  const empty = services.length === 0;

  return (
    <div
      ref={rootRef}
      className={`hero-mark-root${reduced ? " is-static" : ""}${flying ? " is-flying" : ""}`}
      data-hero="svg-v2"
      data-hero-state={state}
      data-tooltips={services.length}
      data-fragments={reduced ? 0 : HERO_FRAGMENTS.length}
      style={{ "--split-ms": `${SPLIT_MS}ms` } as CSSProperties}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={expand}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <div
        className={`hero-diagram hero-diagram--${state}${docked ? " is-docked" : ""}${reduced ? " is-static" : ""}`}
        data-hero-split={state !== "assembled" && state !== "merging" ? "true" : undefined}
      >
        {/* ---- Leader wires (design space, decorative) --------------------- */}
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
            const path = leaderPath(index, anchor);
            return (
              <g key={service._id} data-hero-leader-group={index} className={lit ? "is-lit" : undefined}>
                <path
                  className="hero-leader"
                  data-hero-leader={index}
                  data-hero-leader-piece={anchor.piece}
                  d={path}
                  pathLength={1}
                  vectorEffect="non-scaling-stroke"
                />
                {/* The trail: the same route, lit behind the flying fragment. */}
                <path
                  className="hero-leader__trail"
                  data-hero-leader-trail={index}
                  d={path}
                  pathLength={1}
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
            aria-expanded={docked || reduced}
            aria-controls="hero-service-list"
            onClick={onTriggerClick}
          >
            <span className="sr-only">
              {docked ? "Hide the Jazari Tech service diagram" : "Show the Jazari Tech service diagram"}
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
                style={{ ...tooltipSlotStyle(index), "--i": index, "--badge-head-pad": badgeStyle.headPad } as CSSProperties}
                onPointerEnter={() => setActive(piece)}
                onPointerLeave={() => setActive(null)}
              >
                <a
                  href={`#service-${service.slug}`}
                  className="hero-tooltip__link"
                  tabIndex={docked || reduced ? 0 : -1}
                  onFocus={() => setActive(piece)}
                  onBlur={() => setActive(null)}
                >
                  {/* The badge socket a fragment docks into (the fragment itself
                      is drawn by the diagram overlay, on the same geometry). */}
                  <span
                    aria-hidden="true"
                    className="hero-tooltip__badge"
                    data-hero-badge={index}
                    style={{
                      left: badgeStyle.left,
                      top: badgeStyle.top,
                      width: badgeStyle.width,
                    }}
                  />
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

        {/* ---- The fragments: real slices of the real artwork ------------- */}
        {!reduced && (
          <svg
            className="hero-diagram__fragments"
            viewBox={`0 0 ${HERO_DESIGN.width} ${HERO_DESIGN.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
            data-hero-fragments={HERO_FRAGMENTS.length}
          >
            <defs>
              {LOGO_PIECES.map((piece) => (
                <linearGradient
                  key={piece.id}
                  id={logoGradientIdFor(piece.id, "hero-frag-")}
                  gradientUnits="userSpaceOnUse"
                  x1={piece.gradient.x1}
                  y1={piece.gradient.y1}
                  x2={piece.gradient.x2}
                  y2={piece.gradient.y2}
                >
                  {piece.gradient.stops.map((stop, index) => (
                    <stop key={index} offset={stop.offset} stopColor={stop.color} />
                  ))}
                </linearGradient>
              ))}
              {HERO_FRAGMENTS.map((fragment) => (
                <clipPath key={fragment.clipId} id={fragment.clipId} clipPathUnits="userSpaceOnUse">
                  <polygon points={fragment.clipPoints} />
                </clipPath>
              ))}
            </defs>
            {HERO_FRAGMENTS.map((fragment) => (
              <g
                key={fragment.index}
                className="hero-frag"
                data-hero-fragment={fragment.index}
                data-hero-fragment-piece={fragment.piece}
                data-hero-fragment-half={fragment.half}
                data-hero-fragment-clip={fragment.clipId}
                data-hero-fragment-gradient={logoGradientIdFor(fragment.piece, "hero-frag-")}
              >
                <g className="hero-frag__move">
                  <g transform={`translate(${fragment.pivot.x.toFixed(2)} ${fragment.pivot.y.toFixed(2)})`}>
                    <g className="hero-frag__spin">
                      <g
                        transform={`translate(${(-fragment.pivot.x).toFixed(2)} ${(-fragment.pivot.y).toFixed(2)}) translate(${fragment.origin.x.toFixed(2)} ${fragment.origin.y.toFixed(2)}) scale(${FRAG_SCALE})`}
                      >
                        <g clipPath={`url(#${fragment.clipId})`}>
                          <path
                            d={fragment.pathData}
                            fill={`url(#${logoGradientIdFor(fragment.piece, "hero-frag-")})`}
                          />
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              </g>
            ))}
          </svg>
        )}
      </div>

      {empty && (
        <p className="hero-diagram__empty" data-hero-empty>
          Our service catalogue is loading — the full list appears in the Services section below.
        </p>
      )}

      <p className="hero-diagram__hint" aria-hidden="true">
        <span className="hero-diagram__hint--desktop">
          Hover the mark — watch it deliver our services
        </span>
        <span className="hero-diagram__hint--touch">Tap the mark to see every discipline</span>
      </p>
    </div>
  );
}

export default HeroMark;
