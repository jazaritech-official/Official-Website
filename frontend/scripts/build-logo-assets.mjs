#!/usr/bin/env node
/**
 * Brand asset build — `node scripts/build-logo-assets.mjs`
 *
 * The owner-supplied `public/Main Logo.png` is a genuine 4096×4096 RGBA PNG with
 * real transparency and a large empty margin. Shipping 2.4 MB for a navbar mark
 * is wasteful, so this dependency-free script:
 *   1. decodes the PNG (zlib + unfiltering),
 *   2. trims to the mark's alpha bounding box (with a small safe padding),
 *   3. box-downsamples with alpha-weighted averaging (no dark fringes),
 *   4. re-encodes compact RGBA PNGs into `public/brand/`.
 *
 * Outputs:
 *   - `public/brand/logo-main.png`      trimmed mark (UI usage, all themes)
 *   - `public/brand/app-icon-main.png`  square, padded mark (favicon / app icon)
 *   - `app/favicon.ico`                 16/32/48 PNG-embedded ICO (tab icon)
 *   - `app/icon.png`                    32×32 PNG (Next file-convention icon)
 *   - `app/apple-icon.png`              180×180 PNG (iOS home screen)
 *   - `public/brand/icon-192.png`       192×192 PNG (web manifest)
 *   - `public/brand/icon-512.png`       512×512 PNG (web manifest)
 *
 * Every icon is the REAL logo mark only — no wordmark, transparent background,
 * centred with a small safe margin so it stays recognisable at 16 px.
 *
 * The owner originals (Main Logo.png, Primary Logo.png, Icon.png, …) are never
 * modified. Run this only if the source logo changes.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "public", "Main Logo.png");
const OUT_DIR = path.join(root, "public", "brand");
const APP_DIR = path.join(root, "app");

/* --- PNG decode ---------------------------------------------------------- */
function decodePng(file) {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  let colorType = 6;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IHDR") {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      colorType = buffer[offset + 17];
    }
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += 12 + length;
  }

  if (colorType !== 6) throw new Error(`Expected an RGBA PNG (color type 6), got ${colorType}.`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos++];
    const row = y * stride;
    const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[pos++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let result;
      switch (filter) {
        case 0: result = value; break;
        case 1: result = value + a; break;
        case 2: result = value + b; break;
        case 3: result = value + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          result = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Unsupported PNG filter ${filter}.`);
      }
      out[row + x] = result & 0xff;
    }
  }

  return { width, height, pixels: out };
}

/* --- PNG encode ---------------------------------------------------------- */
function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --- Trimming / resampling ---------------------------------------------- */
function alphaBounds(image, threshold = 24) {
  const { width, height, pixels } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Alpha-weighted box resample of a source rectangle into targetW×targetH. */
function resample(image, box, targetW, targetH) {
  const { width, pixels } = image;
  const sw = box.maxX - box.minX + 1;
  const sh = box.maxY - box.minY + 1;
  const out = Buffer.alloc(targetW * targetH * 4);

  for (let ty = 0; ty < targetH; ty += 1) {
    const sy0 = Math.floor((ty * sh) / targetH);
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * sh) / targetH));
    for (let tx = 0; tx < targetW; tx += 1) {
      const sx0 = Math.floor((tx * sw) / targetW);
      const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * sw) / targetW));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        for (let sx = sx0; sx < sx1; sx += 1) {
          const i = ((box.minY + sy) * width + (box.minX + sx)) * 4;
          const alpha = pixels[i + 3];
          r += pixels[i] * alpha;
          g += pixels[i + 1] * alpha;
          b += pixels[i + 2] * alpha;
          a += alpha;
          count += 1;
        }
      }
      const o = (ty * targetW + tx) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / count);
      }
    }
  }
  return out;
}

/** Centres a mark on a transparent square canvas. */
function padToSquare(image, size, markWidth, markHeight) {
  const out = Buffer.alloc(size * size * 4);
  const ox = Math.floor((size - markWidth) / 2);
  const oy = Math.floor((size - markHeight) / 2);
  for (let y = 0; y < markHeight; y += 1) {
    image.copy(
      out,
      ((oy + y) * size + ox) * 4,
      y * markWidth * 4,
      (y + 1) * markWidth * 4,
    );
  }
  return out;
}

/* --- Main ---------------------------------------------------------------- */
fs.mkdirSync(OUT_DIR, { recursive: true });

const source = decodePng(SOURCE);
const bounds = alphaBounds(source);
const contentW = bounds.maxX - bounds.minX + 1;
const contentH = bounds.maxY - bounds.minY + 1;
console.log(`[logo] source ${source.width}x${source.height}; content ${contentW}x${contentH}`);

// Small transparent padding so the mark never touches the edge.
const pad = Math.round(Math.max(contentW, contentH) * 0.03);
const box = {
  minX: Math.max(0, bounds.minX - pad),
  minY: Math.max(0, bounds.minY - pad),
  maxX: Math.min(source.width - 1, bounds.maxX + pad),
  maxY: Math.min(source.height - 1, bounds.maxY + pad),
};
const boxW = box.maxX - box.minX + 1;
const boxH = box.maxY - box.minY + 1;

// Trimmed mark — 512 px on the long edge (crisp on retina at UI sizes).
const MARK_MAX = 512;
const scale = MARK_MAX / Math.max(boxW, boxH);
const markW = Math.max(1, Math.round(boxW * scale));
const markH = Math.max(1, Math.round(boxH * scale));
const markPixels = resample(source, box, markW, markH);
const markPath = path.join(OUT_DIR, "logo-main.png");
fs.writeFileSync(markPath, encodePng(markW, markH, markPixels));
console.log(`[logo] wrote ${path.relative(root, markPath)} (${markW}x${markH}, ${fs.statSync(markPath).size} B)`);

// Square app icon — the mark centred on a transparent 512×512 canvas.
const ICON = 512;
const iconScale = (ICON * 0.82) / Math.max(boxW, boxH);
const innerW = Math.max(1, Math.round(boxW * iconScale));
const innerH = Math.max(1, Math.round(boxH * iconScale));
const iconPixels = padToSquare(resample(source, box, innerW, innerH), ICON, innerW, innerH);
const iconPath = path.join(OUT_DIR, "app-icon-main.png");
fs.writeFileSync(iconPath, encodePng(ICON, ICON, iconPixels));
console.log(`[logo] wrote ${path.relative(root, iconPath)} (${ICON}x${ICON}, ${fs.statSync(iconPath).size} B)`);

/* --- Icon set (favicon / apple / manifest) -------------------------------- */

/** The square PNG for one icon size, mark centred with a legible safe margin. */
function iconPng(size, fill = 0.88) {
  const s = (size * fill) / Math.max(boxW, boxH);
  const w = Math.max(1, Math.round(boxW * s));
  const h = Math.max(1, Math.round(boxH * s));
  return encodePng(size, size, padToSquare(resample(source, box, w, h), size, w, h));
}

/**
 * Minimal ICO container with PNG-compressed frames (supported by every modern
 * browser and by Windows Vista+). No dependency is required — the frames are
 * the PNGs produced above.
 */
function encodeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = header.length + dir.length;
  frames.forEach((frame, index) => {
    const at = index * 16;
    dir[at] = frame.size >= 256 ? 0 : frame.size; // 0 encodes 256
    dir[at + 1] = frame.size >= 256 ? 0 : frame.size;
    dir[at + 2] = 0; // palette count
    dir[at + 3] = 0; // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(frame.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += frame.png.length;
  });
  return Buffer.concat([header, dir, ...frames.map((frame) => frame.png)]);
}

fs.mkdirSync(APP_DIR, { recursive: true });
const icoFrames = [16, 32, 48].map((size) => ({ size, png: iconPng(size) }));
const faviconPath = path.join(APP_DIR, "favicon.ico");
fs.writeFileSync(faviconPath, encodeIco(icoFrames));
console.log(`[logo] wrote ${path.relative(root, faviconPath)} (16/32/48, ${fs.statSync(faviconPath).size} B)`);

const iconTargets = [
  [path.join(APP_DIR, "icon.png"), 32],
  [path.join(APP_DIR, "apple-icon.png"), 180],
  [path.join(OUT_DIR, "icon-192.png"), 192],
  [path.join(OUT_DIR, "icon-512.png"), 512],
];
for (const [target, size] of iconTargets) {
  fs.writeFileSync(target, iconPng(size));
  console.log(`[logo] wrote ${path.relative(root, target)} (${size}x${size}, ${fs.statSync(target).size} B)`);
}
