/**
 * Hero shatter field — ~1000 instanced neon shards that tile the REAL logo
 * silhouette and blow apart into a floating cloud, then reassemble.
 *
 * Design (GPU-driven, zero per-frame CPU work):
 *  - The silhouette is rasterised ONCE from the traced `LOGO_PIECES` paths into
 *    an offscreen id-map (which piece owns each pixel).
 *  - A jittered grid samples points inside the mask; each sample becomes one
 *    instance with baked attributes (origin, real-gradient colour, outward
 *    direction, delay, spin, scale). After this, nothing on the CPU touches the
 *    particles again.
 *  - One `uProgress` uniform (0 assembled → 1 shattered) drives position,
 *    rotation and fade entirely in the vertex shader. `uTime` drives the
 *    floating wobble/spin.
 *  - A second, additive instanced layer of billboarded soft quads supplies the
 *    cheap neon halo (no post-processing / bloom pass).
 *
 * Growth Green appears only on shards sampled from the leaf, because colours
 * come from the real per-piece artwork gradients.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import { LOGO_PIECES, type LogoGradient } from "@/components/services/logoGeometry";
import { SOURCE_CENTER, sampleLogoGradient } from "./createLogoPieces";

const MASK_SIZE = 256; // offscreen mask resolution (source 4096 → 256)
const SHARD_TILE = 1.25; // shard footprint vs cell size at progress 0 (no holes)
const DRIFT = 1.05; // outward travel at progress 1 (scene units)

/** Deterministic RNG — identical shard layout every reload. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rasterise the union silhouette into a per-pixel piece-id map. */
function buildIdMap(): Uint8Array | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = MASK_SIZE;
  canvas.height = MASK_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const idMap = new Uint8Array(MASK_SIZE * MASK_SIZE).fill(255);
  const s = MASK_SIZE / 4096;
  const paths = LOGO_PIECES.map((piece) => new Path2D(piece.d));

  for (let i = 0; i < paths.length; i += 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
    ctx.scale(s, s);
    ctx.fillStyle = "#ffffff";
    ctx.fill(paths[i]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const data = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
    for (let p = 0; p < MASK_SIZE * MASK_SIZE; p += 1) {
      if (data[p * 4 + 3] > 128) idMap[p] = i;
    }
  }
  return idMap;
}

interface Sample {
  x: number;
  y: number;
  piece: number;
}

interface SampledGrid {
  points: Sample[];
  /** Cell size in scene units (used for shard scale). */
  cellScene: number;
}

/** Jittered-grid sampling inside the silhouette; deterministic and bounded. */
function sampleSilhouette(count: number, idMap: Uint8Array, scale: number): SampledGrid {
  let inside = 0;
  for (let i = 0; i < idMap.length; i += 1) if (idMap[i] !== 255) inside += 1;
  const fill = inside / idMap.length;

  const rand = mulberry32(0x1a2b3c4d);
  let gridN = Math.max(6, Math.ceil(Math.sqrt(count / Math.max(fill, 0.03))));
  let points: Sample[] = [];
  let cellScene = 0;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    points = [];
    const step = 4096 / gridN;
    cellScene = step * scale;
    for (let gy = 0; gy < gridN; gy += 1) {
      for (let gx = 0; gx < gridN; gx += 1) {
        const sx = (gx + rand()) * step;
        const sy = (gy + rand()) * step;
        const mx = Math.min(MASK_SIZE - 1, ((sx / 4096) * MASK_SIZE) | 0);
        const my = Math.min(MASK_SIZE - 1, ((sy / 4096) * MASK_SIZE) | 0);
        const piece = idMap[my * MASK_SIZE + mx];
        if (piece === 255) continue;
        points.push({ x: sx, y: sy, piece });
      }
    }
    if (points.length >= count) break;
    gridN += Math.max(4, Math.ceil(gridN * 0.25));
  }

  // Shuffle once so ANY prefix is spatially uniform — the FPS downgrade path
  // simply draws fewer instances (mesh.count) without leaving holes.
  for (let i = points.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = points[i];
    points[i] = points[j];
    points[j] = tmp;
  }
  if (points.length > count) points = points.slice(0, count);
  return { points, cellScene };
}

/* ---- Shard geometry: a tiny octahedron (8 triangles, 3D + fresnel) -------- */
function createShardGeometry(): BufferGeometry {
  const verts = [
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
    [0, -1, 0],
    [-1, 0, 0],
    [0, 0, -1],
  ];
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 1],
    [5, 2, 1],
    [5, 3, 2],
    [5, 4, 3],
    [5, 1, 4],
  ];
  const positions = new Float32Array(faces.length * 9);
  let i = 0;
  for (const [a, b, c] of faces) {
    for (const idx of [a, b, c]) {
      positions[i++] = verts[idx][0] * 0.5;
      positions[i++] = verts[idx][1] * 0.5;
      positions[i++] = verts[idx][2] * 0.5;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const SHARD_VERTEX = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec3 aColor;
  attribute vec3 aDir;
  attribute float aDelay;
  attribute float aSpin;
  attribute float aScale;

  uniform float uProgress;
  uniform float uTime;
  uniform float uDrift;

  varying vec3 vColor;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vFade;

  mat3 axisRotate(vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    float t = 1.0 - c;
    return mat3(
      t * axis.x * axis.x + c,            t * axis.x * axis.y - s * axis.z, t * axis.x * axis.z + s * axis.y,
      t * axis.x * axis.y + s * axis.z,   t * axis.y * axis.y + c,          t * axis.y * axis.z - s * axis.x,
      t * axis.x * axis.z - s * axis.y,   t * axis.y * axis.z + s * axis.x, t * axis.z * axis.z + c
    );
  }

  void main() {
    float span = 1.0 - aDelay * 0.6;
    float local = clamp((uProgress - aDelay * 0.6) / span, 0.0, 1.0);
    float ease = local * local * (3.0 - 2.0 * local);

    vec3 axis = normalize(vec3(aDir.y, -aDir.x, 0.35) + vec3(0.0001));
    float angle = (aSpin * 6.2831 + uTime * 0.9 * aSpin) * ease;
    mat3 rot = axisRotate(axis, angle);

    vec3 center = aOrigin + aDir * (ease * uDrift * (1.0 + aSpin * 0.18));
    vec3 transformed = center + rot * (position * aScale);

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vViewPos = mvPosition.xyz;
    vNormalV = normalize(mat3(modelViewMatrix) * (rot * normal));
    vColor = aColor;
    vFade = smoothstep(0.0, 0.045, uProgress);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SHARD_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  varying vec3 vColor;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vFade;

  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(-vViewPos);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
    vec3 col = vColor * (1.25 + 0.9 * fres) + vec3(0.06, 0.12, 0.28) * fres;
    float alpha = clamp(0.6 + 0.4 * fres, 0.0, 1.0) * vFade;
    gl_FragColor = vec4(col * uGlow, alpha);
  }
`;

const GLOW_VERTEX = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec3 aColor;
  attribute vec3 aDir;
  attribute float aDelay;
  attribute float aSpin;
  attribute float aScale;

  uniform float uProgress;
  uniform float uTime;
  uniform float uDrift;
  uniform float uHalo;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    float span = 1.0 - aDelay * 0.6;
    float local = clamp((uProgress - aDelay * 0.6) / span, 0.0, 1.0);
    float ease = local * local * (3.0 - 2.0 * local);
    vec3 center = aOrigin + aDir * (ease * uDrift * (1.0 + aSpin * 0.18));

    vec4 mv = modelViewMatrix * vec4(center, 1.0);
    mv.xy += position.xy * aScale * uHalo;
    vUv = uv;
    vColor = aColor;
    vFade = smoothstep(0.0, 0.045, uProgress);
    gl_Position = projectionMatrix * mv;
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFade;

  void main() {
    float d = length(vUv - vec2(0.5)) * 2.0;
    float halo = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vColor * uGlow, halo * halo * 0.5 * vFade);
  }
`;

export interface ShatterField {
  /** Group added to the ribbon so shards share the logo's frame. */
  group: Group;
  /** Number of live shards (after the tier budget / sampling trim). */
  readonly count: number;
  /** 0 = assembled (tiles the silhouette) → 1 = fully shattered. */
  setProgress(progress: number): void;
  /** Idle clock for the floating wobble/spin. */
  setTime(time: number): void;
  /** Neon strength (dialled down in light mode so it never blows out). */
  setGlow(glow: number): void;
  /** Draw only the first `next` shards (tier downgrade — no rebuild). */
  setBudget(next: number): void;
  dispose(): void;
}

/**
 * Build the shatter field. `count === 0` returns an inert empty field (static /
 * reduced-motion), so the engine can call it unconditionally.
 */
export function createShatterField(
  count: number,
  logoScale: number,
  glow: number,
): ShatterField {
  const group = new Group();
  group.name = "jazari-shatter";
  group.userData.noPick = true; // never a hover target

  if (count <= 0) {
    return {
      group,
      count: 0,
      setProgress: () => {},
      setTime: () => {},
      setGlow: () => {},
      setBudget: () => {},
      dispose: () => {},
    };
  }

  const idMap = buildIdMap();
  if (!idMap) {
    return {
      group,
      count: 0,
      setProgress: () => {},
      setTime: () => {},
      setGlow: () => {},
      setBudget: () => {},
      dispose: () => {},
    };
  }

  const { points, cellScene } = sampleSilhouette(count, idMap, logoScale);
  const total = points.length;
  const shardScale = cellScene * SHARD_TILE;

  const origins = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const dirs = new Float32Array(total * 3);
  const delays = new Float32Array(total);
  const spins = new Float32Array(total);
  const scales = new Float32Array(total);

  const rand = mulberry32(0x5f3759df);
  const color = new Color();
  const gradients: LogoGradient[] = LOGO_PIECES.map((piece) => piece.gradient);

  for (let i = 0; i < total; i += 1) {
    const point = points[i];
    const sceneX = (point.x - SOURCE_CENTER) * logoScale;
    const sceneY = (point.y - SOURCE_CENTER) * logoScale;
    origins[i * 3] = sceneX;
    origins[i * 3 + 1] = sceneY;
    origins[i * 3 + 2] = 0;

    // Real artwork colour at this exact point.
    color.copy(sampleLogoGradient(gradients[point.piece], point.x, point.y));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    // Outward direction: radial from the mark centre (stable, logo-shaped burst).
    const len = Math.hypot(sceneX, sceneY) || 1;
    const jitter = (rand() - 0.5) * 0.35;
    dirs[i * 3] = sceneX / len + jitter;
    dirs[i * 3 + 1] = sceneY / len + jitter * 0.6;
    dirs[i * 3 + 2] = 0.18 + rand() * 0.5;

    // Wave delay: outer shards and the leaf leave first.
    const dist = len / (SOURCE_CENTER * logoScale);
    delays[i] = Math.min(0.6, dist * 0.6 + rand() * 0.18);
    spins[i] = (rand() - 0.5) * 2.4;
    scales[i] = shardScale * (0.85 + rand() * 0.3);
  }

  const geometry = createShardGeometry();
  geometry.setAttribute("aOrigin", new InstancedBufferAttribute(origins, 3));
  geometry.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
  geometry.setAttribute("aDir", new InstancedBufferAttribute(dirs, 3));
  geometry.setAttribute("aDelay", new InstancedBufferAttribute(delays, 1));
  geometry.setAttribute("aSpin", new InstancedBufferAttribute(spins, 1));
  geometry.setAttribute("aScale", new InstancedBufferAttribute(scales, 1));

  const shardMaterial = new ShaderMaterial({
    vertexShader: SHARD_VERTEX,
    fragmentShader: SHARD_FRAGMENT,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uDrift: { value: DRIFT },
      uGlow: { value: glow },
    },
    transparent: true,
    depthWrite: false,
  });

  const shards = new InstancedMesh(geometry, shardMaterial, total);
  shards.frustumCulled = false;
  shards.name = "jazari-shards";
  shards.userData.noPick = true;
  group.add(shards);

  /* --- Additive halo layer (billboarded soft quads) ---------------------- */
  const glowGeometry = new PlaneGeometry(1, 1);
  glowGeometry.setAttribute("aOrigin", new InstancedBufferAttribute(origins, 3));
  glowGeometry.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
  glowGeometry.setAttribute("aDir", new InstancedBufferAttribute(dirs, 3));
  glowGeometry.setAttribute("aDelay", new InstancedBufferAttribute(delays, 1));
  glowGeometry.setAttribute("aSpin", new InstancedBufferAttribute(spins, 1));
  glowGeometry.setAttribute("aScale", new InstancedBufferAttribute(scales, 1));

  const glowMaterial = new ShaderMaterial({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uDrift: { value: DRIFT },
      uGlow: { value: glow },
      uHalo: { value: 3.2 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });

  const halo = new InstancedMesh(glowGeometry, glowMaterial, total);
  halo.frustumCulled = false;
  halo.name = "jazari-shard-halo";
  halo.userData.noPick = true;
  group.add(halo);

  const setProgress = (progress: number): void => {
    shardMaterial.uniforms.uProgress.value = progress;
    glowMaterial.uniforms.uProgress.value = progress;
    // Hidden entirely at rest so the assembled solid logo is clean.
    group.visible = progress > 0.002;
  };

  const setTime = (time: number): void => {
    shardMaterial.uniforms.uTime.value = time;
    glowMaterial.uniforms.uTime.value = time;
  };

  const setGlow = (next: number): void => {
    shardMaterial.uniforms.uGlow.value = next;
    glowMaterial.uniforms.uGlow.value = next;
  };

  const setBudget = (next: number): void => {
    const draw = Math.max(0, Math.min(next, total));
    shards.count = draw;
    halo.count = draw;
  };

  const dispose = (): void => {
    geometry.dispose();
    glowGeometry.dispose();
    shardMaterial.dispose();
    glowMaterial.dispose();
    group.clear();
  };

  group.visible = false;

  return { group, count: total, setProgress, setTime, setGlow, setBudget, dispose };
}

