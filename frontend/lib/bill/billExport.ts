/**
 * BILL EXPORT — turns the SVG string from `billSvg.ts` into a downloadable PNG.
 *
 * Browsers cap how large a canvas can be (area and memory), and phones fail
 * long before desktops do. So the export asks for a tier, and if the device
 * cannot render it (allocation fails, `drawImage` throws, `toBlob` returns
 * null) it automatically drops to the next lower tier and reports exactly which
 * size was produced. The canvas is always released (`width = height = 0`), the
 * DOM is given a frame before the heavy draw so the UI never freezes, and the
 * lossless SVG is always available as a second button.
 *
 * Sizes are square: 8K = 7680 (default), 4K = 4096, 2K = 2048.
 */

export type QualityTier = "8k" | "4k" | "2k";

export const TIER_SIZES: Record<QualityTier, number> = {
  "8k": 7680,
  "4k": 4096,
  "2k": 2048,
};

/** Default tier per the spec: 8K square. */
export const DEFAULT_TIER: QualityTier = "8k";

export interface ExportResult {
  blob: Blob;
  /** The size actually produced (may be smaller than asked for). */
  size: number;
  tier: QualityTier;
  /** Set when the requested tier could not be produced. */
  fallbackReason?: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The invoice image could not be loaded for export."));
    image.src = url;
  });
}

/** Give the browser a frame (and the "Rendering…" state) before the heavy work. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/** Render the SVG string at `size`×`size`. Throws when the device cannot. */
async function renderPng(svg: string, size: number): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  let canvas: HTMLCanvasElement | null = null;
  try {
    const image = await loadImage(url);
    canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable on this device.");
    // Never transmit transparent pixels: the bill is printed on white.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas?.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The browser could not encode the PNG.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/**
 * Export the bill as a PNG, walking DOWN the tiers if the device refuses.
 * `onProgress` receives a short human sentence ("Rendering 7680 × 7680…").
 */
export async function exportBillPng(
  svg: string,
  tier: QualityTier = DEFAULT_TIER,
  onProgress?: (message: string) => void,
): Promise<ExportResult> {
  const start = ["8k", "4k", "2k"] as QualityTier[];
  const startIndex = Math.max(0, start.indexOf(tier));
  let lastError: unknown = null;
  let fallbackReason: string | undefined;

  for (let index = startIndex; index < start.length; index += 1) {
    const candidate = start[index];
    const size = TIER_SIZES[candidate];
    onProgress?.(`Rendering ${size} × ${size}…`);
    await yieldToBrowser();
    try {
      const blob = await renderPng(svg, size);
      onProgress?.("");
      return { blob, size, tier: candidate, fallbackReason };
    } catch (error) {
      lastError = error;
      const lower = start[index + 1];
      fallbackReason = lower
        ? `Saved at ${TIER_SIZES[lower]} × ${TIER_SIZES[lower]} — this device could not render ${size} × ${size}.`
        : undefined;
      onProgress?.(fallbackReason ?? "");
    }
  }

  throw lastError instanceof Error ? lastError : new Error("The invoice could not be rendered as a PNG on this device.");
}

/** Save a blob under `<invoiceNumber>.png` (or `.svg`). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Download the lossless vector source. */
export function downloadBillSvg(svg: string, invoiceNumber: string): void {
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${invoiceNumber}.svg`);
}
