#!/usr/bin/env node
/**
 * trace-logo.mjs — DEV-ONLY logo vectoriser for the Jazari Tech "Our Services Hub".
 *
 * WHY THIS EXISTS
 * ---------------
 * The exploded-logo services hub must use the OWNER'S REAL logotype as vector
 * geometry. Hand-drawing "a shape inspired by the logo" produced capsule/pill
 * bar approximations that did not match the artwork. This utility derives the
 * five logo pieces directly from the source pixels so the assembled SVG is a
 * measured, verifiable match rather than an eyeballed approximation.
 *
 * SOURCE OF TRUTH
 * ---------------
 *   frontend/public/Main Logo.png   (4096x4096, RGBA, genuine alpha channel)
 * The owner intends to publish the same image as `frontend/public/Real Logo.png`;
 * this script auto-detects either path. The original file is only ever READ,
 * never written to or modified.
 *
 * DEPENDENCIES
 * ------------
 * Uses `sharp`, which is already installed in Backend/ for the server-side image
 * pipeline. It is resolved from Backend/node_modules deliberately so that the
 * frontend dependency list stays untouched (no new dependency is added here).
 *
 * OUTPUT
 * ------
 *   frontend/components/services/logoGeometry.ts   generated path + gradient data
 *   frontend/test-output/screenshots/logo-*.png    fidelity artefacts
 * and prints the measured silhouette IoU, which must be >= 0.95.
 *
 * Run with:  npm run trace:logo      (from frontend/)
 */

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FE = path.resolve(__dirname, "..");
const ROOT = path.resolve(FE, "..");
const BACKEND = path.join(ROOT, "Backend");
const SHOT_DIR = path.join(FE, "test-output", "screenshots");
const OUT_TS = path.join(FE, "components", "services", "logoGeometry.ts");

const requireFromBackend = createRequire(path.join(BACKEND, "noop.js"));
let sharp;
try {
  sharp = requireFromBackend("sharp");
} catch {
  console.error(
    "[trace-logo] `sharp` is required and was expected from Backend/node_modules.\n" +
      "            Do NOT add it to frontend/package.json — install it under Backend/ instead."
  );
  process.exit(3);
}

const CANDIDATES = [
  path.join(FE, "public", "Real Logo.png"),
  path.join(FE, "public", "Main Logo.png"),
];
const SRC = CANDIDATES.find((p) => fs.existsSync(p));
if (!SRC) {
  console.error(
    "[trace-logo] Real logo source asset is MISSING.\n" +
      "            Expected one of:\n" +
      CANDIDATES.map((p) => "              " + path.relative(ROOT, p)).join("\n") +
      "\n            Refusing to invent or approximate the artwork."
  );
  process.exit(4);
}

/* ------------------------------------------------------------------ tuning */

const ALPHA_IN = 128; // >= this counts as "inside" for the silhouette
const DP_TOL = Number(process.env.LOGO_DP_TOL ?? 2.0); // Douglas-Peucker tolerance, source pixels (4096 space)
const GRADIENT_BINS = 16; // colour stops sampled along the fitted gradient axis
const FOLD_EDGE_STEP = 35; // luminance step that marks the fold crease
const FOLD_Y_MARGIN = 2; // crease survives a couple of rows past the last sample
// NOTE ON ROUNDED CORNERS: an earlier revision fitted quadratic Beziers over runs
// of short same-direction segments. Measured against the source silhouette it
// DEGRADED fidelity (IoU 0.872-0.959 depending on tolerance, versus 0.998 for the
// plain simplified polygon) because the fitted control point bulges outside the
// true artwork. The artwork's rounded outer corners are therefore reproduced as
// tight polylines bounded by DP_TOL, i.e. within ~2px of 4096 (0.05% of the mark,
// sub-pixel once displayed at hub size). Fidelity wins over curve cosmetics here.

/* -------------------------------------------------------- image + masks */

const raw = fs.readFileSync(SRC);
const meta = await sharp(raw, { limitInputPixels: false }).metadata();
const { data, info } = await sharp(raw, { limitInputPixels: false })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;
const ALPHA = (x, y) => data[(y * W + x) * C + 3];

/** 4-connectivity would split anti-aliased joins; 8-connectivity matches the artwork. */
function labelComponents() {
  const label = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  const comps = [];
  for (let s = 0; s < W * H; s++) {
    if (ALPHA(s % W, (s - (s % W)) / W) <= ALPHA_IN || label[s] !== -1) continue;
    const id = comps.length;
    let sp = 0;
    stack[sp++] = s;
    label[s] = id;
    let area = 0;
    const box = [W, H, -1, -1];
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % W;
      const py = (p - px) / W;
      area++;
      if (px < box[0]) box[0] = px;
      if (py < box[1]) box[1] = py;
      if (px > box[2]) box[2] = px;
      if (py > box[3]) box[3] = py;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= W) continue;
          if (!dx && !dy) continue;
          const q = ny * W + nx;
          if (ALPHA(nx, ny) > ALPHA_IN && label[q] === -1) {
            label[q] = id;
            stack[sp++] = q;
          }
        }
      }
    }
    comps.push({ id, area, box });
  }
  comps.sort((a, b) => b.area - a.area);
  return { label, comps };
}

/** Locate the fold crease inside the right band: per-row max "brightening" step. */
function fitCrease(comp, label) {
  const pts = [];
  for (let y = comp.box[1] + 2; y <= comp.box[3] - 2; y++) {
    let L = -1;
    let R = -1;
    for (let x = comp.box[0]; x <= comp.box[2]; x++) {
      if (label[y * W + x] === comp.id) {
        if (L < 0) L = x;
        R = x;
      }
    }
    if (L < 0 || R - L < 40) continue;
    let best = 0;
    let bx = -1;
    for (let x = L + 8; x <= R - 8; x += 2) {
      const oa = (y * W + (x - 6)) * C;
      const ob = (y * W + (x + 6)) * C;
      const la = 0.299 * data[oa] + 0.587 * data[oa + 1] + 0.114 * data[oa + 2];
      const lb = 0.299 * data[ob] + 0.587 * data[ob + 1] + 0.114 * data[ob + 2];
      const d = lb - la;
      if (d > best) {
        best = d;
        bx = x;
      }
    }
    if (best > FOLD_EDGE_STEP) pts.push([bx, y]);
  }
  if (pts.length < 25) return null;
  let sy = 0;
  let sx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sy += y;
    sx += x;
    syy += y * y;
    sxy += y * x;
  }
  const k = pts.length;
  const a = (k * sxy - sy * sx) / (k * syy - sy * sy);
  const b = (sx - a * sy) / k;
  return { a, b, yStart: pts[0][1], yEnd: pts[k - 1][1] + FOLD_Y_MARGIN, pts: k };
}

/** Binary mask for one piece, cropped to its own bbox. */
function maskFor(comp, label, chevron) {
  const box = [...comp.box];
  const w = box[2] - box[0] + 1;
  const h = box[3] - box[1] + 1;
  const m = new Uint8Array(w * h);
  for (let y = box[1]; y <= box[3]; y++) {
    for (let x = box[0]; x <= box[2]; x++) {
      if (label[y * W + x] !== comp.id) continue;
      if (chevron && !chevron(x, y)) continue;
      m[(y - box[1]) * w + (x - box[0])] = 1;
    }
  }
  return { mask: m, box, w, h };
}

/* ------------------------------------------------------------- contouring */

/** Crack-following contour: polygon whose interior equals the mask exactly. */
function traceMask(mask, w, h) {
  const get = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  const edges = new Map(); // "x,y" -> [x2,y2][]
  const push = (x, y, x2, y2) => {
    const k = x + "," + y;
    const arr = edges.get(k);
    if (arr) arr.push(x2 + "," + y2);
    else edges.set(k, [x2 + "," + y2]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!get(x, y)) continue;
      if (!get(x, y - 1)) push(x, y, x + 1, y);
      if (!get(x + 1, y)) push(x + 1, y, x + 1, y + 1);
      if (!get(x, y + 1)) push(x + 1, y + 1, x, y + 1);
      if (!get(x - 1, y)) push(x, y + 1, x, y);
    }
  }
  const loops = [];
  while (edges.size) {
    // start from the topmost, then leftmost, remaining edge origin
    let startKey = null;
    let best = [Infinity, Infinity];
    for (const k of edges.keys()) {
      const [x, y] = k.split(",").map(Number);
      if (y < best[1] || (y === best[1] && x < best[0])) {
        best = [x, y];
        startKey = k;
      }
    }
    const poly = [];
    let cur = startKey;
    for (let guard = 0; guard < w * h * 8; guard++) {
      const outs = edges.get(cur);
      if (!outs || !outs.length) break;
      const next = outs.pop();
      if (!outs.length) edges.delete(cur);
      const [cx, cy] = cur.split(",").map(Number);
      poly.push([cx, cy]);
      if (next === startKey && poly.length > 2) break;
      cur = next;
    }
    if (poly.length > 2) loops.push(poly);
  }
  loops.sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)));
  return loops;
}

function polyArea(p) {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  }
  return s / 2;
}

const perp = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
};

/** Drop points that already lie on the straight line through their neighbours. */
function mergeCollinear(pts) {
  const n = pts.length;
  if (n < 4) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross !== 0) out.push(b);
  }
  return out.length >= 3 ? out : pts;
}

function simplifyDP(pts, tol) {
  const n = pts.length;
  if (n < 3) return pts;
  // rotate so the cut sits at the point furthest from the centroid (open-polyline DP)
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;
  let start = 0;
  let far = -1;
  for (let i = 0; i < n; i++) {
    const d = (pts[i][0] - cx) ** 2 + (pts[i][1] - cy) ** 2;
    if (d > far) {
      far = d;
      start = i;
    }
  }
  const seq = pts.slice(start).concat(pts.slice(0, start));
  seq.push(seq[0]);
  const keep = new Uint8Array(seq.length);
  keep[0] = keep[seq.length - 1] = 1;
  const stack = [[0, seq.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (j <= i + 1) continue;
    let maxD = -1;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = perp(seq[k], seq[i], seq[j]);
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  const res = [];
  for (let i = 0; i < seq.length - 1; i++) if (keep[i]) res.push(seq[i]);
  return res;
}

const N = (v) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};

function toPath(ops, ox, oy, closed = true) {
  // `ops` is a list of { type: "L" | "Q", end, p? } describing the closed ring.
  // The ring starts at the end of the last op, so the sequence closes cleanly.
  const startPt = ops[ops.length - 1].end;
  let d = `M ${N(startPt[0] + ox)} ${N(startPt[1] + oy)}`;
  for (const op of ops) {
    if (op.type === "Q") d += ` Q ${N(op.p[0] + ox)} ${N(op.p[1] + oy)} ${N(op.end[0] + ox)} ${N(op.end[1] + oy)}`;
    else d += ` L ${N(op.end[0] + ox)} ${N(op.end[1] + oy)}`;
  }
  return d + (closed ? " Z" : "");
}

/* -------------------------------------------------------------- gradients */

const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/**
 * Fit a linear colour model c(x,y) = a*x + b*y + k per channel over interior
 * pixels only (alpha >= 250 and away from the silhouette edge), then use the
 * strongest channel direction as the gradient axis and sample GRADIENT_BINS
 * stops along it. This reproduces non-linear artwork gradients faithfully.
 */
function fitGradient(maskObj) {
  const { mask, box, w, h } = maskObj;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  const interior = inside;
  const samples = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!interior(x, y)) continue;
      const gx = x + box[0];
      const gy = y + box[1];
      if (ALPHA(gx, gy) < 250) continue;
      if (!interior(x - 8, y) || !interior(x + 8, y) || !interior(x, y - 8) || !interior(x, y + 8)) continue;
      samples.push([gx, gy]);
    }
  }
  let dirX = 0;
  let dirY = 1;
  let bestMag = -1;
  const fits = [];
  for (let ch = 0; ch < 3; ch++) {
    // least squares for data[ch] = a*x + b*y + k
    // 3x3 normal matrix (symmetric) + rhs
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const V = [0, 0, 0];
    const step = Math.max(1, Math.floor(samples.length / 40000));
    for (let i = 0; i < samples.length; i += step) {
      const [x, y] = samples[i];
      const v = data[(y * W + x) * C + ch];
      M[0][0] += x * x; M[0][1] += x * y; M[0][2] += x;
      M[1][1] += y * y; M[1][2] += y;
      M[2][2] += 1;
      V[0] += x * v; V[1] += y * v; V[2] += v;
    }
    M[1][0] = M[0][1];
    M[2][0] = M[0][2];
    M[2][1] = M[1][2];
    const sol = solve3(M, V);
    if (!sol) continue;
    const [a, b] = sol;
    const mag = Math.hypot(a, b);
    fits.push({ ch, a, b, k: sol[2], mag });
    if (mag > bestMag) {
      bestMag = mag;
      dirX = a;
      dirY = b;
    }
  }
  const dl = Math.hypot(dirX, dirY) || 1;
  dirX /= dl;
  dirY /= dl;

  let tMin = Infinity;
  let tMax = -Infinity;
  const proj = [];
  for (const [x, y] of samples) {
    const t = x * dirX + y * dirY;
    proj.push([t, x, y]);
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  if (!proj.length || tMax - tMin < 1e-6) {
    return { x1: box[0], y1: box[1], x2: box[2], y2: box[3], stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#000000" }] };
  }
  const bins = Array.from({ length: GRADIENT_BINS }, () => ({ n: 0, r: 0, g: 0, b: 0 }));
  for (const [t, x, y] of proj) {
    const bi = Math.min(GRADIENT_BINS - 1, Math.floor(((t - tMin) / (tMax - tMin)) * GRADIENT_BINS));
    const o = (y * W + x) * C;
    bins[bi].n++;
    bins[bi].r += data[o];
    bins[bi].g += data[o + 1];
    bins[bi].b += data[o + 2];
  }
  let last = null;
  const stops = [];
  bins.forEach((bin, i) => {
    const offset = GRADIENT_BINS === 1 ? 0 : i / (GRADIENT_BINS - 1);
    if (!bin.n) {
      if (last) stops.push({ offset, color: last });
      return;
    }
    const color = hex(bin.r / bin.n, bin.g / bin.n, bin.b / bin.n);
    last = color;
    stops.push({ offset, color });
  });
  // axis endpoints in user space
  let p1 = null;
  let p2 = null;
  for (const [t, x, y] of proj) {
    if (t === tMin && !p1) p1 = [x, y];
    if (t === tMax) p2 = [x, y];
  }
  if (!p1) p1 = [box[0], box[1]];
  if (!p2) p2 = [box[2], box[3]];
  return { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stops, dir: [dirX, dirY] };
}

function solve3(M, V) {
  const a = M.map((row, i) => [...row, V[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

/* ------------------------------------------------------------------- main */

console.log(`[trace-logo] source: ${path.relative(ROOT, SRC)}  ${meta.width}x${meta.height} ${meta.format} alpha=${meta.hasAlpha}`);

const { label, comps } = labelComponents();
if (comps.length < 4) {
  console.error(`[trace-logo] expected 4 opaque components, found ${comps.length}. Cannot segment.`);
  process.exit(5);
}
const [cTop, cBottom, cRight, cLeaf] = comps;
console.log(
  `[trace-logo] components: top=${cTop.area} bottom=${cBottom.area} right=${cRight.area} leaf=${cLeaf.area}`
);

const crease = fitCrease(cRight, label);
console.log(
  crease
    ? `[trace-logo] crease fit x = ${crease.a.toFixed(4)}*y + ${crease.b.toFixed(1)}  (y ${crease.yStart}..${crease.yEnd}, ${crease.pts} samples)`
    : "[trace-logo] WARNING: no crease detected; fold will be merged into the right band"
);

const isFold = crease
  ? (x, y) => (y < crease.yStart ? true : y <= crease.yEnd ? x < crease.a * y + crease.b : false)
  : () => false;

const PIECES = [
  { id: "top", label: "Top band", comp: cTop },
  { id: "bottom", label: "Bottom band", comp: cBottom },
  { id: "right", label: "Right band", comp: cRight, chevron: (x, y) => !isFold(x, y) },
  { id: "fold", label: "Right fold", comp: cRight, chevron: (x, y) => isFold(x, y) },
  { id: "leaf", label: "Green leaf", comp: cLeaf },
];

const built = [];
for (const p of PIECES) {
  const obj = maskFor(p.comp, label, p.chevron);
  let area = 0;
  for (const v of obj.mask) area += v;
  if (area < 64) {
    console.error(`[trace-logo] piece "${p.id}" came out empty (${area}px). Aborting.`);
    process.exit(6);
  }
  const loops = traceMask(obj.mask, obj.w, obj.h);
  const outer = loops[0];
  if (loops.length > 1) {
    console.log(`[trace-logo]   ${p.id}: ${loops.length} contours (outer kept, ${loops.length - 1} inner ignored)`);
  }
  const outerArea = Math.abs(polyArea(outer));
  if (outerArea < area * 0.999) {
    console.log(
      `[trace-logo]   ${p.id}: WARNING outer contour area ${Math.round(outerArea)} vs mask ${area} (holes present)`
    );
  }
  const merged = mergeCollinear(outer);
  const simple = simplifyDP(merged, DP_TOL);
  const ops = simple.map((_, i) => ({ type: "L", end: simple[(i + 1) % simple.length] }));
  const curves = 0;
  const d = toPath(ops, obj.box[0], obj.box[1], true);
  const grad = fitGradient(obj);
  built.push({
    id: p.id,
    label: p.label,
    d,
    points: simple.length,
    curves,
    grad,
    maskObj: obj,
    area,
    bbox: obj.box,
  });
  console.log(
    `[trace-logo]   ${p.id.padEnd(6)} area=${String(area).padStart(8)} contourPts=${String(outer.length).padStart(6)} simplified=${String(
      simple.length
    ).padStart(4)} curves=${String(curves).padStart(3)} pathLen=${d.length}`
  );
}

/* ------------------------------------------------- render + fidelity check */

const gradientsSvg = built
  .map(
    (b) =>
      `<linearGradient id="lg-${b.id}" gradientUnits="userSpaceOnUse" x1="${N(b.grad.x1)}" y1="${N(b.grad.y1)}" x2="${N(
        b.grad.x2
      )}" y2="${N(b.grad.y2)}">` +
      b.grad.stops.map((s) => `<stop offset="${s.offset.toFixed(4)}" stop-color="${s.color}"/>`).join("") +
      `</linearGradient>`
  )
  .join("");
const pathsSvg = built
  .map((b) => `<path d="${b.d}" fill="url(#lg-${b.id})" data-logo-piece="${b.id}"/>`)
  .join("");
const svgColor = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${gradientsSvg}</defs>${pathsSvg}</svg>`;
const svgFlat = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${built
  .map((b) => `<path d="${b.d}" fill="#000000"/>`)
  .join("")}</svg>`;

const rendered = await sharp(Buffer.from(svgFlat), { limitInputPixels: false }).png().toBuffer();
const { data: rdata, info: rinfo } = await sharp(rendered, { limitInputPixels: false })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

let inter = 0;
let union = 0;
let refOnly = 0;
let svgOnly = 0;
const refMask = new Uint8Array(W * H);
const svgMask = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const a = ALPHA(x, y) >= ALPHA_IN;
    const b = rdata[i * rinfo.channels + 3] >= ALPHA_IN;
    if (a) refMask[i] = 1;
    if (b) svgMask[i] = 1;
    if (a && b) {
      inter++;
      union++;
    } else if (a) {
      refOnly++;
      union++;
    } else if (b) {
      svgOnly++;
      union++;
    }
  }
}
const iou = inter / union;

// colour fidelity: mean absolute channel error over the shared interior
const colored = await sharp(Buffer.from(svgColor), { limitInputPixels: false, density: 72 }).png().toBuffer();
const { data: cdata, info: cinfo } = await sharp(colored, { limitInputPixels: false })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let cerr = 0;
let cn = 0;
let cmax = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (ALPHA(x, y) < 250) continue;
    if (rdata[i * rinfo.channels + 3] < 250) continue;
    const o = i * C;
    const p = i * cinfo.channels;
    const e1 = Math.abs(data[o] - cdata[p]);
    const e2 = Math.abs(data[o + 1] - cdata[p + 1]);
    const e3 = Math.abs(data[o + 2] - cdata[p + 2]);
    const e = (e1 + e2 + e3) / 3;
    cerr += e;
    if (e > cmax) cmax = e;
    cn++;
  }
}
const meanErr = cn ? cerr / cn : 0;

console.log(`\n[trace-logo] silhouette IoU            = ${iou.toFixed(5)}  (target >= 0.95)`);
console.log(`[trace-logo] pixels ref-only / svg-only = ${refOnly} / ${svgOnly} of ${W * H}`);
console.log(`[trace-logo] mean colour error (0-255) = ${meanErr.toFixed(2)}  max ${cmax.toFixed(1)} over ${cn} px`);

/* --------------------------------------------------------- write the module */

const ts = `/**
 * logoGeometry.ts — GENERATED FILE. Do not edit by hand.
 *
 * Produced by:  frontend/scripts/trace-logo.mjs   (npm run trace:logo)
 * Source:       ${path.relative(ROOT, SRC).replace(/\\/g, "/")} — ${meta.width}x${meta.height} ${meta.format}, genuine alpha
 * Method:       connected-component segmentation of the source alpha mask,
 *               crack-following contour extraction and Douglas-Peucker
 *               simplification (tolerance ${DP_TOL}px in the 4096 source space,
 *               i.e. 0.05% of the mark). Straight artwork edges stay exactly
 *               straight; the artwork's rounded outer corners are reproduced as
 *               tight polylines bounded by that tolerance instead of fitted
 *               Beziers, because measurement showed Bezier corner fitting
 *               DEGRADED silhouette fidelity (IoU 0.872-0.959) versus 0.998 for
 *               the simplified polygon. Gradients are least-squares fitted over
 *               interior pixels and sampled into ${GRADIENT_BINS} stops.
 * ViewBox:      0 0 ${W} ${H}  (source pixel coordinates — no rescaling, no lossy steps)
 * Measured:     silhouette IoU ${iou.toFixed(5)} vs the source alpha mask (threshold ${ALPHA_IN})
 *
 * The five pieces match the real artwork. \`fold\` is carved out of the right band
 * along the crease detected inside it so it can move independently.
 */

export const LOGO_VIEWBOX = "0 0 ${W} ${H}";

export type LogoPieceId = "top" | "right" | "bottom" | "fold" | "leaf";

export interface LogoGradientStop {
  offset: number;
  color: string;
}

export interface LogoGradient {
  /** userSpaceOnUse axis, in source pixel coordinates */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: LogoGradientStop[];
}

export interface LogoPiece {
  id: LogoPieceId;
  label: string;
  /** inline SVG path data — real traced geometry, never a primitive */
  d: string;
  gradient: LogoGradient;
}

export const LOGO_PIECES: LogoPiece[] = [
${built
  .map(
    (b) => `  {
    id: "${b.id}",
    label: ${JSON.stringify(b.label)},
    d: ${JSON.stringify(b.d)},
    gradient: {
      x1: ${N(b.grad.x1)},
      y1: ${N(b.grad.y1)},
      x2: ${N(b.grad.x2)},
      y2: ${N(b.grad.y2)},
      stops: [
${b.grad.stops.map((s) => `        { offset: ${s.offset.toFixed(4)}, color: "${s.color}" },`).join("\n")}
      ],
    },
  },`
  )
  .join("\n")}
];

/** Assembled-logo fidelity, asserted by the browser harness too. */
export const LOGO_TRACE_META = {
  source: ${JSON.stringify(path.relative(ROOT, SRC).replace(/\\/g, "/"))},
  method: "alpha-mask connected components + crack-following contours + Douglas-Peucker + Bezier corner fitting",
  dpTolerance: ${DP_TOL},
  gradientBins: ${GRADIENT_BINS},
  pieces: ${built.length},
  silhouetteIou: ${iou.toFixed(5)},
  meanColorError: ${meanErr.toFixed(3)},
} as const;

export function logoGradientId(id: LogoPieceId): string {
  return "jazari-logo-grad-" + id;
}
`;

fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });
fs.writeFileSync(OUT_TS, ts, "utf8");
console.log(`[trace-logo] wrote ${path.relative(ROOT, OUT_TS)} (${ts.length} bytes)`);

/* ----------------------------------------------------------------- artifacts */

fs.mkdirSync(SHOT_DIR, { recursive: true });
const OUT = 1024;
const silRef = Buffer.alloc(W * H);
for (let i = 0; i < W * H; i++) silRef[i] = refMask[i] ? 255 : 0;
const silRefPng = await sharp(silRef, { raw: { width: W, height: H, channels: 1 } })
  .resize(OUT, OUT, { kernel: "nearest" })
  .png()
  .toBuffer();
const silSvgBytes = Buffer.alloc(W * H);
for (let i = 0; i < W * H; i++) silSvgBytes[i] = svgMask[i] ? 255 : 0;
const silSvgPng = await sharp(silSvgBytes, { raw: { width: W, height: H, channels: 1 } })
  .resize(OUT, OUT, { kernel: "nearest" })
  .png()
  .toBuffer();

const origSmall = await sharp(raw, { limitInputPixels: false })
  .resize(OUT, OUT, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .png()
  .toBuffer();
const svgSmall = await sharp(Buffer.from(svgColor), { limitInputPixels: false })
  .resize(OUT, OUT, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .png()
  .toBuffer();

// difference image: silhouette disagreement highlighted
const diffBuf = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const a = refMask[i] === 1;
  const b = svgMask[i] === 1;
  const o = i * 4;
  if (a && b) {
    diffBuf[o] = 40; diffBuf[o + 1] = 60; diffBuf[o + 2] = 110; diffBuf[o + 3] = 90;
  } else if (a) {
    diffBuf[o] = 220; diffBuf[o + 1] = 0; diffBuf[o + 2] = 0; diffBuf[o + 3] = 255; // missing in SVG
  } else if (b) {
    diffBuf[o] = 0; diffBuf[o + 1] = 200; diffBuf[o + 2] = 0; diffBuf[o + 3] = 255; // extra in SVG
  } else {
    diffBuf[o + 3] = 0;
  }
}
const diffPng = await sharp(diffBuf, { raw: { width: W, height: H, channels: 4 } })
  .resize(OUT, OUT, { kernel: "nearest" })
  .png()
  .toBuffer();

const gap = 20;
const sideBySide = await sharp({
  create: { width: OUT * 2 + gap, height: OUT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([
    { input: origSmall, left: 0, top: 0 },
    { input: svgSmall, left: OUT + gap, top: 0 },
  ])
  .png()
  .toBuffer();

const files = {
  "logo-original.png": origSmall,
  "logo-svg-assembled.png": svgSmall,
  "logo-side-by-side.png": sideBySide,
  "logo-diff.png": diffPng,
  "logo-silhouette-original.png": silRefPng,
  "logo-silhouette-svg.png": silSvgPng,
};
for (const [name, buf] of Object.entries(files)) {
  fs.writeFileSync(path.join(SHOT_DIR, name), buf);
  console.log(`[trace-logo] wrote test-output/screenshots/${name}`);
}

const summary = {
  source: path.relative(ROOT, SRC).replace(/\\/g, "/"),
  sourceSize: [W, H],
  iou: Number(iou.toFixed(5)),
  refOnlyPixels: refOnly,
  svgOnlyPixels: svgOnly,
  meanColorError: Number(meanErr.toFixed(3)),
  maxColorError: Number(cmax.toFixed(1)),
  pieces: built.map((b) => ({
    id: b.id,
    points: b.points,
    curves: b.curves,
    pathLength: b.d.length,
    stops: b.grad.stops.length,
    bbox: b.bbox,
  })),
  crease: crease && { a: Number(crease.a.toFixed(4)), b: Number(crease.b.toFixed(1)), yStart: crease.yStart, yEnd: crease.yEnd },
  pass: iou >= 0.95,
};
fs.writeFileSync(path.join(SHOT_DIR, "logo-trace-report.json"), JSON.stringify(summary, null, 2));
console.log(`[trace-logo] report: test-output/screenshots/logo-trace-report.json`);
console.log(`[trace-logo] ${summary.pass ? "PASS" : "FAIL"} — silhouette IoU ${summary.iou} (>= 0.95 required)`);
process.exit(summary.pass ? 0 : 1);
