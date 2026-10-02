import { v2 as cloudinary } from "cloudinary";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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
