"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { restingLine } from "@/lib/serviceCopy";
import { loadScene, type SceneComponent } from "@/components/services/sceneRegistry";
import type { Service } from "@/types/api";

/**
 * THE VIP PREVIEW CARD — one floating instance, reused by every row.
 *
 * WHAT THIS IS (and is not)
 * Services have no pages of their own, so hovering/focusing/tapping a discipline
 * opens a PREVIEW: a single dark-navy glass card that floats beside the row,
 * shows a full-colour animated scene for that service, its backend copy and the
 * one real link ("Start a project"). It never navigates. Switching rows MORPHS
 * this same card (the DOM is reused — the scene layer cross-fades with an 8px
 * translate), so there is exactly one card and exactly one running scene at a
 * time, ever.
 *
 * POSITIONING
 * `position: fixed`, computed from the row's rect ONCE per open (one layout read,
 * none during animation) with full collision handling: flip right → left, clamp
 * vertically between the navbar and the viewport floor. On a coarse pointer or a
 * narrow viewport it becomes a bottom sheet instead.
 *
 * MOTION
 * Only `transform`/`opacity` animate. The rotating border gradient is a
 * `transform: rotate()` on a pseudo-element, the inner grid is a static layer,
 * and the whole card is paused (`animation-play-state`) whenever the scene is
 * not on screen or the tab is hidden — the shell flips `.is-playing` and nothing
 * else. Reduced motion renders the scene's FINAL state with no animation at all.
 */

const CARD_W = 440;
const CARD_H = 340;
const GAP = 16;
const EDGE = 16;

function cardPosition(anchor: DOMRect | null, isSheet: boolean) {
  if (isSheet || !anchor || typeof window === "undefined") return null;
  const nav = document.querySelector("[data-navbar]") as HTMLElement | null;
  const navBottom = nav?.getBoundingClientRect().bottom ?? 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchor.right + GAP;
  if (left + CARD_W > vw - EDGE) {
    left = anchor.left - CARD_W - GAP; // flip to the left of the row
  }
  left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - CARD_W - EDGE));

  let top = anchor.top + anchor.height / 2 - CARD_H / 2;
  if (top + CARD_H > vh - EDGE) top = anchor.bottom - CARD_H; // flip up
  if (top < navBottom + 12) top = Math.min(anchor.top, vh - CARD_H - EDGE); // flip down
  top = Math.min(Math.max(navBottom + 12, top), Math.max(navBottom + 12, vh - CARD_H - EDGE));

  return { left, top };
}

export interface ServicePreviewCardProps {
  service: Service | null;
  index: number;
  total: number;
  anchor: DOMRect | null;
  /** Bottom sheet instead of a floating card (coarse pointer / narrow viewport). */
  sheet: boolean;
  reduced: boolean;
  playing: boolean;
  /** True while the pointer is over the row or the card (hover-intent bridge). */
  onPointerEnter: () => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFocusIn?: () => void;
  onFocusOut?: (event: React.FocusEvent<HTMLDivElement>) => void;
  onDismiss: () => void;
}

export function ServicePreviewCard({
  service,
  index,
  total,
  anchor,
  sheet,
  reduced,
  playing,
  onPointerEnter,
  onPointerLeave,
  onFocusIn,
  onFocusOut,
  onDismiss,
}: ServicePreviewCardProps) {
  /*
   * ONE piece of state holds "which scene is painted". It is derived, not
   * reset: while the chunk for the new slug is still arriving, `loaded.slug`
   * simply does not match the service on screen and the skeleton shows. That
   * keeps the effect free of synchronous setState and guarantees that a stale
   * scene can never be paired with the wrong service's copy.
   */
  const [loaded, setLoaded] = useState<{ slug: string; Component: SceneComponent } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const Scene = service && loaded?.slug === service.slug ? loaded.Component : null;

  /* Load the scene for the current slug; unknown slugs get the generic scene. */
  useEffect(() => {
    if (!service) return;
    let active = true;
    loadScene(service.slug).then((component) => {
      if (active) setLoaded({ slug: service.slug, Component: component });
    });
    return () => {
      active = false;
    };
  }, [service]);

  useEffect(() => {
    if (!service || typeof window === "undefined") return;
    const position = cardPosition(anchor, sheet);
    const node = cardRef.current;
    if (!node || !position) return;
    node.style.setProperty("--vip-left", `${Math.round(position.left)}px`);
    node.style.setProperty("--vip-top", `${Math.round(position.top)}px`);
  }, [anchor, sheet, service]);

  /* Mobile sheet: focus moves in on open and is restored by the parent. */
  useEffect(() => {
    if (!service || !sheet) return;
    const node = cardRef.current;
    if (!node) return;
    const focusable = node.querySelector<HTMLElement>("a, button");
    focusable?.focus({ preventScroll: true });
    return () => {
      /* the parent restores the row's focus */
    };
  }, [service, sheet]);

  if (!service) return null;

  const chips = (service.highlights ?? []).slice(0, 3);
  const position = cardPosition(anchor, sheet);

  return (
    <div
      ref={cardRef}
      id="service-preview-card"
      className={`vip${sheet ? " vip--sheet" : ""}${reduced ? " is-static" : ""}${playing ? " is-playing" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={`${service.title} preview`}
      data-service-preview={service.slug}
      data-service-preview-index={index}
      style={
        {
          ...(position ? { left: `${Math.round(position.left)}px`, top: `${Math.round(position.top)}px` } : {}),
          "--vip-left": position ? `${Math.round(position.left)}px` : undefined,
          "--vip-top": position ? `${Math.round(position.top)}px` : undefined,
        } as CSSProperties
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocusIn}
      onBlur={onFocusOut}
    >
      <span aria-hidden="true" className="vip__ring" />
      <div className="vip__inner">
        <span aria-hidden="true" className="vip__grid" />

        {sheet && (
          <button type="button" className="vip__handle" aria-label="Close the preview" onClick={onDismiss}>
            <span aria-hidden="true" />
          </button>
        )}

        <div className="vip__bar">
          <span className="vip__index" aria-hidden="true">
            Discipline {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
          <span className="vip__live" aria-hidden="true">
            Live
          </span>
        </div>

        <div
          key={service.slug}
          className={`vip__scene${playing ? " is-playing" : ""}`}
          data-service-scene={service.slug}
          data-scene-playing={playing ? "true" : "false"}
          aria-hidden="true"
          data-static={reduced ? "true" : undefined}
        >
          {Scene ? <Scene /> : <span className="vip__skeleton" />}
        </div>

        <div className="vip__meta">
          <h3 className="vip__title">{service.title}</h3>
          <p className="vip__desc">{restingLine(service, 120)}</p>
          {chips.length > 0 && (
            <p className="vip__chips">
              {chips.map((chip) => (
                <span key={chip} className="vip__chip">
                  {chip}
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="vip__foot">
          <a className="vip__cta" href="#start" onClick={sheet ? onDismiss : undefined}>
            Start a project
            <span aria-hidden="true" className="vip__cta-arrow">
              →
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default ServicePreviewCard;
