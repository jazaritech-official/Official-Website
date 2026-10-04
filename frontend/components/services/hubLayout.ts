import type { LogoPieceId } from "@/components/services/logoGeometry";

/**
 * EXPLODED LOGO SERVICES HUB — deterministic blueprint geometry.
 *
 * Everything the desktop diagram draws is derived from these numbers. The card
 * positions and the SVG connector paths share the SAME coordinate space, so the
 * layout needs no runtime measurement (no getBoundingClientRect in a loop, no
 * layout thrash) and cannot drift out of alignment.
 *
 * ── WHY THE LAYOUT LOOKS LIKE THIS ──────────────────────────────────────────
 * The real mark is a ribbon diamond with three blue bands and a green leaf. The
 * left/right extremes of the artwork sit at the mark's *waist* (mid-height), so
 * the left and right anchors are naturally clustered near the vertical centre.
 * A card carries a 180-unit-tall block of content, which is far taller than the
 * distance between two anchors on the same side. Perfect horizontal alignment
 * between a card socket and its anchor is therefore geometrically impossible;
 * each trace makes one orthogonal jog instead. That is deliberate and is what a
 * real engineering drawing does.
 *
 * ── MEASURED CONSTRAINT ON THE "fold" PIECE ─────────────────────────────────
 * The fold is the navy tab that sits BEHIND the right band. Its only exposed
 * edge is the crease inside that band, and the crease can only be reached by
 * passing between the top band's widest point (source x=2803) and the green
 * leaf's leftmost point (source x=2819) — a 16-source-pixel gap. Between the
 * bottom band and the right band the channel is 50-96 source pixels wide but
 * runs diagonally at ~45° and therefore cannot be followed by orthogonal
 * routing. At hub size (≈330 px for the whole mark) 16 source px ≈ 1.3 px, so a
 * 1.4 px trace through it would visually touch the artwork on both sides.
 *
 * A trace must never cross the artwork, so the fold is NOT given a misrouted
 * trace. The five services still map 1:1 to five deterministic slots; the slot
 * that represents the fold anchors to the mark's ASSEMBLY NODE — the point
 * where the two lower bands converge at the bottom of the mark — which is
 * reachable from directly below with zero crossings. The card still drives the
 * fold's highlight group, so the piece remains interactive and independently
 * animated. This is a documented, measured trade-off, not an oversight.
 */

/* ── Design space ─────────────────────────────────────────────────────────── */

export const HUB_DESIGN = { width: 1000, height: 700 } as const;

/** The square the traced logo viewBox is fitted into, in design units. */
export const HUB_LOGO_BOX = { x: 340, y: 130, size: 320 } as const;

/** All cards share these dimensions so they are provably equal. */
export const HUB_CARD = { width: 300, height: 180 } as const;

/** Card column geometry, in design units. */
export const HUB_COLUMNS = { left: 0, right: 700 } as const;

/** Row centres for the two side columns. */
export const HUB_ROWS: Record<1 | 2, number> = { 1: 110, 2: 310 };

/**
 * Base layout grid, in design units. Every card origin and card dimension is an
 * exact multiple of this unit, and the diagram's design space is sized so that
 * one unit equals 24px — the site's existing `--grid-fine` blueprint spacing —
 * at HUB_REFERENCE_WIDTH. The diagram itself is fluid, so this is the layout's
 * own grid discipline rather than a screen-pixel snap; the harness asserts the
 * 24px mapping at the reference width.
 */
export const HUB_GRID_UNIT = 20;
export const HUB_REFERENCE_WIDTH = 1200;

/* ── Source → design conversion ───────────────────────────────────────────── */

/** Convert a point in the logo's 4096 source space into hub design units. */
export function sourceToDesign(x: number, y: number) {
  const k = HUB_LOGO_BOX.size / 4096;
  return { x: HUB_LOGO_BOX.x + x * k, y: HUB_LOGO_BOX.y + y * k };
}

const A = (x: number, y: number) => sourceToDesign(x, y);

/**
 * Anchors verified against the traced silhouettes of each piece.
 *
 * EVERY entry here is in DESIGN units. `sourceToDesign` must be applied to raw
 * source coordinates — mixing the two spaces silently produces values above
 * 100% and pushes cards outside the diagram (and the viewport).
 */
export const HUB_ANCHORS = {
  /** Left tip of the top band (source 148,1954). */
  top: A(148, 1954),
  /** Left edge of the bottom band, well below the top band's tip (source 1067,2983). */
  bottom: A(1067, 2983),
  /** Right edge of the green leaf (source 3845,1100). */
  leaf: A(3845, 1100),
  /** Right corner of the right band (source 3998,2174). */
  right: A(3998, 2174),
  /**
   * The mark's assembly node: the bottom vertex where the lower ribbons meet
   * (source 2176, 3922), converted to design units like every other anchor.
   */
  assembly: A(2176, 3922),
} as const;

/* ── Piece specification ──────────────────────────────────────────────────── */

export type HubSide = "left" | "right" | "center";

export interface HubPieceSpec {
  /** SVG group identity, mirrors data-logo-piece in the hub SVG. */
  id: LogoPieceId;
  /** Which anchor this slot's trace terminates on. */
  anchor: { x: number; y: number };
  side: HubSide;
  /** Side-column row (unused for the centred lower card). */
  row?: 1 | 2;
  /** Left/right card socket, in design units. */
  socket: { x: number; y: number };
  /** Orthogonal trace from socket to anchor. Axis-aligned segments only. */
  wire: Array<{ x: number; y: number }>;
  /** Explode translation in SVG user units (viewBox is 4096 wide) + rotation. */
  explode: { tx: number; ty: number; rot: number };
  /** Human note used by the docs and the report. */
  relation: string;
}

const LEFT_EDGE = HUB_COLUMNS.left + HUB_CARD.width; // 300
const RIGHT_EDGE = HUB_COLUMNS.right; // 700

/**
 * Slot table. `hubSlot` 0..4 selects one of these deterministically — services
 * are never shuffled, and any subset of the five resolves to a stable diagram.
 */
export const HUB_SLOT_PIECES: LogoPieceId[] = ["top", "right", "bottom", "fold", "leaf"];

export const HUB_PIECES: Record<LogoPieceId, HubPieceSpec> = {
  /**
   * TOP BAND — light-blue cap and dark navy upper-left ribbon.
   * Explodes up and to the left, away from the mark's centre.
   */
  top: {
    id: "top",
    anchor: HUB_ANCHORS.top,
    side: "left",
    row: 1,
    socket: { x: LEFT_EDGE, y: HUB_ROWS[1] },
    wire: [
      { x: LEFT_EDGE, y: HUB_ROWS[1] },
      { x: 324, y: HUB_ROWS[1] },
      { x: 324, y: HUB_ANCHORS.top.y },
      { x: HUB_ANCHORS.top.x, y: HUB_ANCHORS.top.y },
    ],
    explode: { tx: -95, ty: -115, rot: -2 },
    relation: "top band → upper-left card",
  },

  /**
   * RIGHT BAND — bright diagonal ribbon.
   * Explodes to the right along its own long axis.
   */
  right: {
    id: "right",
    anchor: HUB_ANCHORS.right,
    side: "right",
    row: 2,
    socket: { x: RIGHT_EDGE, y: HUB_ROWS[2] },
    wire: [
      { x: RIGHT_EDGE, y: HUB_ROWS[2] },
      { x: 676, y: HUB_ROWS[2] },
      { x: 676, y: HUB_ANCHORS.right.y },
      { x: HUB_ANCHORS.right.x, y: HUB_ANCHORS.right.y },
    ],
    explode: { tx: 150, ty: 40, rot: 1.8 },
    relation: "right band → lower-right card",
  },

  /**
   * BOTTOM BAND — the deep navy lower ribbon.
   * Explodes down-left along the mark's lower diagonal.
   */
  bottom: {
    id: "bottom",
    anchor: HUB_ANCHORS.bottom,
    side: "left",
    row: 2,
    socket: { x: LEFT_EDGE, y: HUB_ROWS[2] },
    wire: [
      { x: LEFT_EDGE, y: HUB_ROWS[2] },
      { x: 312, y: HUB_ROWS[2] },
      { x: 312, y: HUB_ANCHORS.bottom.y },
      { x: HUB_ANCHORS.bottom.x, y: HUB_ANCHORS.bottom.y },
    ],
    explode: { tx: -40, ty: 140, rot: 2 },
    relation: "bottom band → lower-left card",
  },

  /**
   * RIGHT FOLD — the navy tab behind the right band. Explodes up-right, peeling
   * away from the band that hides it. Its slot anchors to the assembly node; see
   * the measured-constraint note at the top of this file.
   */
  fold: {
    id: "fold",
    anchor: HUB_ANCHORS.assembly,
    side: "center",
    socket: { x: HUB_ANCHORS.assembly.x, y: 480 },
    wire: [
      { x: HUB_ANCHORS.assembly.x, y: 480 },
      { x: HUB_ANCHORS.assembly.x, y: HUB_ANCHORS.assembly.y },
    ],
    // socket.x is 510, so the centred card spans grid-aligned x 360..660.
    explode: { tx: 135, ty: -70, rot: -2.6 },
    relation: "fold → assembly node beneath the mark",
  },

  /**
   * GREEN LEAF — the Growth-Green accent, lifted along its outward normal.
   */
  leaf: {
    id: "leaf",
    anchor: HUB_ANCHORS.leaf,
    side: "right",
    row: 1,
    socket: { x: RIGHT_EDGE, y: HUB_ROWS[1] },
    wire: [
      { x: RIGHT_EDGE, y: HUB_ROWS[1] },
      { x: 688, y: HUB_ROWS[1] },
      { x: 688, y: HUB_ANCHORS.leaf.y },
      { x: HUB_ANCHORS.leaf.x, y: HUB_ANCHORS.leaf.y },
    ],
    explode: { tx: 125, ty: -85, rot: 2.4 },
    relation: "green leaf → upper-right card",
  },
};

/** Design units → percentage of the diagram box (used for inline card styles). */
export const pctX = (x: number) => `${((x / HUB_DESIGN.width) * 100).toFixed(4)}%`;
export const pctY = (y: number) => `${((y / HUB_DESIGN.height) * 100).toFixed(4)}%`;

/**
 * Card slot geometry for a piece, as CSS custom properties.
 *
 * Custom properties — not `left`/`top` — because the same markup renders in two
 * layouts: the mobile column (normal flow) and the desktop diagram (absolute).
 * Applying absolute offsets inline would shift the mobile cards out of the
 * viewport, so only the desktop media query consumes these values.
 *
 * All four values are exact multiples of HUB_GRID_UNIT in design units.
 */
export function cardSlotStyle(piece: LogoPieceId): Record<string, string> {
  const spec = HUB_PIECES[piece];
  const left =
    spec.side === "left"
      ? HUB_COLUMNS.left
      : spec.side === "right"
        ? HUB_COLUMNS.right
        : HUB_ANCHORS.assembly.x - HUB_CARD.width / 2;
  const top = spec.side === "center" ? 480 : HUB_ROWS[spec.row ?? 1] - HUB_CARD.height / 2;
  return {
    "--slot-l": pctX(left),
    "--slot-t": pctY(top),
    "--slot-w": `${((HUB_CARD.width / HUB_DESIGN.width) * 100).toFixed(4)}%`,
    "--slot-h": `${((HUB_CARD.height / HUB_DESIGN.height) * 100).toFixed(4)}%`,
  };
}

/** SVG path for a piece's orthogonal trace (rounded corners via the CSS stroke join). */
export function wirePath(piece: LogoPieceId): string {
  const pts = HUB_PIECES[piece].wire;
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

/**
 * The mark's drawn extent in design units — used to assert that no card and no
 * wire collides with the artwork.
 */
export const HUB_MARK_BOX = {
  left: A(148, 0).x,
  right: A(3998, 0).x,
  top: A(0, 178).y,
  bottom: A(0, 3922).y,
} as const;
