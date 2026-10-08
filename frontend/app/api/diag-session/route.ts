/**
 * Diagnostics endpoint: GET /api/diag-session
 *
 * PURPOSE — prove, in production, WHY an admin session is or is not kept,
 * without ever exposing a value. It reports booleans and enums only:
 *
 *   proxyConfigured              BACKEND_ORIGIN is present on the frontend project
 *   backendOriginIsHttps         that origin is https
 *   backendHealthStatus          status code of a server-side GET /api/health (5 s timeout)
 *   backendDatabase              "connected" | "disconnected" | "unknown"
 *   cookiePresentOnThisRequest   the session cookie name appears in the incoming Cookie header
 *   requestHostMatchesForwardedHost  the `host` and `x-forwarded-host` headers agree
 *   nodeEnv                      the runtime environment name
 *
 * SECURITY — the route is DISABLED (404) unless `DIAGNOSTICS === "true"`, is
 * `no-store`, and is a server route handler so it ships zero client JavaScript.
 * It never returns a cookie value, a token, an origin with credentials or any
 * other secret; only presence flags and a status number.
 */
import { sessionCookieName } from "@/lib/authBff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "content-type": "text/plain; charset=utf-8" },
  });
}

/** True when the named cookie appears in the raw Cookie header. */
function cookiePresent(cookieHeader: string | null, name: string): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return false;
      return part.slice(0, separator).trim() === name;
    });
}

export async function GET(request: Request): Promise<Response> {
  if ((process.env.DIAGNOSTICS ?? "").trim() !== "true") return notFound();

  const rawOrigin = (process.env.BACKEND_ORIGIN ?? "").trim().replace(/\/+$/, "");
  const proxyConfigured = rawOrigin.length > 0;
  const backendOriginIsHttps = /^https:\/\//i.test(rawOrigin);
  const apiBase = rawOrigin ? (/\/api$/i.test(rawOrigin) ? rawOrigin : `${rawOrigin}/api`) : "";

  let backendHealthStatus: number | null = null;
  let backendDatabase: "connected" | "disconnected" | "unknown" = "unknown";
  if (apiBase) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const health = await fetch(`${apiBase}/health`, { signal: controller.signal, cache: "no-store" });
      backendHealthStatus = health.status;
      const body = (await health.json().catch(() => null)) as { data?: { database?: unknown } } | null;
      const database = body?.data?.database;
      if (typeof database === "string") {
        backendDatabase = database === "connected" ? "connected" : "disconnected";
      }
    } catch {
      // Unreachable / timed out — the status stays null and the enum "unknown".
    } finally {
      clearTimeout(timer);
    }
  }

  const host = request.headers.get("host") ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host") ?? "";

  const payload = {
    proxyConfigured,
    backendOriginIsHttps,
    backendHealthStatus,
    backendDatabase,
    cookiePresentOnThisRequest: cookiePresent(request.headers.get("cookie"), sessionCookieName()),
    requestHostMatchesForwardedHost: forwardedHost.length > 0 && host === forwardedHost,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
  };

  return Response.json(payload, { status: 200, headers: { "Cache-Control": "no-store" } });
}
