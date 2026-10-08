import type { NextConfig } from "next";

// The API origin is read from the environment so components never hardcode it.
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
let apiHost = "localhost";
let apiProtocol = "http";
let apiPort: string | undefined = "5000";
try {
  const parsed = new URL(apiUrl);
  apiHost = parsed.hostname;
  apiProtocol = parsed.protocol.replace(":", "");
  apiPort = parsed.port || undefined;
} catch {
  // Fall back to the localhost defaults above.
}

// Same-origin API proxy (production default). When set, the Next server
// forwards `/api/*` to the backend so the browser only ever talks to
// https://<frontend>/api — the auth cookie is then first-party and does not
// depend on cross-site cookie behaviour between two *.vercel.app hosts.
const backendOrigin = (process.env.BACKEND_ORIGIN ?? "").replace(/\/+$/, "");

/**
 * Build-time misconfiguration guard (warning only — never fails the build).
 *
 * `NEXT_PUBLIC_API_URL` is inlined into the browser bundle at build time, so a
 * value left over from another environment survives an env change unless the
 * app is rebuilt. If production is built with an absolute cross-site API URL
 * while the same-origin proxy is off, the browser calls the backend on a
 * different site and the auth cookie becomes a third-party cookie — stored on
 * login but not sent afterwards, which presents as "login works, then every
 * request is 401". Surfaced here so it is impossible to miss, and only host
 * names are ever printed (never a URL with credentials).
 */
function warnOnCookieUnsafeApiUrl() {
  if (process.env.NODE_ENV !== "production") return;
  if (backendOrigin) return; // Same-origin proxy active → cookie is first-party.
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return; // Relative "/api" → same origin.
  let apiHost: string;
  let siteHost = "";
  try {
    apiHost = new URL(raw).host;
  } catch {
    return;
  }
  try {
    siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").host;
  } catch {
    siteHost = "";
  }
  if (siteHost && apiHost === siteHost) return;
  console.warn(
    `[jazari] Auth-cookie risk: NEXT_PUBLIC_API_URL is an absolute cross-site API URL (host: ${apiHost}) ` +
      "and BACKEND_ORIGIN (the same-origin /api proxy) is not set. Production should set " +
      "BACKEND_ORIGIN to the backend origin and NEXT_PUBLIC_API_URL to /api, then rebuild.",
  );
}

warnOnCookieUnsafeApiUrl();

const nextConfig: NextConfig = {
  // Exposed to the browser bundle so the API client can prefer the same-origin
  // proxy whenever it is configured. This makes the correct (first-party
  // cookie) configuration the default even if a stale absolute
  // NEXT_PUBLIC_API_URL is left over in the environment — the exact failure
  // mode behind "login succeeds then every request is 401".
  env: {
    NEXT_PUBLIC_API_PROXY: backendOrigin ? "1" : "",
  },
  async rewrites() {
    if (!backendOrigin) return [];
    return [{ source: "/api/:path*", destination: `${backendOrigin}/api/:path*` }];
  },
  async headers() {
    // Session state must never be cached anywhere: a cached `/api/auth/me` or
    // `/api/auth/logout` keeps an admin signed in after signing out, and a cached
    // login response could replay a stale cookie. Applies to the BFF route
    // handlers (filesystem) and to the rewritten `/api/auth/*` paths alike.
    return [
      {
        source: "/api/auth/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/api/diag-session",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  images: {
    // Product/logo artwork comes from the API (local dev driver or Cloudinary).
    remotePatterns: [
      {
        protocol: (apiProtocol === "https" ? "https" : "http") as "http" | "https",
        hostname: apiHost,
        ...(apiPort ? { port: apiPort } : {}),
        pathname: "/**",
      },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
    // Next 16 blocks upstream images that resolve to private IPs (SSRF guard).
    // In development the local storage driver serves uploads from
    // localhost:5000, which that guard rejects with a misleading 400. Only
    // hosts matching `remotePatterns` above can ever be fetched, so enabling
    // it here re-opens exactly the pattern-approved localhost API — set
    // NEXT_PUBLIC_API_URL to the real API host in production.
    dangerouslyAllowLocalIP: true,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
};

export default nextConfig;
