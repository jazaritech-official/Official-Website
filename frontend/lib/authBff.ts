/**
 * Server-only auth BFF (Backend-For-Frontend) helpers.
 *
 * The browser must never talk to the API origin directly: when it does, the
 * session cookie is set by — and stored against — the API host, so a
 * `SameSite=Lax` cookie is stored on login and then withheld on every later
 * request (the classic "signed in, but your browser did not keep the session"
 * symptom). These handlers make the frontend origin the ONLY origin the browser
 * talks to:
 *
 *   browser ──/api/auth/*──> Next route handler ──fetch──> ${BACKEND_ORIGIN}/api/auth/*
 *                                     │
 *                                     └── re-emits the session cookie host-only,
 *                                         on the frontend origin, with forced flags
 *
 * The upstream status and JSON body are returned untouched. The session token is
 * never logged, never returned in the body and never exposed to client JS (the
 * re-emitted cookie is `HttpOnly`).
 *
 * IMPORTANT: this module is imported by route handlers only. Nothing here may be
 * imported from a client component — it reads server env (`BACKEND_ORIGIN`),
 * which does not exist in the browser bundle.
 */

const DEFAULT_COOKIE_NAME = "jazari_admin";

/**
 * The session cookie name. `NEXT_PUBLIC_COOKIE_NAME` is the non-secret way for
 * the frontend to learn it (the backend reads `JWT_COOKIE_NAME`); when neither is
 * set the documented default is used. Never a secret either way.
 */
export function sessionCookieName(): string {
  const raw = (process.env.NEXT_PUBLIC_COOKIE_NAME || process.env.JWT_COOKIE_NAME || "").trim();
  return raw || DEFAULT_COOKIE_NAME;
}

/** Normalizes `https://host`, `https://host/` and `https://host/api` to `…/api`. */
function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

/**
 * The backend API base used by the BFF.
 *
 * Production requires `BACKEND_ORIGIN`. Development falls back to
 * `NEXT_PUBLIC_API_URL` so the local two-terminal workflow keeps working without
 * any extra configuration. Returns "" when authentication cannot be reached —
 * callers must then answer `503 CONFIG_MISSING` instead of failing cryptically.
 */
export function backendApiBase(): string {
  const origin = normalizeApiBase(process.env.BACKEND_ORIGIN ?? "");
  if (origin) return origin;
  if (process.env.NODE_ENV !== "production") {
    return normalizeApiBase(process.env.NEXT_PUBLIC_API_URL ?? "");
  }
  return "";
}

/** Public, non-blaming body for the unconfigured case (no values, no hints). */
export const CONFIG_MISSING_BODY = {
  success: false as const,
  error: {
    code: "CONFIG_MISSING",
    message: "Authentication service is not configured.",
  },
};

/** Request headers forwarded to the backend (never rewritten, never logged). */
const FORWARD_REQUEST_HEADERS = [
  "content-type",
  "cookie",
  "authorization",
  "accept",
  "accept-language",
  "user-agent",
  "origin",
  "referer",
] as const;

/** Reads the upstream `Set-Cookie` list without losing any header. */
function readSetCookies(upstream: Response): string[] {
  const headers = upstream.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    const all = headers.getSetCookie();
    if (all.length > 0) return all;
  }
  const single = upstream.headers.get("set-cookie");
  return single ? [single] : [];
}

/** Returns the value of `name` from one raw `Set-Cookie` line, or null. */
function readCookieValue(raw: string, name: string): string | null {
  const first = raw.split(";")[0] ?? "";
  const separator = first.indexOf("=");
  if (separator < 0) return null;
  if (first.slice(0, separator).trim() !== name) return null;
  return first.slice(separator + 1);
}

/** Seconds from `Max-Age`, else from `Expires`, else null (session cookie). */
function cookieMaxAgeSeconds(raw: string): number | null {
  const maxAge = /(?:^|;)\s*max-age=(-?\d+)\s*(?:;|$)/i.exec(raw);
  if (maxAge) return Number.parseInt(maxAge[1], 10);
  const expires = /(?:^|;)\s*expires=([^;]+)/i.exec(raw);
  if (expires) {
    const when = Date.parse(expires[1]);
    if (!Number.isNaN(when)) {
      const delta = Math.floor((when - Date.now()) / 1000);
      return delta > 0 ? delta : 0;
    }
  }
  return null;
}

/**
 * Builds the session cookie the BROWSER receives, with forced attributes:
 * host-only (no `Domain`, so it can never be scoped to a parent site), `Path=/`,
 * `HttpOnly`, `SameSite=Lax` and `Secure` in production. Any upstream `Domain` /
 * `SameSite=None` / `Partitioned` is deliberately dropped — the whole point of
 * the BFF is that the cookie belongs to the frontend origin and nowhere else.
 */
function buildHostOnlySessionCookie(name: string, value: string, maxAge: number | null): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

export interface ForwardAuthOptions {
  method: "GET" | "POST";
  /** Logout: always re-emit the session cookie as cleared (`Max-Age=0`). */
  clearSession?: boolean;
}

/**
 * Forwards one `/api/auth/*` request to the backend and rewrites the session
 * cookie so it is first-party on the frontend origin.
 */
export async function forwardAuth(
  request: Request,
  endpoint: "login" | "logout" | "password" | "me",
  options: ForwardAuthOptions,
): Promise<Response> {
  const base = backendApiBase();
  if (!base) {
    return Response.json(CONFIG_MISSING_BODY, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Keep the backend's rate limiter and visitor/IP logic working: forward the
  // client IP when the hosting proxy supplied one. Attribute-free and value-free
  // — nothing is logged here.
  const forwardedFor = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  let body: string | undefined;
  if (options.method !== "GET") {
    body = await request.text();
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/auth/${endpoint}`, {
      method: options.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    // Never echo the upstream host or the fetch error message (it can contain
    // the origin); a generic, non-blaming body is enough.
    return Response.json(
      {
        success: false,
        error: {
          code: "UPSTREAM_UNREACHABLE",
          message: "We couldn't reach the authentication service right now. Please try again.",
        },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const text = await upstream.text();
  const responseHeaders = new Headers();
  responseHeaders.set("content-type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  const response = new Response(text || null, { status: upstream.status, headers: responseHeaders });

  const name = sessionCookieName();
  const setCookies = readSetCookies(upstream);
  let reEmitted = false;
  for (const raw of setCookies) {
    const value = readCookieValue(raw, name);
    if (value === null) continue;
    const maxAge = options.clearSession ? 0 : cookieMaxAgeSeconds(raw);
    response.headers.append("set-cookie", buildHostOnlySessionCookie(name, value, maxAge));
    reEmitted = true;
  }
  // A logout must always clear the cookie, even if the backend omitted the
  // header (or answered from a cache), so the browser can never keep a zombie
  // session after the server has forgotten it.
  if (options.clearSession && !reEmitted) {
    response.headers.append("set-cookie", buildHostOnlySessionCookie(name, "", 0));
  }

  return response;
}

/** `Cache-Control: no-store` for every auth handler (also set in next.config). */
export const NO_STORE = { "Cache-Control": "no-store" } as const;
