import { LOGO_PIECES, type LogoPieceId } from "@/components/services/logoGeometry";
import { HUB_PIECES } from "@/components/services/hubLayout";
import {
  HERO_ANCHORS,
  HERO_LOGO_BOX,
  HERO_TOOLTIP,
  leaderPoints,
  tooltipSlot,
} from "@/components/sections/heroLayout";

/**
 * HERO FRAGMENTS — the ten real-logo slices the mark "delivers" to its tooltips.
 *
 * ── WHAT A FRAGMENT IS ──────────────────────────────────────────────────────
 * Every fragment is a `clipPath`-cut COPY of a real traced piece (`logoGeometry`
 * `d` + the piece's real gradient). Each of the five pieces is cut in two along a
 * straight line through its own area-weighted centroid, so together the two
 * halves tile the piece EXACTLY: no gap, no overlap, nothing invented. A fragment
 * is never a square, a dot or confetti — it is a recognisable slice of the
 * owner's artwork in the owner's own colours.
 *
 * ── WHY THIS IS PURE ARITHMETIC ─────────────────────────────────────────────
 * Everything here is derived, at module load, from the same two design-space
 * modules the rest of the diagram uses (`logoGeometry.ts` for the artwork,
 * `heroLayout.ts` for the layout), and the slices are clipped with a hand-written
 * Sutherland–Hodgman pass so each slice's own centre is known exactly. Nothing is
 * measured in the browser, nothing is randomised, and the same ten fragments
 * exist on every render on every device — so the flight can never drift from the
 * wire it travels along and the animation path performs ZERO layout reads.
 *
 * ── THE FLIGHT, EXACTLY ─────────────────────────────────────────────────────
 * A slice's rendered centre is `pivot + scale·(sliceCentre − pivot) + translate`
 * (rotation happens about the pivot too). For each sampled step the translate is
 * therefore solved so that the centre sits ON the wire and, at the last step,
 * exactly on the badge socket — which is why a docked slice lands inside its own
 * socket to within a pixel, with no runtime measurement anywhere.
 *
 * ── COORDINATE SPACES ───────────────────────────────────────────────────────
 *   · source space  — the traced 4096×4096 artwork (`clipPath` polygons live here)
 *   · design space  — the 1000×800 diagram (`heroLayout.ts`); the leaders and the
 *                     fragment overlay share it.
 */

const SRC = 4096;
/** Source space → design space scale (the mark's fitted box). */
const K = HERO_LOGO_BOX.size / SRC;

/** Cut angle per piece, degrees, measured from the source-space x axis. */
const CUT_ANGLE: Record<LogoPieceId, number> = {
  top: 38,
  right: -46,
  bottom: 34,
  fold: -24,
  leaf: 62,
};

/** The badge socket inside a tooltip, in design units (card-local offsets). */
export const HERO_BADGE = { size: 26, dx: 24, dy: 22 } as const;

/** Largest scale a slice is allowed to travel at (the owner's 28–32% band). */
export const FRAGMENT_MAX_SCALE = 0.32;

/** Where fragment `index` docks: the centre of its tooltip's badge socket. */
export function badgeCentre(index: number) {
  const slot = tooltipSlot(index);
  return {
    x: slot.x + HERO_BADGE.dx + HERO_BADGE.size / 2,
    y: slot.y + HERO_BADGE.dy + HERO_BADGE.size / 2,
  };
}

interface Point {
  x: number;
  y: number;
}

/** Every traced path is straight-line `M`/`L` data (see logoGeometry.ts). */
function polygon(d: string): Point[] {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const points: Point[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: Number(numbers[i]), y: Number(numbers[i + 1]) });
  }
  return points;
}

/** Area-weighted centroid of a closed polygon (falls back to the vertex mean). */
function centroid(points: Point[]): Point {
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area2) < 1e-6) {
    const mean = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: mean.x / points.length, y: mean.y / points.length };
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

/** Signed distance of a point from the cut line (positive = the kept side). */
function lineSide(p: Point, origin: Point, normal: Point) {
  return (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y;
}

/**
 * Sutherland–Hodgman clip of a polygon against ONE half-plane, so a slice's own
 * extent (and therefore its own centre) is exact rather than guessed.
 */
function clipHalfPlane(points: Point[], origin: Point, normal: Point): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const da = lineSide(a, origin, normal);
    const db = lineSide(b, origin, normal);
    if (da >= 0) out.push(a);
    if ((da >= 0 && db < 0) || (da < 0 && db >= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function bounds(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** One side of the cut line as a huge rectangle (the SVG `clipPath` polygon). */
function halfPlanePolygon(p: Point, angleDeg: number, side: 1 | -1): Point[] {
  const t = (angleDeg * Math.PI) / 180;
  const along = { x: Math.cos(t), y: Math.sin(t) };
  const normal = { x: -Math.sin(t), y: Math.cos(t) };
  const L = 6000;
  return [
    { x: p.x - L * along.x, y: p.y - L * along.y },
    { x: p.x + L * along.x, y: p.y + L * along.y },
    { x: p.x + L * along.x + side * L * normal.x, y: p.y + L * along.y + side * L * normal.y },
    { x: p.x - L * along.x + side * L * normal.x, y: p.y - L * along.y + side * L * normal.y },
  ];
}

const pointsAttr = (points: Point[]) =>
  points.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");

/** Evenly spaced samples along a polyline, parameterised by arc length. */
function polylineSamples(points: Point[], count: number): Point[] {
  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segments.push(length);
    total += length;
  }
  const out: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const target = (i / (count - 1)) * total;
    let walked = 0;
    let point = points[points.length - 1];
    for (let s = 0; s < segments.length; s += 1) {
      const last = s === segments.length - 1;
      if (walked + segments[s] >= target || last) {
        const local = segments[s] > 0 ? Math.min(1, Math.max(0, (target - walked) / segments[s])) : 0;
        const a = points[s];
        const b = points[s + 1];
        point = { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
        break;
      }
      walked += segments[s];
    }
    out.push(point);
  }
  return out;
}

/** Keyframe samples along a wire — enough for a smooth orthogonal path. */
export const FLIGHT_SAMPLES = 16;

/** One animation step: where the slice's CENTRE is, and how it is oriented. */
export interface FlightStep {
  /** Translate applied to the slice group, in design units (= SVG user units). */
  translate: Point;
  scale: number;
  rotate: number;
  /** Keyframe offset in [0, 1]. */
  offset: number;
}

export interface HeroFragmentSpec {
  /** 0-based, matches the tooltip slot it docks in. */
  index: number;
  piece: LogoPieceId;
  /** Which half of the cut this fragment is. */
  half: "a" | "b";
  /** `clipPath` id (also asserted by the harness). */
  clipId: string;
  /** The clip polygon in source space. */
  clipPoints: string;
  /** The piece's own gradient id, re-declared inside the fragment overlay. */
  gradientId: string;
  /** The piece path (a real slice of the artwork, never a primitive). */
  pathData: string;
  /** Content placement in design space: source space translated + scaled. */
  origin: Point;
  /** Design-space pivot = the piece's centroid in the split pose. */
  pivot: Point;
  /** The slice's own centre in the split pose (design space). */
  centre: Point;
  /** The scale this slice docks at (≤ FRAGMENT_MAX_SCALE). */
  dockScale: number;
  /** The wire this slice travels: its centre's route, in design space. */
  wire: Point[];
  /** The precomputed animation steps (translate/scale/rotate/offset). */
  steps: FlightStep[];
}

/** The keyframe profile: shrink early, arrive with the smallest pop. */
function stepProfile(dockScale: number): number[] {
  const scales: number[] = [];
  for (let i = 0; i < FLIGHT_SAMPLES; i += 1) {
    const u = i / (FLIGHT_SAMPLES - 1);
    if (u >= 1) scales.push(dockScale);
    else if (u >= 0.95) scales.push(dockScale * (i === FLIGHT_SAMPLES - 1 ? 1 : 1.08));
    else scales.push(1 - (1 - dockScale) * Math.pow(u, 0.7));
  }
  return scales;
}

/** Build the ten fragments: one per tooltip slot, two per real piece. */
function buildFragments(): HeroFragmentSpec[] {
  return HERO_ANCHORS.map((anchor, index) => {
    const piece = LOGO_PIECES.find((candidate) => candidate.id === anchor.piece);
    if (!piece) throw new Error(`unknown logo piece: ${anchor.piece}`);
    const vertices = polygon(piece.d);
    const cut = centroid(vertices);
    const half: "a" | "b" = anchor.id.endsWith("-b") ? "b" : "a";
    const side: 1 | -1 = half === "a" ? 1 : -1;
    const explode = HUB_PIECES[anchor.piece].explode;

    const angle = (CUT_ANGLE[anchor.piece] * Math.PI) / 180;
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    /** The slice's own outline and centre, in source space, exactly. */
    const slice = clipHalfPlane(vertices, cut, { x: normal.x * side, y: normal.y * side });
    const sliceBounds = bounds(slice);

    /** The piece's split pose in design space (the fragments start here). */
    const origin = {
      x: HERO_LOGO_BOX.x + explode.tx * K,
      y: HERO_LOGO_BOX.y + explode.ty * K,
    };
    const pivot = { x: origin.x + cut.x * K, y: origin.y + cut.y * K };
    const centre = { x: origin.x + sliceBounds.cx * K, y: origin.y + sliceBounds.cy * K };
    const longest = Math.max(sliceBounds.width, sliceBounds.height) * K;
    const dockScale = Math.min(FRAGMENT_MAX_SCALE, HERO_BADGE.size / Math.max(longest, 1));

    const to = badgeCentre(index);
    /**
     * The wire the slice follows: it lifts off from its OWN centre (so the cut
     * cross-fade has no seam), joins the leader route the tooltip already draws,
     * and ends on the badge socket instead of the card edge.
     */
    const wire = [centre, ...leaderPoints(index, anchor).slice(1, -1), to];
    const samples = polylineSamples(wire, FLIGHT_SAMPLES);
    const scales = stepProfile(dockScale);

    const steps: FlightStep[] = samples.map((point, i) => {
      const scale = scales[i];
      const u = i / (FLIGHT_SAMPLES - 1);
      return {
        translate: {
          x: point.x - pivot.x - scale * (centre.x - pivot.x),
          y: point.y - pivot.y - scale * (centre.y - pivot.y),
        },
        scale,
        rotate: explode.rot === 0 ? 0 : -explode.rot * Math.min(1, u / 0.9),
        offset: u,
      };
    });

    return {
      index,
      piece: anchor.piece,
      half,
      clipId: `hero-fragclip-${index}`,
      clipPoints: pointsAttr(halfPlanePolygon(cut, CUT_ANGLE[anchor.piece], side)),
      gradientId: `hero-frag-jazari-logo-grad-${anchor.piece}`,
      pathData: piece.d,
      origin,
      pivot,
      centre,
      dockScale,
      wire,
      steps,
    };
  });
}

export const HERO_FRAGMENTS: HeroFragmentSpec[] = buildFragments();

/** Design-unit → percentage helpers for the badge socket (card-local). */
export const badgeStyle = {
  left: `${((HERO_BADGE.dx / HERO_TOOLTIP.width) * 100).toFixed(3)}%`,
  top: `${((HERO_BADGE.dy / HERO_TOOLTIP.height) * 100).toFixed(3)}%`,
  width: `${((HERO_BADGE.size / HERO_TOOLTIP.width) * 100).toFixed(3)}%`,
  /** The head row clears the socket: its own left padding, same units. */
  headPad: `${(((HERO_BADGE.dx + HERO_BADGE.size + 8) / HERO_TOOLTIP.width) * 100).toFixed(3)}%`,
} as const;

/** Exported for the harness: the split pose travel budget, in design units. */
export const FRAGMENT_MAX_TRAVEL = Math.max(
  ...Object.values(HUB_PIECES).map((spec: { explode: { tx: number; ty: number } }) =>
    Math.hypot(spec.explode.tx, spec.explode.ty),
  ),
) / SRC;
