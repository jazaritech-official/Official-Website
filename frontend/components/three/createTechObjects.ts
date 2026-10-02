/**
 * Supporting tech objects + grounding (spec §19/§23/§68/§69).
 *
 * One chip, one cloud, one shield, one gear, one data cluster — all procedural,
 * art-directed positions around the ribbon diamond (never random), a fake
 * canvas-gradient contact shadow, and a small atmospheric Points field.
 * Visibility follows the quality tier (`supportCount` / `particleCount`).
 *
 * TUNING: positions, scales and sizes are the constants below.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BRAND, type ScenePalette } from "./theme";
import { createLeafMaterial, createSupportMaterial, type MaterialTier } from "./materials";
import { disposeObject } from "./helpers/disposeScene";
import { TAU } from "./helpers/math";

/* ---- Composition constants (TUNING) --------------------------------------
 * Depth staging: the logo sits at z≈0 (foreground); supports are pushed back
 * to midground (z −0.5…−2.6) and the atmosphere hangs furthest. The right side
 * of the frame is deliberately populated (cloud top-right, shield right) so the
 * hero no longer feels empty, while the bottom-right stays clear for the card.
 */
const SUPPORT_POSITIONS: Array<{ name: string; position: [number, number, number] }> = [
  { name: "chip", position: [-2.6, 1.55, -0.6] }, // top-left
  { name: "cloud", position: [2.75, 1.8, -1.2] }, // top-right
  { name: "shield", position: [2.95, -0.85, -0.6] }, // right
  { name: "gear", position: [-2.35, -1.95, -0.7] }, // bottom-left
  { name: "data", position: [-0.2, 2.9, -2.6] }, // top-centre, deepest
];
const SUPPORT_SCALES = [1.28, 1.45, 1.34, 1.22, 1.3];
const SHADOW_Y = -2.05;
const SHADOW_SCALE: [number, number] = [6.6, 2.7];
const POINT_COUNT = 140;
const POINT_SIZE = 0.055;
const POINT_SPREAD = new Vector3(5.2, 3.6, 1.6);

export interface SupportBase {
  position: Vector3;
  spin: number;
  bob: number;
  phase: number;
}

export interface SupportSystem {
  /** Parent of all support objects + shadow + points (parallax as a unit). */
  group: Group;
  /** The five support roots in pick order (quality tier shows a prefix). */
  roots: Object3D[];
  /** Per-object base transforms for the animator. */
  bases: SupportBase[];
  /** Fake contact shadow — restyled per theme. */
  shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Atmospheric points — hidden when the tier budget says so. */
  points: Points<BufferGeometry, PointsMaterial>;
  /** In-place restyle on theme switch (shadow tint/opacity). */
  applyTheme(palette: ScenePalette): void;
  /** Show only the first `count` supporting objects (quality tier). */
  setSupportCount(count: number): void;
  setParticleVisibility(visible: boolean): void;
  dispose(): void;
}

/* ---- Builders (all procedural — no external assets) ---------------------- */

function extrudeSmall(shape: Shape, depth: number): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geometry.center();
  return geometry;
}

function buildChip(tier: MaterialTier): Group {
  const group = new Group();
  const body = new Mesh(
    new RoundedBoxGeometry(0.66, 0.66, 0.16, 4, 0.07),
    createSupportMaterial(BRAND.blue, tier),
  );
  const die = new Mesh(
    new RoundedBoxGeometry(0.3, 0.3, 0.1, 3, 0.04),
    createSupportMaterial(BRAND.navyDeep, tier),
  );
  die.position.z = 0.11;
  const status = new Mesh(new SphereGeometry(0.035, 12, 12), createLeafMaterial(tier));
  status.position.set(0.24, 0.24, 0.1); // micro green status point
  group.add(body, die, status);
  return group;
}

function buildCloud(tier: MaterialTier): Group {
  const group = new Group();
  const material = createSupportMaterial(BRAND.slate, tier);
  const lobes: Array<[number, number, number]> = [
    [-0.24, -0.02, 0.2],
    [0.02, 0.08, 0.26],
    [0.28, -0.04, 0.18],
    [0.04, -0.1, 0.22],
  ];
  for (const [x, y, r] of lobes) {
    const lobe = new Mesh(new SphereGeometry(r, 18, 14), material);
    lobe.position.set(x, y, 0);
    lobe.scale.y = 0.85;
    group.add(lobe);
  }
  return group;
}

function buildShield(tier: MaterialTier): Group {
  const shape = new Shape();
  shape.moveTo(-0.36, 0.42);
  shape.lineTo(0.36, 0.42);
  shape.quadraticCurveTo(0.4, -0.05, 0, -0.58);
  shape.quadraticCurveTo(-0.4, -0.05, -0.36, 0.42);
  shape.closePath();

  const group = new Group();
  group.add(new Mesh(extrudeSmall(shape, 0.13), createSupportMaterial(BRAND.navy, tier)));
  return group;
}

function buildGear(tier: MaterialTier): Group {
  const group = new Group();
  const material = createSupportMaterial(BRAND.blueDeep, tier);
  group.add(new Mesh(new TorusGeometry(0.3, 0.09, 10, 28), material));
  group.add(new Mesh(new SphereGeometry(0.1, 14, 10), material));

  for (let i = 0; i < 8; i += 1) {
    const tooth = new Mesh(new RoundedBoxGeometry(0.12, 0.1, 0.12, 2, 0.03), material);
    const angle = (i / 8) * TAU;
    tooth.position.set(Math.cos(angle) * 0.42, Math.sin(angle) * 0.42, 0);
    tooth.rotation.z = angle;
    group.add(tooth);
  }
  return group;
}

function buildDataNodes(tier: MaterialTier): Group {
  const group = new Group();
  const material = createSupportMaterial(BRAND.slate, tier);
  const nodes: Vector3[] = [
    new Vector3(-0.3, 0.14, 0),
    new Vector3(0.24, 0.26, 0.05),
    new Vector3(0.06, -0.26, -0.04),
    new Vector3(0.36, -0.1, 0.02),
  ];
  for (const node of nodes) {
    const dot = new Mesh(new SphereGeometry(0.06, 12, 10), material);
    dot.position.copy(node);
    group.add(dot);
  }

  const pairs: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
  ];
  const segments: number[] = [];
  for (const [a, b] of pairs) segments.push(...nodes[a].toArray(), ...nodes[b].toArray());

  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute("position", new BufferAttribute(new Float32Array(segments), 3));
  group.add(
    new LineSegments(
      lineGeometry,
      new LineBasicMaterial({ color: BRAND.blue, transparent: true, opacity: 0.5 }),
    ),
  );
  return group;
}

/**
 * Fake contact shadow: white-alpha radial gradient on a runtime-generated
 * canvas, tinted by `palette.shadowColor`. No shadow maps, no dark blob.
 */
function createContactShadow(palette: ScenePalette): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const mesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      color: new Color(palette.shadowColor),
      opacity: palette.shadowOpacity,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = SHADOW_Y;
  mesh.scale.set(SHADOW_SCALE[0], SHADOW_SCALE[1], 1);
  mesh.renderOrder = -1; // always behind the composition
  return mesh;
}

function createAtmosphere(): Points<BufferGeometry, PointsMaterial> {
  const positions = new Float32Array(POINT_COUNT * 3);
  for (let i = 0; i < POINT_COUNT; i += 1) {
    positions[i * 3] = (((i * 73) % 197) / 197 - 0.5) * 2 * POINT_SPREAD.x;
    positions[i * 3 + 1] = (((i * 131) % 199) / 199 - 0.5) * 2 * POINT_SPREAD.y;
    positions[i * 3 + 2] = -1.6 - (((i * 59) % 89) / 89) * POINT_SPREAD.z;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: BRAND.blue,
    size: POINT_SIZE,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new Points(geometry, material);
  points.position.z = -1.2;
  return points;
}

export function createSupportSystem(
  tier: MaterialTier,
  palette: ScenePalette,
): SupportSystem {
  const group = new Group();
  group.name = "tech-support";

  const builders = [buildChip, buildCloud, buildShield, buildGear, buildDataNodes];
  const roots: Object3D[] = [];
  const bases: SupportBase[] = [];

  builders.forEach((build, index) => {
    const root = build(tier);
    const { position } = SUPPORT_POSITIONS[index];
    root.position.set(...position);
    root.scale.setScalar(SUPPORT_SCALES[index]);
    root.userData.baseScale = SUPPORT_SCALES[index]; // hover scales relative to this
    group.add(root);
    roots.push(root);
    bases.push({
      position: root.position.clone(),
      // Art-directed motion hierarchy: each object its own gentle rhythm.
      spin: 0.12 + index * 0.055,
      bob: 0.05 + (index % 3) * 0.025,
      phase: index * 1.7,
    });
  });

  const shadow = createContactShadow(palette);
  const points = createAtmosphere();
  group.add(shadow, points);

  return {
    group,
    roots,
    bases,
    shadow,
    points,
    applyTheme(next): void {
      shadow.material.color.set(next.shadowColor);
      shadow.material.opacity = next.shadowOpacity;
    },
    setSupportCount(count): void {
      roots.forEach((root, index) => {
        root.visible = index < count;
      });
    },
    setParticleVisibility(visible): void {
      points.visible = visible;
    },
    dispose(): void {
      disposeObject(group);
    },
  };
}
