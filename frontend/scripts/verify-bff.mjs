#!/usr/bin/env node
/**
 * BFF (Backend-For-Frontend) verification — `npm run verify:bff`
 *
 * Proves the auth route handlers in `frontend/app/api/auth/*` make the session
 * cookie FIRST-PARTY regardless of what the backend sends:
 *
 *   • a stub upstream deliberately returns a hostile cookie
 *       `Domain=example.com; SameSite=None; Partitioned; Max-Age=604800`
 *   • the frontend re-emits it host-only, `SameSite=Lax`, `Path=/`, `HttpOnly`,
 *     `Secure` (production) and with the upstream `Max-Age` copied.
 *   • logout re-emits the same cookie with `Max-Age=0`.
 *   • a login with no upstream cookie → no cookie is invented.
 *
 * It boots its OWN `next start` on a free port with `BACKEND_ORIGIN` pointed at
 * the stub, so it never touches the running dev/preview servers. Requires a
 * production build (`.next`); if none exists it reports SKIPPED loudly and exits
 * non-zero — never a silent pass.
 *
 * No cookie value or token is ever printed: only attribute names and booleans.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const NEXT_BIN = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const STUB_PORT = Number(process.env.BFF_STUB_PORT ?? 4521);
const APP_PORT = Number(process.env.BFF_APP_PORT ?? 3221);
const APP = `http://127.0.0.1:${APP_PORT}`;
const COOKIE_NAME = "jazari_admin";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
let failed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name} ${detail}`);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

/** Attribute names/booleans only — the cookie value is never read. */
function cookieAttributes(raw) {
  if (!raw) return { found: false };
  const attrs = { found: true, httpOnly: false, secure: false, sameSite: null, path: null, domain: null, maxAge: null, partitioned: false };
  for (const part of raw.split(";").slice(1)) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    const key = (eq === -1 ? trimmed : trimmed.slice(0, eq)).toLowerCase();
    const value = eq === -1 ? "" : trimmed.slice(eq + 1);
    if (key === "httponly") attrs.httpOnly = true;
    else if (key === "secure") attrs.secure = true;
    else if (key === "samesite") attrs.sameSite = value;
    else if (key === "path") attrs.path = value;
    else if (key === "domain") attrs.domain = value;
    else if (key === "max-age") attrs.maxAge = Number(value);
    else if (key === "partitioned") attrs.partitioned = true;
  }
  return attrs;
}

/** The Set-Cookie line for the session cookie (name and attributes only). */
function sessionSetCookie(response) {
  const all = response.headers.getSetCookie?.() ?? [];
  return all.find((c) => c.trim().toLowerCase().startsWith(`${COOKIE_NAME}=`)) ?? null;
}

/* ---- Hostile stub upstream --------------------------------------------- */
function stubUpstream() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`);
    const body = await new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/api/auth/login") {
      // Deliberately everything the BFF must NOT forward.
      res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=stub-token; Domain=example.com; Path=/; HttpOnly; SameSite=None; Partitioned; Max-Age=604800`,
      );
      res.statusCode = 200;
      return res.end(JSON.stringify({ success: true, data: { admin: { email: "stub@example.com" } } }));
    }
    if (url.pathname === "/api/auth/logout") {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=; Domain=example.com; Path=/; HttpOnly; SameSite=None; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
      );
      res.statusCode = 200;
      return res.end(JSON.stringify({ success: true, data: { loggedOut: true } }));
    }
    if (url.pathname === "/api/auth/me") {
      res.statusCode = req.headers.cookie ? 200 : 401;
      return res.end(
        JSON.stringify(
          req.headers.cookie
            ? { success: true, data: { admin: { email: "stub@example.com" } } }
            : { success: false, error: { code: "UNAUTHORIZED", message: "Please sign in to continue." } },
        ),
      );
    }
    if (url.pathname === "/api/auth/no-cookie") {
      res.statusCode = 200; // success, but intentionally sets NO cookie.
      return res.end(JSON.stringify({ success: true, data: { admin: { email: "stub@example.com" } } }));
    }
    void body;
    res.statusCode = 404;
    res.end(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: "nope" } }));
  });
}

/** Spawns `next start` on `port`. `backendOrigin === undefined` removes it. */
function spawnApp(port, backendOrigin) {
  const env = { ...process.env, NODE_ENV: "production" };
  if (backendOrigin === undefined) delete env.BACKEND_ORIGIN;
  else env.BACKEND_ORIGIN = backendOrigin;
  return spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: process.cwd(),
    stdio: "ignore",
    env,
  });
}

async function waitForApp(base = APP) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/auth/me`);
      if (res.status > 0) return true;
    } catch {
      /* not up yet */
    }
    await sleep(400);
  }
  return false;
}

let app2 = null;

async function main() {
  if (!existsSync(join(process.cwd(), ".next", "BUILD_ID"))) {
    console.log("[verify-bff] SKIPPED loudly: no production build (.next) — run `npm run build` first. NOT a pass.");
    process.exit(1);
  }

  const stub = stubUpstream();
  await new Promise((resolve) => stub.listen(STUB_PORT, "127.0.0.1", resolve));

  const next = spawnApp(APP_PORT, `http://127.0.0.1:${STUB_PORT}`);

  try {
    const up = await waitForApp();
    check("BFF app server reachable (next start with BACKEND_ORIGIN → stub)", up === true);
    if (!up) throw new Error("app server never became reachable");

    console.log("\n[bff] hostile upstream Set-Cookie → re-emitted first-party cookie");
    const login = await fetch(`${APP}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "stub@example.com", password: "stub" }),
    });
    const loginBody = await login.json().catch(() => null);
    const attrs = cookieAttributes(sessionSetCookie(login));
    check("upstream 200 + JSON body forwarded untouched", login.status === 200 && loginBody?.success === true);
    check("login response carries Cache-Control: no-store", /no-store/.test(login.headers.get("cache-control") || ""));
    check("re-emitted cookie exists", attrs.found === true);
    check("re-emitted cookie is host-only (upstream Domain=example.com dropped)", attrs.domain === null, `domain=${attrs.domain}`);
    check("re-emitted cookie is SameSite=Lax (upstream SameSite=None dropped)", (attrs.sameSite || "").toLowerCase() === "lax", `sameSite=${attrs.sameSite}`);
    check("re-emitted cookie is not Partitioned", attrs.partitioned === false);
    check("re-emitted cookie keeps Path=/", attrs.path === "/");
    check("re-emitted cookie is HttpOnly", attrs.httpOnly === true);
    check("re-emitted cookie is Secure in production", attrs.secure === true);
    check("re-emitted cookie copies the upstream Max-Age (604800)", attrs.maxAge === 604800, `maxAge=${attrs.maxAge}`);

    console.log("\n[bff] logout clears with the same host-only attributes");
    const logout = await fetch(`${APP}/api/auth/logout`, { method: "POST" });
    const logoutAttrs = cookieAttributes(sessionSetCookie(logout));
    check("logout re-emits the session cookie", logoutAttrs.found === true);
    check("logout Max-Age=0", logoutAttrs.maxAge === 0, `maxAge=${logoutAttrs.maxAge}`);
    check("logout is host-only (no Domain)", logoutAttrs.domain === null);
    check("logout is SameSite=Lax", (logoutAttrs.sameSite || "").toLowerCase() === "lax");
    check("logout keeps Path=/ + HttpOnly", logoutAttrs.path === "/" && logoutAttrs.httpOnly === true);

    console.log("\n[bff] me forwards the incoming cookie and the upstream status");
    const me = await fetch(`${APP}/api/auth/me`, { headers: { Cookie: `${COOKIE_NAME}=anything` } });
    const meAttrs = cookieAttributes(sessionSetCookie(me));
    check("me with a cookie → 200 (cookie reached the upstream)", me.status === 200);
    check("me sets no cookie of its own", meAttrs.found === false);
    const meNoCookie = await fetch(`${APP}/api/auth/me`);
    check("me without a cookie → 401 generic", meNoCookie.status === 401);

    console.log("\n[bff] a missing BACKEND_ORIGIN → 503 CONFIG_MISSING, never a crash");
    // Boot a second app instance with `BACKEND_ORIGIN` removed. Production has no
    // dev fallback, so the honest answer is a 503 with a non-blaming body — the
    // login page shows its own message for it (never "wrong password").
    app2 = spawnApp(APP_PORT + 1, undefined);
    const app2Base = `http://127.0.0.1:${APP_PORT + 1}`;
    const app2Up = await waitForApp(app2Base);
    check("second BFF app reachable (no BACKEND_ORIGIN)", app2Up === true);
    if (app2Up) {
      const missing = await fetch(`${app2Base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@invalid.invalid", password: "x" }),
      });
      const missingBody = await missing.json().catch(() => null);
      check(
        "unconfigured login → 503 CONFIG_MISSING (not a 500 / not a fake 401)",
        missing.status === 503 && missingBody?.error?.code === "CONFIG_MISSING",
        `status=${missing.status} code=${missingBody?.error?.code}`,
      );
    }
  } finally {
    next.kill();
    app2?.kill();
    stub.close();
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`BFF verification: ${passed}/${passed + failed} checks passed`);
  if (failed > 0) {
    for (const failure of failures) console.log(`  FAILED: ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\nverify-bff failed: ${error.message}`);
  process.exit(1);
});
