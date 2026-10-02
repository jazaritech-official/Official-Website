/**
 * The Jazari ribbon diamond — 100% procedural geometry (spec §5/§17).
 *
 * Four beveled arc-ribbon pieces with 4-fold rotational symmetry: each arc
 * bulges toward a diagonal (NE/SE/SW/NW) so the silhouette reads as the
 * Jazari diamond, while the cardinal gaps let the pieces float, separate and
 * assemble independently. A tiny Growth-Green leaf marks the top-right.
 *
 * TUNING: every dimension (radius, width, span, depth, piece rotation, leaf
 * placement) is a constant in this file.
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

/* ---- Ribbon arc parameters (TUNING) ------------------------------------- */
const ARC_RADIUS = 1.16; // centerline radius of each ribbon arc
const ARC_WIDTH = 0.42; // ribbon width (radial)
const ARC_SPAN = (76 * Math.PI) / 180; // angular span → 14° gaps at cardinals
const ARC_DEPTH = 0.3; // extrusion depth
const BEVEL = 0.045; // edge bevel — premium molded feel
const PIECE_TILT = 0.055; // slight X tilt for dimensionality

export interface RibbonPieceSpec {
  /** Stable id for animation bookkeeping. */
  id: string;
  color: string;
  /** Target (assembled) rotation around Z — 45° + 90°·k. */
  targetRotationZ: number;
  /** Assembly start offset: radial push-out + rotational skew. */
  startRotationZ: number;
  startPosition: Vector3;
}

export interface JazariRibbon {
  /** Parent group — engine positions/scales this, pieces stay local. */
  group: Group;
  pieces: Mesh[];
  leaf: Mesh;
  specs: RibbonPieceSpec[];
  /** World-space hotspot anchor (the leaf, top-right of the diamond). */
  anchor: Mesh;
  dispose(): void;
}

/**
 * Annular-sector shape with rounded caps, extruded with a soft bevel.
 * Built entirely in code — no external models (spec §8).
 */
function createArcRibbonGeometry(): ExtrudeGeometry {
  const half = ARC_SPAN / 2;
  const rOut = ARC_RADIUS + ARC_WIDTH / 2;
  const rIn = ARC_RADIUS - ARC_WIDTH / 2;
  const capBulge = ARC_WIDTH * 0.38;

  const polar = (radius: number, angle: number): [number, number] => [
    radius * Math.cos(angle),
    radius * Math.sin(angle),
  ];
  const tangent = (angle: number, direction: 1 | -1): [number, number] =>
    direction === 1 ? [-Math.sin(angle), Math.cos(angle)] : [Math.sin(angle), -Math.cos(angle)];

  const shape = new Shape();

  // Outer arc (CCW), then a rounded cap down to the inner radius…
  shape.absarc(0, 0, rOut, -half, half, false);
  {
    const [mx, my] = polar(ARC_RADIUS, half);
    const [tx, ty] = tangent(half, 1);
    const [ex, ey] = polar(rIn, half);
    shape.quadraticCurveTo(mx + tx * capBulge, my + ty * capBulge, ex, ey);
  }
  // …inner arc (CW) back, then the second rounded cap closes the loop.
  shape.absarc(0, 0, rIn, half, -half, true);
  {
    const [mx, my] = polar(ARC_RADIUS, -half);
    const [tx, ty] = tangent(-half, -1);
    const [ex, ey] = polar(rOut, -half);
    shape.quadraticCurveTo(mx + tx * capBulge, my + ty * capBulge, ex, ey);
  }
  shape.closePath();

  const parameters: ExtrudeGeometryOptions = {
    depth: ARC_DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 20,
  };
  const geometry = new ExtrudeGeometry(shape, parameters);
  geometry.center(); // z-center the piece so tilts pivot around its middle
  return geometry;
}

/** Tiny leaf: two mirrored quadratic curves, extruded (top-right accent). */
function createLeafGeometry(): ExtrudeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.14, 0.1, 0.3, 0.36); // outer edge to tip
  shape.quadraticCurveTo(0.1, 0.2, 0, 0); // inner edge back
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geometry.center();
  return geometry;
}

const PIECE_COLORS = [BRAND.navy, BRAND.blue, BRAND.navyDeep, BRAND.blueDeep];

export function createJazariRibbon(tier: MaterialTier): JazariRibbon {
  const group = new Group();
  group.name = "jazari-ribbon";

  const arcGeometry = createArcRibbonGeometry();
  const pieces: Mesh[] = [];
  const specs: RibbonPieceSpec[] = [];

  for (let index = 0; index < 4; index += 1) {
    const material = createRibbonMaterial(PIECE_COLORS[index], tier);
    const piece = new Mesh(arcGeometry, material);
    piece.name = `ribbon-${index}`;

    // Target: bulges at the diagonals → diamond orientation.
    const targetRotationZ = Math.PI / 4 + index * (Math.PI / 2);
    piece.rotation.set(index % 2 === 0 ? -PIECE_TILT : PIECE_TILT, 0, targetRotationZ);

    // Assembly start (used by the Phase 4 state machine): pushed out
    // radially with a rotational skew — elegant, never explosive.
    const pushAngle = Math.PI / 4 + index * (Math.PI / 2);
    const startPosition = new Vector3(Math.cos(pushAngle) * 1.15, Math.sin(pushAngle) * 1.15, (index % 2 ? -1 : 1) * 0.55);
    const startRotationZ = targetRotationZ + (index % 2 === 0 ? -0.5 : 0.5);

    // Alternating z-stagger: assembled pieces keep a woven, dimensional read
    // instead of a flat ring (targets are captured from these transforms).
    piece.position.set(0, 0, index % 2 === 0 ? 0.055 : -0.055);

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
  leaf.position.set(0.62, 1.42, 0.16);
  leaf.rotation.set(0.12, -0.1, 0.35);
  group.add(leaf);

  return {
    group,
    pieces,
    leaf,
    specs,
    anchor: leaf,
    dispose(): void {
      // Disposing the shared arc geometry once via traversal is safe —
      // BufferGeometry.dispose() is idempotent.
      disposeObject(group);
    },
  };
}

export const RIBBON_CONSTANTS = {
  ARC_RADIUS,
  ARC_WIDTH,
  ARC_SPAN,
  ARC_DEPTH,
} as const;
