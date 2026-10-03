/**
 * Client-side image preparation for logo uploads.
 *
 * Vercel serverless functions cap the request body at ~4.5 MB, while a
 * base64 data URI adds ~33% on top of the binary size — so an 8 MB source
 * image can never reach the API on Vercel. Before upload (and before the
 * server-side preview) the admin browser inspects the image, downscales it to
 * the same bound the backend pipeline already applies (1280×720, never
 * upscaled), and re-encodes it below the serverless limit.
 *
 * Transparency is preserved (WebP/PNG with alpha), and a genuine transparent
 * PNG is only ever re-encoded when it is actually too large. If an image
 * cannot be brought under the limit the caller receives a friendly, explicit
 * error — we never silently drop or corrupt a logo.
 *
 * This module is browser-only (Canvas/FileReader); it is imported from the
 * admin Logos Manager client component.
 */

/** Accepted source size (mirrors the backend `MAX_IMAGE_BYTES`). */
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** Target for the encoded data URI (chars) — comfortably under Vercel's ~4.5 MB body cap. */
export const SERVERLESS_TARGET_CHARS = 3_900_000;

/** Bound applied by the backend pipeline — never upscale past it. */
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;

const QUALITY_STEPS = [0.92, 0.86, 0.8, 0.72, 0.64];

export class ImagePrepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePrepError";
  }
}

/** Read a File as a base64 data URI. */
export function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImagePrepError("The file could not be read. Please retry."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImagePrepError("This image could not be decoded."));
    image.src = dataUri;
  });
}

/** Fit inside the pipeline bound without ever enlarging the source. */
function fitWithin(width: number, height: number): { width: number; height: number } {
  if (!width || !height) return { width: MAX_WIDTH, height: MAX_HEIGHT };
  if (width <= MAX_WIDTH && height <= MAX_HEIGHT) return { width, height };
  const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Prepare a logo file for upload: return a data URI that is comfortably below
 * the serverless request limit while preserving aspect ratio and transparency.
 *
 * @throws {ImagePrepError} when the image cannot be brought under the limit.
 */
export async function prepareLogoDataUri(file: File): Promise<string> {
  const original = await readFileAsDataUri(file);
  if (original.length <= SERVERLESS_TARGET_CHARS) return original;

  const image = await loadImage(original);
  const { width, height } = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return original;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  // Prefer lossy WebP (alpha-capable, smallest); fall back to lossless PNG.
  let smallest = original;
  for (const quality of QUALITY_STEPS) {
    const candidate = canvas.toDataURL("image/webp", quality);
    if (candidate.startsWith("data:image/webp") && candidate.length < smallest.length) {
      smallest = candidate;
    }
    if (smallest.length <= SERVERLESS_TARGET_CHARS) return smallest;
  }

  const png = canvas.toDataURL("image/png");
  if (png.length < smallest.length) smallest = png;
  if (smallest.length <= SERVERLESS_TARGET_CHARS) return smallest;

  throw new ImagePrepError(
    "This logo is too large to upload. Please resize it (max 1280×720) or export a smaller file and try again.",
  );
}
