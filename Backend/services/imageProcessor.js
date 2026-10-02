import sharp from "sharp";

/**
 * Logo image processing pipeline (Task C).
 *
 * Deterministic, border-only background removal that protects enclosed artwork:
 *   decode → auto-orient → (trim) → bound to target canvas → detect outer
 *   background → border-connected flood fill (never a global colour replace)
 *   → true alpha with a ~1–2 px feather → trim transparent padding → fit
 *   1280×720 (never upscale/stretch) → PNG with alpha → metadata.
 *
 * The algorithm starts at the image border and removes only regions connected
 * to it, so a black field enclosed by a gold frame or white lettering inside a
 * white logo is preserved.
 */

const TARGET_MAX_WIDTH = 1280;
const TARGET_MAX_HEIGHT = 720;

/** Tolerance is expressed 0–100; map it to an RGB Euclidean distance (0–441). */
export const DEFAULT_TOLERANCE = 22;
const FEATHER_RATIO = 0.35; // extra distance band used for soft alpha edges

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hex(r, g, b) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(r, g, b) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/** Auto-orient and bound the working buffer (no upscaling). */
async function normalizeBuffer(input) {
  return sharp(input)
    .rotate()
    .resize({ width: TARGET_MAX_WIDTH, height: TARGET_MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/**
 * Sample the outer ring of pixels. Returns the dominant quantized border colour,
 * its share of the ring and how transparent the ring already is.
 */
function analyzeBorder(data, width, height, channels) {
  const idx = (x, y) => (y * width + x) * channels;
  const ring = [];
  for (let x = 0; x < width; x += 1) {
    ring.push(idx(x, 0), idx(x, height - 1));
  }
  for (let y = 0; y < height; y += 1) {
    ring.push(idx(0, y), idx(width - 1, y));
  }

  let transparent = 0;
  const buckets = new Map();
  for (const i of ring) {
    if (data[i + 3] < 16) {
      transparent += 1;
      continue;
    }
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += data[i];
    entry.g += data[i + 1];
    entry.b += data[i + 2];
    buckets.set(key, entry);
  }

  const total = ring.length;
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  const dominant = sorted[0]
    ? { r: sorted[0].r / sorted[0].count, g: sorted[0].g / sorted[0].count, b: sorted[0].b / sorted[0].count }
    : null;

  return {
    transparentShare: transparent / total,
    opaqueShare: 1 - transparent / total,
    dominantShare: sorted[0] ? sorted[0].count / total : 0,
    dominant,
    distinctBuckets: sorted.length,
  };
}

/**
 * Border-connected flood fill. Removes only regions reachable from the border
 * whose colour is within `maxDist` of the sampled background colour, producing
 * a soft alpha edge over a narrow feather band.
 */
function floodFillBackground(data, width, height, channels, bg, tolerance) {
  const maxDist = (clamp(tolerance, 0, 100) / 100) * 441;
  const featherDist = maxDist * (1 + FEATHER_RATIO);
  const count = width * height;
  const removed = new Uint8Array(count);
  const alpha = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;

  const dist = (p) => {
    const i = p * channels;
    const dr = data[i] - bg.r;
    const dg = data[i + 1] - bg.g;
    const db = data[i + 2] - bg.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const push = (p) => {
    if (removed[p]) return;
    if (dist(p) <= featherDist) {
      removed[p] = 1;
      queue[tail++] = p;
    }
  };

  // Seed from every border pixel.
  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + (width - 1));
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }

  // Alpha: fully removed inside the core band, feathered to opaque across the
  // narrow extra band so edges don't look cut out.
  let removedCount = 0;
  for (let p = 0; p < count; p += 1) {
    if (!removed[p]) {
      alpha[p] = 255;
      continue;
    }
    removedCount += 1;
    const d = dist(p);
    if (d <= maxDist) {
      alpha[p] = 0;
    } else {
      alpha[p] = clamp(Math.round(((d - maxDist) / (featherDist - maxDist)) * 255), 0, 255);
    }
  }

  return { removed, alpha, removedCount };
}

/** Trim fully transparent rows/columns (padding) with a small safety margin. */
function trimTransparent(alpha, width, height, threshold = 8) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null; // everything transparent — keep as-is
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Compute display metadata from the final RGBA buffer. */
function computeMetadata(data, width, height, channels) {
  let visible = 0;
  let lumSum = 0;
  let satSum = 0;
  let alphaMin = 255;
  let alphaMax = 0;
  const buckets = new Map();

  for (let i = 0; i < data.length; i += channels) {
    const a = data[i + 3];
    if (a < alphaMin) alphaMin = a;
    if (a > alphaMax) alphaMax = a;
    if (a < 16) continue;
    visible += 1;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    lumSum += relativeLuminance(r, g, b);
    satSum += saturation(r, g, b);
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    buckets.set(key, entry);
  }

  const dominantColors = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((entry) => hex(entry.r / entry.count, entry.g / entry.count, entry.b / entry.count));

  const avgLuminance = visible ? lumSum / visible : 0;
  const avgSaturation = visible ? satSum / visible : 0;

  // Tone drives the theme contrast aid: dark artwork needs help on dark
  // surfaces, light artwork on light surfaces. Luminance is the primary axis
  // (a dark saturated navy is still "dark"); saturation only separates a
  // mid-tone colourful mark from a genuinely light one.
  let tone = "colorful";
  if (avgLuminance < 0.45) tone = "dark";
  else if (avgLuminance > 0.7 && avgSaturation < 0.4) tone = "light";
  else if (avgLuminance > 0.78) tone = "light";

  return {
    width,
    height,
    aspectRatio: Number((width / height).toFixed(4)),
    hasAlpha: alphaMin < 250,
    dominantColors,
    averageLuminance: Number(avgLuminance.toFixed(4)),
    tone,
    visibleShare: visible / (width * height),
  };
}

/**
 * Full pipeline.
 *
 * @param {Buffer} input        raw uploaded bytes
 * @param {object} [options]
 * @param {boolean} [options.removeBackground=true]
 * @param {boolean} [options.trim=true]
 * @param {number}  [options.tolerance=DEFAULT_TOLERANCE]
 * @returns {Promise<{ buffer: Buffer, metadata: object, backgroundStatus: string, changed: boolean }>}
 */
export async function processLogoImage(input, options = {}) {
  const removeBackground = options.removeBackground !== false;
  const doTrim = options.trim !== false;
  const tolerance = Number.isFinite(Number(options.tolerance)) ? Number(options.tolerance) : DEFAULT_TOLERANCE;

  // 1–2. decode + auto-orient, bounded to the target canvas (no upscaling).
  let working;
  try {
    working = await normalizeBuffer(input);
  } catch (error) {
    // Undecodable input (e.g. an exotic SVG): report honestly, keep original.
    return {
      buffer: null,
      metadata: null,
      backgroundStatus: "needs-transparent-png",
      changed: false,
      reason: `could not decode image (${error.message})`,
    };
  }

  const { data, info } = working;
  const channels = info.channels;
  const width = info.width;
  const height = info.height;

  const border = analyzeBorder(data, width, height, channels);

  // Already transparent (border is mostly transparent): just trim + metadata.
  let alpha = null;
  let backgroundStatus;
  let changed = false;

  const isComplex = border.opaqueShare > 0.4 && border.dominantShare < 0.5;

  if (border.transparentShare >= 0.6) {
    backgroundStatus = "removed";
  } else if (removeBackground && border.dominant && border.opaqueShare >= 0.4 && !isComplex) {
    // 5–7. border-connected flood fill + true alpha.
    const filled = floodFillBackground(data, width, height, channels, border.dominant, tolerance);
    const removedShare = filled.removedCount / (width * height);
    // Integrity guards: if we removed almost nothing, or (nearly) everything, the
    // "background" is not a safe solid — keep the artwork untouched.
    if (removedShare >= 0.02 && removedShare <= 0.9 && filled.removedCount > 0) {
      alpha = filled.alpha;
      backgroundStatus = "removed";
      changed = true;
    } else {
      backgroundStatus = removedShare > 0.9 ? "needs-transparent-png" : "kept";
    }
  } else if (isComplex) {
    // Complex/opaque outer field (photo, textured, enclosed frame): preserve.
    backgroundStatus = "needs-transparent-png";
  } else {
    backgroundStatus = "kept";
  }

  // Build the working RGBA (apply alpha if we produced one).
  const rgba = Buffer.from(data);
  if (alpha) {
    for (let p = 0; p < width * height; p += 1) {
      rgba[p * channels + 3] = alpha[p];
    }
  }

  // 8. trim transparent padding (again, after removal) when requested.
  let crop = { left: 0, top: 0, width, height };
  if (doTrim) {
    const alphaChannel = new Uint8Array(width * height);
    for (let p = 0; p < width * height; p += 1) alphaChannel[p] = rgba[p * channels + 3];
    const bounds = trimTransparent(alphaChannel, width, height);
    if (bounds) crop = bounds;
  }

  const cropped = sharp(rgba, { raw: { width, height, channels } }).extract(crop);

  // 9–10. fit into 1280×720 (no upscale/stretch) and emit PNG with alpha.
  const output = await cropped
    .resize({ width: TARGET_MAX_WIDTH, height: TARGET_MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const final = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const metadata = computeMetadata(final.data, final.info.width, final.info.height, final.info.channels);

  return { buffer: output, metadata, backgroundStatus, changed };
}

export default processLogoImage;
