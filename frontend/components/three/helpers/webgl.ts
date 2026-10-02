/**
 * WebGL capability probe.
 *
 * Creates (and immediately releases) a throwaway context so detection never
 * counts against the browser's live context limit. Returns `false` on any
 * failure — the caller keeps the static fallback; the user never sees an error.
 */
export function supportsWebGL(): boolean {
  if (typeof window === "undefined" || !window.WebGLRenderingContext) return false;

  try {
    const canvas = document.createElement("canvas");
    const attributes: WebGLContextAttributes = {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      failIfMajorPerformanceCaveat: false,
    };
    const gl =
      (canvas.getContext("webgl2", attributes) as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl", attributes) as WebGLRenderingContext | null);

    if (!gl) return false;

    // Release the probe context immediately — we only needed existence, not life.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    // Blocked by policy / driver issues — degrade to the static fallback.
    return false;
  }
}
