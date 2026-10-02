import { v2 as cloudinary } from "cloudinary";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import env from "../config/env.js";
import { ApiError } from "../utils/errors.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_UPLOAD_DIR = path.join(rootDir, "uploads");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB decoded
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const EXTENSION_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const hasCloudinary =
  Boolean(env.cloudinary.cloudName) &&
  Boolean(env.cloudinary.apiKey) &&
  Boolean(env.cloudinary.apiSecret);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

/**
 * Driver selection:
 *  - Cloudinary whenever credentials are configured (always in production —
 *    env validation refuses to boot without them).
 *  - Local disk in development so the upload flow stays testable without
 *    cloud credentials. Local assets are served from /api/uploads.
 */
export const storageDriver = hasCloudinary ? "cloudinary" : "local";

if (!hasCloudinary && !env.isProd) {
  console.warn("[storage] Cloudinary credentials missing — using local uploads/ directory (development only).");
}

/** Validate an incoming data URI before any bytes are stored. */
export function parseImageDataUri(dataUri) {
  if (typeof dataUri !== "string" || !dataUri.startsWith("data:")) {
    throw ApiError.badRequest("Provide the image as a data URI.", { image: "Image data is required." });
  }

  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!match) {
    throw ApiError.badRequest("The image payload is malformed.", { image: "Invalid image data." });
  }

  const [, mimeType, base64] = match;
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw ApiError.badRequest("Supported formats: JPEG, PNG, WebP, GIF, SVG.", {
      image: "Unsupported image format.",
    });
  }

  const bytes = Buffer.byteLength(base64, "base64");
  if (bytes > MAX_IMAGE_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Images must be smaller than 8 MB.", {
      image: "Image is too large (max 8 MB).",
    });
  }

  return { mimeType, base64, bytes, extension: EXTENSION_BY_TYPE[mimeType] };
}

/**
 * Upload a logo asset.
 * @returns {Promise<{ secureUrl: string, publicId: string, bytes: number }>}
 */
export async function uploadImage(dataUri, { folder = "jazari/logos" } = {}) {
  const { mimeType, base64, bytes, extension } = parseImageDataUri(dataUri);

  if (storageDriver === "cloudinary") {
    // Cap resolution at 1280×720 (no upscaling) with best-quality auto compression.
    const result = await cloudinary.uploader.upload(`data:${mimeType};base64,${base64}`, {
      folder,
      resource_type: "image",
      overwrite: false,
      unique_filename: true,
      transformation: [
        { width: 1280, height: 720, crop: "limit" },
        { quality: "auto:best" },
        { fetch_format: "auto" },
      ],
    });

    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes ?? bytes,
    };
  }

  // --- Local development driver -------------------------------------------
  const publicId = `logo-${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${extension}`;
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_UPLOAD_DIR, publicId), Buffer.from(base64, "base64"), {
    mode: 0o644,
  });

  const base = env.publicApiUrl || `http://localhost:${env.port}`;
  return {
    secureUrl: `${base}/api/uploads/${publicId}`,
    publicId,
    bytes,
  };
}

function localAssetUrl(publicId) {
  const base = env.publicApiUrl || `http://localhost:${env.port}`;
  return `${base}/api/uploads/${publicId}`;
}

/**
 * Store the untouched original upload (preserved so any logo can be reverted or
 * reprocessed). Cloudinary keeps a distinct original public_id; the local
 * driver writes a distinct `original-*` file. Never bypassed by controllers.
 */
export async function storeOriginal(dataUri, { folder = "jazari/logos/originals" } = {}) {
  const { mimeType, base64, bytes, extension } = parseImageDataUri(dataUri);

  if (storageDriver === "cloudinary") {
    const result = await cloudinary.uploader.upload(`data:${mimeType};base64,${base64}`, {
      folder,
      resource_type: "image",
      overwrite: false,
      unique_filename: true,
      transformation: [{ quality: "auto:best" }],
    });
    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes ?? bytes,
      mimeType,
      extension,
      buffer: Buffer.from(base64, "base64"),
    };
  }

  const publicId = `original-${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${extension}`;
  const buffer = Buffer.from(base64, "base64");
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_UPLOAD_DIR, publicId), buffer, { mode: 0o644 });
  return { secureUrl: localAssetUrl(publicId), publicId, bytes, mimeType, extension, buffer };
}

/**
 * Store a processed PNG buffer (alpha preserved). Cloudinary is asked for PNG
 * explicitly so transparency survives; the local driver writes `processed-*.png`.
 */
export async function storeProcessed(buffer, { folder = "jazari/logos/processed" } = {}) {
  if (storageDriver === "cloudinary") {
    const result = await cloudinary.uploader.upload(`data:image/png;base64,${buffer.toString("base64")}`, {
      folder,
      resource_type: "image",
      overwrite: false,
      unique_filename: true,
      format: "png",
      transformation: [{ quality: "auto:best" }],
    });
    return { secureUrl: result.secure_url, publicId: result.public_id, bytes: result.bytes ?? buffer.length };
  }

  const publicId = `processed-${Date.now()}-${crypto.randomBytes(5).toString("hex")}.png`;
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_UPLOAD_DIR, publicId), buffer, { mode: 0o644 });
  return { secureUrl: localAssetUrl(publicId), publicId, bytes: buffer.length };
}

/**
 * Read the bytes of a stored original so it can be reprocessed. Uses the same
 * storage driver the asset was written with — never a direct path assumption.
 */
export async function fetchStoredBytes(publicId) {
  if (!publicId) throw ApiError.badRequest("No stored asset reference was provided.");

  if (storageDriver === "cloudinary") {
    const url = cloudinary.url(publicId, { resource_type: "image", secure: true });
    const response = await fetch(url);
    if (!response.ok) {
      throw ApiError.internal("The original asset could not be read from storage.");
    }
    return Buffer.from(await response.arrayBuffer());
  }

  const fileName = path.basename(publicId);
  try {
    return await readFile(path.join(LOCAL_UPLOAD_DIR, fileName));
  } catch {
    throw ApiError.internal("The original asset could not be read from storage.");
  }
}

/**
 * Delete a previously stored asset. Missing assets are treated as success so
 * cleanup remains idempotent.
 */
export async function deleteImage(publicId) {
  if (!publicId) return { deleted: true };

  if (storageDriver === "cloudinary") {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      return { deleted: true };
    } catch (error) {
      console.error(`[storage] cloudinary delete failed for ${publicId}: ${error.message}`);
      throw ApiError.internal("The image could not be removed from storage. Please retry.");
    }
  }

  // Local driver — never allow path traversal.
  const fileName = path.basename(publicId);
  const target = path.join(LOCAL_UPLOAD_DIR, fileName);
  try {
    await unlink(target);
    return { deleted: true };
  } catch (error) {
    if (error.code === "ENOENT") return { deleted: true };
    console.error(`[storage] local delete failed for ${fileName}: ${error.message}`);
    throw ApiError.internal("The image could not be removed from storage. Please retry.");
  }
}

export { LOCAL_UPLOAD_DIR };
