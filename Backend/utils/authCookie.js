import env from "../config/env.js";

/**
 * The admin session cookie — ONE source of truth.
 *
 * Every path that touches the session cookie (login, password-change refresh,
 * logout/clear) goes through the helpers below so the name, path and security
 * flags can never drift apart. A mismatch between what is written and what is
 * cleared/read is one of the classic causes of a "logged in but every request
 * is 401" bug, so it is centralized here rather than repeated per controller.
 *
 * The cookie is deliberately HOST-ONLY (no `domain` attribute) and lives on the
 * frontend origin: the browser calls the frontend's own `/api` path, which the
 * Next server proxies to the backend. That keeps the cookie first-party, so it
 * is stored and sent reliably regardless of cross-site cookie behaviour.
 */

/** Parse simple duration strings like "7d", "12h", "30m" or plain seconds. */
export function parseDurationMs(value, fallbackMs) {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(String(value).trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * factors[unit];
}

export const AUTH_COOKIE_NAME = env.jwt.cookieName;

/** Session lifetime in milliseconds, derived from JWT_EXPIRES_IN. */
export const SESSION_MAX_AGE_MS = parseDurationMs(env.jwt.expiresIn, 7 * 86_400_000);

/**
 * The shared cookie attributes.
 *
 * No `domain` → host-only cookie. `path: "/"` so the frontend's `/api/*`
 * requests always carry it. `httpOnly` means the token is never readable from
 * JS. `secure` is true in production and `sameSite` comes from configuration
 * (default "lax", which is correct for the same-origin proxy setup).
 */
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.jwt.cookieSecure,
    sameSite: env.jwt.cookieSameSite,
    path: "/",
  };
}

/** Write the session cookie (login and password-change refresh). */
export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...authCookieOptions(),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

/**
 * Clear the session cookie (logout). Uses the exact same attributes plus an
 * explicit `maxAge: 0`, so the response carries BOTH `Max-Age=0` and an
 * `Expires` in the past — the two signals every browser honours. The BFF route
 * handler re-emits this as a host-only clearing cookie on the frontend origin.
 */
export function clearAuthCookie(res) {
  // Written through the same helper path as login (not `res.clearCookie`) so the
  // clearing response carries BOTH `Max-Age=0` and an `Expires` in the past —
  // the two signals every browser honours — with identical flags and no Domain.
  res.cookie(AUTH_COOKIE_NAME, "", {
    ...authCookieOptions(),
    maxAge: 0,
    expires: new Date(1),
  });
}
