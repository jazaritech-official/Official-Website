/**
 * The Jazari ribbon diamond — 100% procedural geometry (spec §5/§17).
 *
 * Built to match the REAL `public/Main Logo.png`: a rotated-square (diamond)
 * silhouette of **four straight ribbon bands** — one per side — with flat outer
 * edges, rounded outer corners and gaps at the four vertices. The top-right
 * band carries a **lighter-blue fold triangle**, the lower-right band carries a
 * **darker overlapping fold**, and a small **Growth-Green leaf** with one
 * rounded corner sits at the top-right.
 *
 * No annular arcs, no torus approximation, no generic X.
 *
 * GEOMETRY MODEL
 *   A diamond is a square rotated 45°. With an inradius `R` (distance from the
 *   centre to each edge midpoint), each edge midpoint is at `R` along
 *   45° + 90°·k and the edge length is `2R`. Each band is a straight extruded
 *   strip placed at that midpoint, rotated so its local +Y (the outer edge)
 *   points outward and its local +X runs along the tangent.
 *
 * TUNING: every dimension is a constant below (see the tuning guide in
 * PROJECT_NOTES §27 → "Logo geometry").
 */

import {
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  Vector3,
  type ExtrudeGeometryOptions,
} from "three";
import { BRAND } from "./theme";
import { createLeafMaterial, createRibbonMaterial, type MaterialTier } from "./materials";
import { disposeObject } from "./helpers/disposeScene";

/* ---- Ribbon band parameters (TUNING) ------------------------------------- */
const R = 1.15; // inradius — distance from centre to each edge midpoint
const W = 0.5; // ribbon width (radial thickness)
const EDGE_LEN = 2 * R; // 2.30
const GAP = 0.3; // gap half-length at each vertex (×2 per band)
const BAND_LEN = EDGE_LEN - 2 * GAP; // 1.70 — the straight band length
const DEPTH = 0.34; // extrusion depth
const BEVEL = 0.055; // edge bevel — premium moulded feel
const OUTER_RADIUS = 0.12; // rounded OUTER corners only
const TILT = 0.05; // slight X tilt for dimensionality
const FOLD_SIZE = 0.26; // top/right fold triangle size
const LEAF_SIZE = 0.34; // green leaf scale

const HALF = { len: BAND_LEN / 2, width: W / 2 };

export interface RibbonPieceSpec {
  /** Stable id for animation bookkeeping. */
  id: string;
  color: string;
  /** Target (assembled) rotation around Z. */
  targetRotationZ: number;
  /** Assembly start offset: rotational skew. */
  startRotationZ: number;
  startPosition: Vector3;
}

export interface JazariRibbon {
  /** Parent group — engine positions/scales this, pieces stay local. */
  group: Group;
  /** The four straight ribbon bands. */
  pieces: Mesh[];
  /** Growth-green leaf (also the hotspot anchor). */
  leaf: Mesh;
  specs: RibbonPieceSpec[];
  /** World-space hotspot anchor (the leaf, top-right of the diamond). */
  anchor: Mesh;
  dispose(): void;
}

/**
 * A straight ribbon band: rounded outer corners, flat ends, extruded with a
 * soft bevel. Long axis = X (tangent), outer edge = +Y (radial outward).
 */
function createBandGeometry(): ExtrudeGeometry {
  const { len, width } = HALF;
  const r = OUTER_RADIUS;
  const shape = new Shape();

  // Outer edge (rounded at both ends), inner edge square.
  shape.moveTo(-len + r, width);
  shape.lineTo(len - r, width);
  shape.quadraticCurveTo(len, width, len, width - r);
  shape.lineTo(len, -width);
  shape.lineTo(-len, -width);
  shape.lineTo(-len, width - r);
  shape.quadraticCurveTo(-len, width, -len + r, width);
  shape.closePath();

  const parameters: ExtrudeGeometryOptions = {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 6,
  };
  const geometry = new ExtrudeGeometry(shape, parameters);
  geometry.center(); // front face at +DEPTH/2, pivots around the band centre
  return geometry;
}

/** A right-triangle wedge (fold) laid over a band's outer corner. */
function createFoldGeometry(size: number, depth: number): ExtrudeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(size, 0);
  shape.lineTo(0, -size * 0.9);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geometry.center();
  return geometry;
}

/**
 * Growth-green leaf: a small triangular accent with ONE rounded corner, placed
 * at the top-right of the diamond. Green stays a micro-accent (spec §4).
 */
function createLeafGeometry(): ExtrudeGeometry {
  const s = LEAF_SIZE;
  const shape = new Shape();
  shape.moveTo(-0.5 * s, -0.32 * s);
  shape.lineTo(0.5 * s, -0.32 * s);
  shape.lineTo(0.5 * s, 0.18 * s);
  shape.quadraticCurveTo(0.5 * s, 0.78 * s, 0, 0.78 * s); // one rounded corner
  shape.lineTo(-0.5 * s, -0.32 * s);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geometry.center();
  return geometry;
}

const PIECE_COLORS = [BRAND.navy, BRAND.blue, BRAND.navyDeep, BRAND.blueDeep];

export function createJazariRibbon(tier: MaterialTier): JazariRibbon {
  const group = new Group();
  group.name = "jazari-ribbon";

  const bandGeometry = createBandGeometry();
  const foldGeometry = createFoldGeometry(FOLD_SIZE, 0.07);
  const pieces: Mesh[] = [];
  const specs: RibbonPieceSpec[] = [];

  for (let index = 0; index < 4; index += 1) {
    // Edge midpoint direction (outward normal) for each side.
    const normalAngle = Math.PI / 4 + index * (Math.PI / 2);
    // Rotate so local +Y is the outward normal and local +X runs along the edge.
    const targetRotationZ = normalAngle - Math.PI / 2;

    const material = createRibbonMaterial(PIECE_COLORS[index], tier);
    const piece = new Mesh(bandGeometry, material);
    piece.name = `ribbon-${index}`;
    piece.rotation.set(index % 2 === 0 ? -TILT : TILT, 0, targetRotationZ);
    piece.position.set(
      Math.cos(normalAngle) * R,
      Math.sin(normalAngle) * R,
      index % 2 === 0 ? 0.06 : -0.06, // alternating z-stagger ⇒ woven read
    );

    // --- Folds: lighter-blue on the top-right band (index 0), darker
    // overlapping fold on the lower-right band (index 3). Both sit at the
    // band's local -X end (toward the top / right vertices).
    if (index === 0) {
      const fold = new Mesh(foldGeometry, createRibbonMaterial(BRAND.blueSoft, tier));
      fold.name = "ribbon-top-fold";
      fold.position.set(-HALF.len + FOLD_SIZE * 0.5, HALF.width - FOLD_SIZE * 0.35, DEPTH / 2 - 0.02);
      fold.rotation.z = Math.PI; // point the wedge into the top vertex
      piece.add(fold);
    }
    if (index === 3) {
      const fold = new Mesh(foldGeometry, createRibbonMaterial(BRAND.blueDeep, tier));
      fold.name = "ribbon-right-fold";
      fold.position.set(-HALF.len + FOLD_SIZE * 0.55, HALF.width - FOLD_SIZE * 0.3, DEPTH / 2 + 0.015);
      fold.rotation.z = Math.PI;
      fold.scale.setScalar(1.1); // slightly larger ⇒ reads as an overlap
      piece.add(fold);
    }

    // Assembly start (used by the animator): pushed out radially with a skew.
    const startPosition = new Vector3(
      Math.cos(normalAngle) * (R + 0.9),
      Math.sin(normalAngle) * (R + 0.9),
      (index % 2 ? -1 : 1) * 0.6,
    );
    const startRotationZ = targetRotationZ + (index % 2 === 0 ? -0.5 : 0.5);

    group.add(piece);
    pieces.push(piece);
    specs.push({
      id: `ribbon-${index}`,
      color: PIECE_COLORS[index],
      targetRotationZ,
      startRotationZ,
      startPosition,
    });
  }

  // Growth-green leaf — micro accent, top-right of the diamond (spec §4).
  const leaf = new Mesh(createLeafGeometry(), createLeafMaterial(tier));
  leaf.name = "ribbon-leaf";
  leaf.position.set(R * 0.72, R * 0.98, 0.2);
  leaf.rotation.set(0.1, -0.08, -0.35);
  group.add(leaf);

  return {
    group,
    pieces,
    leaf,
    specs,
    anchor: leaf,
    dispose(): void {
      // Disposing shared geometry once via traversal is safe — BufferGeometry
      // disposal is idempotent.
      disposeObject(group);
    },
  };
}

export const RIBBON_CONSTANTS = {
  R,
  W,
  EDGE_LEN,
  GAP,
  BAND_LEN,
  DEPTH,
  BEVEL,
  OUTER_RADIUS,
  FOLD_SIZE,
  LEAF_SIZE,
} as const;
