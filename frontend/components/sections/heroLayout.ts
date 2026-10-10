import { HUB_PIECES } from "@/components/services/hubLayout";
import type { LogoPieceId } from "@/components/services/logoGeometry";

/**
 * HERO DIAGRAM — deterministic blueprint geometry (design space, no runtime
 * measurement).
 *
 * The hero mark and its service tooltips share ONE coordinate space, exactly
 * like the Services Hub (`hubLayout.ts`). Nothing here is measured in the
 * browser: every tooltip slot, anchor and leader route is a number, so the
 * layout cannot drift, cannot thrash layout, and is identical on every device.
 *
 * ── WHY THE TOOLTIPS SIT IN TWO COLUMNS ─────────────────────────────────────
 * The mark occupies the centre third of the diagram and the two outer thirds
 * hold five tooltips each. That guarantees — by construction, not by
 * measurement — that a tooltip can never overlap the mark, another tooltip, or
 * (because the whole diagram lives inside the hero's visual column) the
 * headline, the CTAs or the navbar.
 */

export const HERO_DESIGN = { width: 1000, height: 800 } as const;

/** The square the traced 4096 viewBox is fitted into, in design units. */
export const HERO_LOGO_BOX = { x: 350, y: 250, size: 300 } as const;

/** Tooltip slot box + the column geometry (5 rows per column). */
export const HERO_TOOLTIP = { width: 302, height: 148, gap: 12, rows: 5 } as const;
export const HERO_COLUMNS = { left: 0, right: HERO_DESIGN.width - HERO_TOOLTIP.width } as const;
/** The vertical line each leader routes along, just inside its own column. */
export const HERO_ROUTE_X = { left: 314, right: 686 } as const;

/** Convert a point in the logo's 4096 source space into design units. */
export function sourceToDesign(x: number, y: number) {
  const k = HERO_LOGO_BOX.size / 4096;
  return { x: HERO_LOGO_BOX.x + x * k, y: HERO_LOGO_BOX.y + y * k };
}

/** Source-space → design-space conversion factor for explode offsets. */
const EXPLODE_K = HERO_LOGO_BOX.size / 4096;

export interface HeroAnchorSpec {
  id: string;
  piece: LogoPieceId;
  /** Assembled position, in design units. */
  point: { x: number; y: number };
  /** Which tooltip column this anchor's leader serves. */
  column: "left" | "right";
}

/**
 * Ten anchors, TWO per real piece, every one an actual vertex/edge point of the
 * traced silhouette in `logoGeometry.ts` (so a leader always lands on artwork,
 * never in empty space). Slots are assigned by service order — deterministic.
 */
const RAW_ANCHORS: Array<{ id: string; piece: LogoPieceId; x: number; y: number; column: "left" | "right" }> = [
  // left column (slots 0-4)
  { id: "top-a", piece: "top", x: 148, y: 1954, column: "left" },
  { id: "bottom-a", piece: "bottom", x: 1100, y: 3015, column: "left" },
  { id: "bottom-b", piece: "bottom", x: 2100, y: 3920, column: "left" },
  { id: "fold-a", piece: "fold", x: 2839, y: 1984, column: "left" },
  { id: "top-b", piece: "top", x: 2799, y: 838, column: "left" },
  // right column (slots 5-9)
  { id: "right-a", piece: "right", x: 2260, y: 2809, column: "right" },
  { id: "right-b", piece: "right", x: 3990, y: 2170, column: "right" },
  { id: "leaf-a", piece: "leaf", x: 3845, y: 1100, column: "right" },
  { id: "leaf-b", piece: "leaf", x: 2817, y: 804, column: "right" },
  { id: "fold-b", piece: "fold", x: 3251, y: 1580, column: "right" },
];

/**
 * The anchor point AFTER the piece explodes: the assembled point offset by the
 * piece's own explode vector, so the leader starts exactly where the piece has
 * travelled to (the Hub's proven vectors, shared — never re-invented).
 */
export function anchorPoint(spec: HeroAnchorSpec) {
  const { tx, ty } = HUB_PIECES[spec.piece].explode;
  return {
    x: spec.point.x + tx * EXPLODE_K,
    y: spec.point.y + ty * EXPLODE_K,
  };
}

export const HERO_ANCHORS: HeroAnchorSpec[] = RAW_ANCHORS.map((raw) => ({
  id: raw.id,
  piece: raw.piece,
  column: raw.column,
  point: sourceToDesign(raw.x, raw.y),
}));

/** Slot-geometry for a 0-based slot index, in design units. */
export function tooltipSlot(index: number) {
  const column = index < HERO_TOOLTIP.rows ? "left" : "right";
  const row = index % HERO_TOOLTIP.rows;
  const y = 6 + row * (HERO_TOOLTIP.height + HERO_TOOLTIP.gap);
  const x = column === "left" ? HERO_COLUMNS.left : HERO_COLUMNS.right;
  return {
    column,
    row,
    x,
    y,
    /** The point on the tooltip the leader terminates on. */
    socket: {
      x: column === "left" ? x + HERO_TOOLTIP.width : x,
      y: y + HERO_TOOLTIP.height / 2,
    },
  };
}

/** Percentage helpers for inline absolute positioning inside the diagram. */
export const pctX = (x: number) => `${((x / HERO_DESIGN.width) * 100).toFixed(4)}%`;
export const pctY = (y: number) => `${((y / HERO_DESIGN.height) * 100).toFixed(4)}%`;

/** Orthogonal leader route: anchor → column line → tooltip socket. */
export function leaderPath(index: number, spec: HeroAnchorSpec): string {
  const slot = tooltipSlot(index);
  const from = anchorPoint(spec);
  const routeX = slot.column === "left" ? HERO_ROUTE_X.left : HERO_ROUTE_X.right;
  const mid = slot.column === "left" ? routeX + 12 : routeX - 12;
  return [
    `M ${from.x.toFixed(2)} ${from.y.toFixed(2)}`,
    `L ${routeX.toFixed(2)} ${from.y.toFixed(2)}`,
    `L ${routeX.toFixed(2)} ${slot.socket.y.toFixed(2)}`,
    `L ${mid.toFixed(2)} ${slot.socket.y.toFixed(2)}`,
    `L ${slot.socket.x.toFixed(2)} ${slot.socket.y.toFixed(2)}`,
  ].join(" ");
}

/** Inline style placing a tooltip slot inside the diagram box. */
export function tooltipSlotStyle(index: number): Record<string, string> {
  const slot = tooltipSlot(index);
  return {
    "--tt-l": pctX(slot.x),
    "--tt-t": pctY(slot.y),
    "--tt-w": `${((HERO_TOOLTIP.width / HERO_DESIGN.width) * 100).toFixed(4)}%`,
    "--tt-h": `${((HERO_TOOLTIP.height / HERO_DESIGN.height) * 100).toFixed(4)}%`,
  };
}
