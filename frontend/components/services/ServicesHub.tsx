"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIndex } from "@/components/layout/SectionIndex";
import { CircuitTrace } from "@/components/layout/CircuitTrace";
import { iconRegistry, InfoIcon, type IconName } from "@/components/icons";
import type { Service } from "@/types/api";

/**
 * OUR SERVICES HUB — the signature interaction.
 *
 * The real Jazari ribbon-diamond mark is rebuilt as inline SVG (four straight
 * ribbon bands + a Growth-Green leaf) based on the same geometry constants the
 * 3D hero uses (`components/three/createRibbonPieces.ts`: R / W / GAP). At rest
 * the mark is assembled; on hover / keyboard focus / tap the four bands travel
 * outward along their natural diagonals and the leaf lifts, revealing the
 * services and their connector lines.
 *
 * Business data is never hardcoded: services come from `GET /api/services` and
 * the up-to-five featured ones are chosen by `hubSlot` (falling back to the
 * first services when none are flagged). Labels are real anchors that link to
 * the matching `#service-{slug}` card. The service list is always in the DOM so
 * the section is fully readable without JavaScript or animation.
 */

/* ---- Geometry (viewBox 0 0 240 240) ------------------------------------- */
const R = 78; // half-diagonal (matches the 3D mark's proportions)
// Ribbon band width is 26 user units — applied via `.hub-band` in globals.css.
const GAP = 16; // gap at each vertex
const HYP = GAP * Math.SQRT1_2; // gap projected onto a side
const C = 120; // centre

type PieceId = "top" | "right" | "bottom" | "left" | "leaf";

interface Piece {
  id: PieceId;
  /** Straight band endpoints (inset by the vertex gap). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Explode translation (diagonal, outward) + slight rotation. */
  tx: number;
  ty: number;
  rot: string;
  /** Connector line from the band to the label, plus the label end point. */
  conn: [number, number, number, number];
  label: "top" | "tl" | "tr" | "bl" | "br";
}

const PIECES: Piece[] = [
  { id: "top", x1: C + HYP, y1: C - R + HYP, x2: C + R - HYP, y2: C - HYP, tx: 26, ty: -26, rot: "2.5deg", conn: [159, 81, 230, 30], label: "tr" },
  { id: "right", x1: C + R - HYP, y1: C + HYP, x2: C + HYP, y2: C + R - HYP, tx: 26, ty: 26, rot: "-2.5deg", conn: [159, 159, 230, 204], label: "br" },
  { id: "bottom", x1: C - HYP, y1: C + R - HYP, x2: C - R + HYP, y2: C + HYP, tx: -26, ty: 26, rot: "2.5deg", conn: [81, 159, 10, 204], label: "bl" },
  { id: "left", x1: C - R + HYP, y1: C - HYP, x2: C - HYP, y2: C - R + HYP, tx: -26, ty: -26, rot: "-2.5deg", conn: [81, 81, 10, 30], label: "tl" },
  {
    id: "leaf",
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    tx: 10,
    ty: -18,
    rot: "3deg",
    conn: [150, 46, 150, 8],
    label: "top",
  },
];

/** Slot order → piece id (slot 0..4). */
const SLOT_PIECE: PieceId[] = ["top", "right", "bottom", "left", "leaf"];

/** Per-piece CSS custom properties consumed by the hub styles. */
function pieceVars(piece: Piece, index: number): React.CSSProperties {
  return {
    "--i": index,
    "--tx": `${piece.tx}px`,
    "--ty": `${piece.ty}px`,
    "--rot": piece.rot,
  } as React.CSSProperties;
}

const LABEL_CLASS: Record<Piece["label"], string> = {
  top: "hub-label--top",
  tl: "hub-label--tl",
  tr: "hub-label--tr",
  bl: "hub-label--bl",
  br: "hub-label--br",
};

export function ServicesHub() {
  const { data } = useApiData(() => api.services(), "services");

  const [exploded, setExploded] = useState(false);
  const hubRef = useRef<HTMLDivElement>(null);

  // Featured services: those flagged with a hubSlot, ordered by slot. Falls back
  // to the first services when none are flagged. Never invents content.
  const hubServices = useMemo(() => {
    const all = data ?? [];
    const flagged = all
      .filter((s) => Number.isInteger(s.hubSlot))
      .sort((a, b) => (a.hubSlot ?? 99) - (b.hubSlot ?? 99))
      .slice(0, 5);
    return flagged.length > 0 ? flagged : all.slice(0, 5);
  }, [data]);

  const onFocus = useCallback(() => setExploded(true), []);
  const onBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!hubRef.current?.contains(event.relatedTarget as Node)) setExploded(false);
  }, []);
  const onPointerEnter = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === "mouse") setExploded(true);
  }, []);
  const onPointerLeave = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === "mouse") setExploded(false);
  }, []);
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setExploded(false);
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }, []);
  const onClick = useCallback((event: React.MouseEvent) => {
    // Touch/pen tap toggles; mouse clicks are handled by hover.
    if (event.detail > 0 && window.matchMedia("(pointer: coarse)").matches) {
      setExploded((value) => !value);
    }
  }, []);

  const labelFor = (service: Service, slot: number) => {
    const Icon = iconRegistry[service.icon as IconName] ?? InfoIcon;
    const pieceId = SLOT_PIECE[slot];
    return (
      <li key={service._id} className={`hub-label ${LABEL_CLASS[PIECES[slot].label]}`} data-piece-label={pieceId}>
        <a
          href={`#service-${service.slug}`}
          className="hub-label__link"
          onClick={() => setExploded(false)}
        >
          <span className="hub-label__icon" aria-hidden="true">
            <Icon size={16} />
          </span>
          <span className="hub-label__body">
            <span className="hub-label__title">{service.hubLabel || service.title}</span>
            <span className="hub-label__desc">{service.description}</span>
          </span>
        </a>
      </li>
    );
  };

  return (
    <section
      id="hub"
      aria-labelledby="hub-heading"
      className="relative border-t border-line py-16 sm:py-24"
    >
      <span aria-hidden="true" className="grid-crosshair hidden lg:block" style={{ left: 28, top: 40 }} />
      <CircuitTrace className="absolute right-0 top-8 hidden w-40 opacity-70 lg:block" />

      <div className="container-page">
        <Reveal variant="fade-in" className="max-w-2xl">
          <SectionIndex index="02" label="Hub" className="mb-4" />
          <p className="eyebrow">Our Services Hub</p>
          <h2 id="hub-heading" className="mt-3 text-h3 font-semibold">
            One mark, every discipline
          </h2>
          <span aria-hidden="true" className="heading-rule mt-4" />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            The Jazari mark unfolds into the services we deliver. Hover, focus or tap the logo to
            explore each piece — and jump straight to the discipline you need.
          </p>
        </Reveal>

        <div
          ref={hubRef}
          className={`hub${exploded ? " is-exploded" : ""}`}
          onFocus={onFocus}
          onBlur={onBlur}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onKeyDown={onKeyDown}
        >
          <button
            type="button"
            className="hub__trigger"
            aria-expanded={exploded}
            aria-controls="hub-service-list"
            onClick={onClick}
          >
            <span className="sr-only">Explore the Jazari services logo</span>
            <svg
              className="hub__logo"
              viewBox="0 0 240 240"
              role="img"
              aria-label="Jazari Tech ribbon-diamond mark"
              focusable="false"
            >
              <defs>
                <linearGradient id="hub-band-a" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" />
                  <stop offset="100%" stopColor="color-mix(in srgb, var(--primary) 72%, var(--accent))" />
                </linearGradient>
                <linearGradient id="hub-band-b" x1="1" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="color-mix(in srgb, var(--accent) 68%, var(--primary))" />
                </linearGradient>
              </defs>

              <g id="hub">
                {/* Connector lines + micro pulse (visible when exploded). */}
                <g aria-hidden="true">
                  {PIECES.map((piece) => (
                    <g key={piece.id}>
                      <line
                        className="hub-connector"
                        x1={piece.conn[0]}
                        y1={piece.conn[1]}
                        x2={piece.conn[2]}
                        y2={piece.conn[3]}
                      />
                      <circle className="hub-connector__dot" cx={piece.conn[2]} cy={piece.conn[3]} r="2.2" />
                    </g>
                  ))}
                </g>

                {/* Four ribbon bands + leaf. */}
                <g data-piece="top" style={pieceVars(PIECES[0], 0)}>
                  <line x1={PIECES[0].x1} y1={PIECES[0].y1} x2={PIECES[0].x2} y2={PIECES[0].y2} className="hub-band" stroke="url(#hub-band-a)" />
                  <path className="hub-fold hub-fold--light" d="M 186.7 108.7 L 160 82 L 178 64 Z" />
                </g>
                <g data-piece="right" style={pieceVars(PIECES[1], 1)}>
                  <line x1={PIECES[1].x1} y1={PIECES[1].y1} x2={PIECES[1].x2} y2={PIECES[1].y2} className="hub-band" stroke="url(#hub-band-b)" />
                  <path className="hub-fold hub-fold--dark" d="M 186.7 131.3 L 160 158 L 178 176 Z" />
                </g>
                <g data-piece="bottom" style={pieceVars(PIECES[2], 2)}>
                  <line x1={PIECES[2].x1} y1={PIECES[2].y1} x2={PIECES[2].x2} y2={PIECES[2].y2} className="hub-band" stroke="url(#hub-band-a)" />
                </g>
                <g data-piece="left" style={pieceVars(PIECES[3], 3)}>
                  <line x1={PIECES[3].x1} y1={PIECES[3].y1} x2={PIECES[3].x2} y2={PIECES[3].y2} className="hub-band" stroke="url(#hub-band-b)" />
                </g>
                <g data-piece="leaf" style={pieceVars(PIECES[4], 4)}>
                  <path className="hub-leaf" d="M 132 52 L 158 40 Q 166 36 162 46 L 148 70 Z" />
                </g>
              </g>
            </svg>
          </button>

          {/* Service list — ALWAYS in the DOM (no-JS + screen readers). */}
          <ul id="hub-service-list" className="hub__labels" aria-label="Services featured in the hub">
            {hubServices.map((service, slot) => labelFor(service, slot))}
          </ul>

          {hubServices.length === 0 && (
            <p className="hub__empty">
              Our service catalogue is being updated — the services below are the full, current list.
            </p>
          )}

          <p className="hub__hint" aria-hidden="true">
            <span className="hub__hint-desktop">Hover or focus the logo</span>
            <span className="hub__hint-touch">Tap the logo</span>
          </p>
        </div>
      </div>
    </section>
  );
}

export default ServicesHub;
