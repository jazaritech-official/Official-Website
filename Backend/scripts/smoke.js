#!/usr/bin/env node
/**
 * End-to-end API smoke test — `npm run smoke`
 *
 * Boots an in-memory MongoDB, seeds it, starts the API on a test port, then
 * exercises the public + admin flows over real HTTP and asserts responses.
 * Nothing outside the test process is touched.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import env from "../config/env.js";
import Service from "../models/Service.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.SMOKE_PORT || "5199";
const BASE = `http://127.0.0.1:${PORT}/api`;

const ADMIN_EMAIL = env.admin.email;
const ADMIN_PASSWORD = env.admin.password;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("[smoke] ADMIN_EMAIL and ADMIN_PASSWORD must be set in Backend/.env");
  process.exit(1);
}

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

function runScript(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForHealth(timeoutMs = 30_000, base = BASE) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/**
 * Read the attribute NAMES of a Set-Cookie header — never its value.
 * Used to assert the session cookie's security flags without touching the
 * token itself.
 */
function cookieAttributes(response, name = "jazari_admin") {
  const raw = (response.headers.getSetCookie?.() || []).find((c) =>
    c.trim().toLowerCase().startsWith(`${name.toLowerCase()}=`),
  );
  if (!raw) return { found: false };
  const attrs = { found: true, httpOnly: false, secure: false, sameSite: null, path: null, domain: null };
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
  }
  return attrs;
}

/* ---- Synthetic fixtures for the image-processing assertions ------------- */
async function solidPngDataUri() {
  // White background + navy circle (a solid, safely-removable background).
  const svg = Buffer.from(
    `<svg width="400" height="300"><rect width="400" height="300" fill="#ffffff"/><circle cx="200" cy="150" r="80" fill="#212c65"/></svg>`,
  );
  const buf = await sharp(svg).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function complexPngDataUri() {
  // Per-pixel noise: no dominant border colour — must not be destroyed.
  const w = 300;
  const h = 300;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) % 256;
  const buf = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function cornerAlpha(url) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  return { width: info.width, height: info.height, corner: at(0, 0), center: at(info.width >> 1, info.height >> 1) };
}

function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.() || [];
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const [name, ...rest] = pair.split("=");
    if (name.trim() === "jazari_admin") return `${name.trim()}=${rest.join("=")}`;
  }
  return "";
}

async function json(pathname, { method = "GET", body, cookie, headers = {} } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response (e.g. CSV export) — callers inspect `status`.
  }
  return { status: response.status, body: payload, response };
}

const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri("jazari");
console.log(`[smoke] in-memory MongoDB at ${uri}`);

const seedCode = await runScript(["scripts/seed.js"], { MONGODB_URI: uri });
if (seedCode !== 0) {
  console.error("[smoke] seed failed");
  await mongod.stop();
  process.exit(1);
}

const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, MONGODB_URI: uri, PORT, NODE_ENV: "test" },
});
server.stdout.on("data", (chunk) => process.stdout.write(`[api] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));

async function cleanup(code) {
  server.kill("SIGTERM");
  await mongod.stop();
  process.exit(code);
}

const healthy = await waitForHealth();
if (!healthy) {
  console.error("[smoke] API never became healthy");
  await cleanup(1);
}

console.log("\n[smoke] 1. health");
{
  const { status, body } = await json("/health");
  check("GET /api/health → 200", status === 200);
  check("health reports connected database", body?.data?.database === "connected", `got ${body?.data?.database}`);
}

console.log("[smoke] 2. public content");
{
  const products = await json("/products");
  check("GET /api/products → seeded products", products.status === 200 && products.body.data.length >= 4, `got ${products.body?.data?.length}`);
  const services = await json("/services");
  check("GET /api/services → 14 services", services.status === 200 && services.body.data.length === 14, `got ${services.body?.data?.length}`);
  check("service exposes icon key", Boolean(services.body.data[0]?.icon));
  const hubServices = services.body.data.filter((s) => Number.isInteger(s.hubSlot));
  check(
    "services expose backward-compatible hub fields (hubSlot/hubLabel)",
    services.body.data.every((s) => "hubSlot" in s && "hubLabel" in s),
  );
  check("5 services are featured in the hub with unique slots 0..4",
    hubServices.length === 5 &&
      new Set(hubServices.map((s) => s.hubSlot)).size === 5 &&
      hubServices.every((s) => s.hubSlot >= 0 && s.hubSlot <= 4),
    `featured=${hubServices.length} slots=[${hubServices.map((s) => s.hubSlot).join(",")}]`);
  check("hub services expose a hubLabel",
    hubServices.every((s) => typeof s.hubLabel === "string" && s.hubLabel.length > 0));

  // Services-card copy (Task I, backward-compatible optional fields).
  check(
    "every service exposes the optional shortDescription/highlights fields",
    services.body.data.every((s) => "shortDescription" in s && Array.isArray(s.highlights)),
  );
  check(
    "shortDescription is populated and within 90 characters",
    services.body.data.every(
      (s) => typeof s.shortDescription === "string" && s.shortDescription.length > 0 && s.shortDescription.length <= 90,
    ),
    `max=${Math.max(...services.body.data.map((s) => (s.shortDescription || "").length))}`,
  );
  check(
    "highlights hold at most 3 entries of at most 24 characters",
    services.body.data.every(
      (s) =>
        s.highlights.length <= 3 &&
        s.highlights.every((entry) => typeof entry === "string" && entry.length <= 24),
    ),
    `maxEntries=${Math.max(...services.body.data.map((s) => s.highlights.length))}`,
  );

  // Schema-level backward compatibility: the new fields are optional with
  // defaults, so records created before Task I remain valid.
  const shortPath = Service.schema.path("shortDescription");
  const highlightsPath = Service.schema.path("highlights");
  check(
    "Service schema: shortDescription/highlights are optional with defaults (old records stay valid)",
    shortPath?.instance === "String" &&
      shortPath?.options?.default === "" &&
      highlightsPath?.instance === "Array" &&
      Array.isArray(highlightsPath?.options?.default) &&
      shortPath?.isRequired !== true &&
      highlightsPath?.isRequired !== true,
  );

  const logos = await json("/logos");
  check("GET /api/logos → empty list without errors", logos.status === 200 && Array.isArray(logos.body.data) && logos.body.data.length === 0);
}

console.log("[smoke] 3. submission intake");
let referenceId = null;
{
  const valid = await json("/submission", {
    method: "POST",
    body: { name: "Amina Rahman", domain: "example.com", email: "amina@example.com", service: "Website" },
  });
  referenceId = valid.body?.data?.referenceId;
  check("valid submission → 201 + reference id", valid.status === 201 && /^JT-\d{8}-[A-Z0-9]{6}$/.test(referenceId || ""), `got ${referenceId}`);

  const duplicate = await json("/submission", {
    method: "POST",
    body: { name: "Amina Rahman", domain: "example.com", email: "amina@example.com", service: "Website" },
  });
  check("accidental duplicate → same reference", duplicate.status === 200 && duplicate.body?.data?.referenceId === referenceId);

  const noContact = await json("/submission", {
    method: "POST",
    body: { name: "No Contact", service: "Website" },
  });
  check("missing phone+email → 400", noContact.status === 400 && noContact.body?.success === false);

  const honeypot = await json("/submission", {
    method: "POST",
    body: { name: "Bot", email: "bot@spam.io", service: "Website", website: "spam.example" },
  });
  check("honeypot accepted silently (201)", honeypot.status === 201);

  const badEmail = await json("/submission", {
    method: "POST",
    body: { name: "Bad Email", email: "not-an-email", service: "Website" },
  });
  check("invalid email → 400", badEmail.status === 400);
}

console.log("[smoke] 4. visitor tracking + dedupe");
{
  const first = await json("/visitor-track", {
    method: "POST",
    body: { page: "/", referrer: "https://example.org" },
  });
  check("first hit recorded", first.status === 201 && first.body?.data?.deduplicated === false);

  const second = await json("/visitor-track", { method: "POST", body: { page: "/services" } });
  check("second hit deduplicated", second.status === 200 && second.body?.data?.deduplicated === true);
}

console.log("[smoke] 5. authentication");
let cookie;
{
  const wrong = await json("/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: "wrong-password" } });
  check("wrong password → 401 generic", wrong.status === 401 && !/hash|bcrypt|jwt/i.test(wrong.body?.error?.message || ""));

  const unknown = await json("/auth/login", { method: "POST", body: { email: "nobody@nowhere.com", password: "x" } });
  check("unknown email → identical 401 message", unknown.status === 401 && unknown.body?.error?.message === wrong.body?.error?.message);

  const ok = await json("/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  cookie = cookieFrom(ok.response);
  check("valid login → 200 + httpOnly cookie", ok.status === 200 && cookie.startsWith("jazari_admin="));
  check("login response has no password hash", !JSON.stringify(ok.body).includes("$2"));

  // Session-cookie attributes (names/booleans only — the value is never read).
  const attrs = cookieAttributes(ok.response);
  check("session cookie: HttpOnly present", attrs.found && attrs.httpOnly === true);
  check("session cookie: Path is /", attrs.path === "/");
  check("session cookie: host-only (no Domain attribute)", attrs.found && attrs.domain === null);
  check(
    `session cookie: SameSite=${env.jwt.cookieSameSite}`,
    (attrs.sameSite || "").toLowerCase() === env.jwt.cookieSameSite.toLowerCase(),
  );
  check(
    "session cookie: Secure matches COOKIE_SECURE",
    attrs.secure === env.jwt.cookieSecure,
    `secure=${attrs.secure} configured=${env.jwt.cookieSecure}`,
  );

  const me = await json("/auth/me", { cookie });
  check("GET /auth/me with cookie → admin", me.status === 200 && me.body?.data?.admin?.email === ADMIN_EMAIL);

  const meNoCookie = await json("/auth/me");
  check(
    "GET /auth/me without cookie → 401 generic",
    meNoCookie.status === 401 &&
      meNoCookie.body?.error?.code === "UNAUTHORIZED" &&
      meNoCookie.body?.error?.message === "Please sign in to continue.",
    `status=${meNoCookie.status} msg=${meNoCookie.body?.error?.message}`,
  );

  const unauth = await json("/admin/products");
  check("admin route without cookie → 401", unauth.status === 401);

  const badCookie = await json("/admin/products", { cookie: "jazari_admin=forged.value" });
  check("forged cookie → 401", badCookie.status === 401);
}

console.log("[smoke] 5b. session cookie under production flags");
{
  // Boot a second API process with the production cookie flags (COOKIE_SECURE
  // true + SameSite=Lax) against the same database and assert the attributes a
  // production browser would receive. A separate process has its own in-memory
  // rate-limit store, so the extra login never counts against the main server.
  const prodPort = String(Number(PORT) + 1);
  const prodBase = `http://127.0.0.1:${prodPort}/api`;
  const prodServer = spawn(process.execPath, ["server.js"], {
    cwd: root,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      MONGODB_URI: uri,
      PORT: prodPort,
      NODE_ENV: "test",
      COOKIE_SECURE: "true",
      COOKIE_SAMESITE: "lax",
    },
  });
  const prodUp = await waitForHealth(30_000, prodBase);
  check("production-flags API reachable", prodUp === true);
  if (prodUp) {
    const res = await fetch(`${prodBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const prodAttrs = cookieAttributes(res);
    check("prod config: Secure present", prodAttrs.found && prodAttrs.secure === true);
    check("prod config: HttpOnly present", prodAttrs.httpOnly === true);
    check("prod config: SameSite=Lax", (prodAttrs.sameSite || "").toLowerCase() === "lax");
    check("prod config: host-only (no Domain)", prodAttrs.domain === null);
    check("prod config: Path is /", prodAttrs.path === "/");
  }
  prodServer.kill("SIGTERM");
}

console.log("[smoke] 6. admin content management");
{
  const list = await json("/admin/products", { cookie });
  check("admin products list", list.status === 200 && list.body?.data?.length >= 4);

  const created = await json("/admin/products", {
    method: "POST",
    cookie,
    body: {
      name: "Smoke Test Product",
      category: "Website",
      productUrl: "https://example.com",
      highlightPoints: ["Point one", "Point two"],
    },
  });
  check("create product → 201", created.status === 201);
  const id = created.body?.data?._id;

  const updated = await json(`/admin/products/${id}`, {
    method: "PUT",
    cookie,
    body: { highlightPoints: ["Point one", "Point two updated", "Point three"] },
  });
  check("update product highlight points", updated.status === 200 && updated.body?.data?.highlightPoints.length === 3);

  const badUpdate = await json(`/admin/products/${id}`, {
    method: "PUT",
    cookie,
    body: { highlightPoints: ["", "   "] },
  });
  check("empty highlight points rejected → 400", badUpdate.status === 400);

  const publicAfter = await json("/products");
  check("created product appears publicly", publicAfter.body.data.some((p) => p.name === "Smoke Test Product"));

  const templates = await json("/admin/product-type-templates", { cookie });
  check("templates list → 8 seeded types", templates.status === 200 && templates.body?.data?.length === 8);

  const del = await json(`/admin/products/${id}`, { method: "DELETE", cookie });
  check("delete product", del.status === 200);
}

console.log("[smoke] 7. submissions admin + CSV");
{
  const list = await json("/admin/submissions", { cookie });
  check("submissions list contains the real one", list.status === 200 && list.body?.data?.some((s) => s.referenceId === referenceId));
  const honeypotEntry = list.body.data.find((s) => s.name === "Bot");
  check("honeypot submission was not stored", honeypotEntry === undefined);

  const id = list.body.data.find((s) => s.referenceId === referenceId)?._id;
  const status = await json(`/admin/submissions/${id}/status`, { method: "PATCH", cookie, body: { status: "Contacted" } });
  check("status update persists", status.status === 200 && status.body?.data?.status === "Contacted");

  const badStatus = await json(`/admin/submissions/${id}/status`, { method: "PATCH", cookie, body: { status: "Bogus" } });
  check("invalid status → 400", badStatus.status === 400);

  const csvResponse = await fetch(`${BASE}/admin/submissions/export`, { headers: { Cookie: cookie } });
  const csv = await csvResponse.text();
  check("CSV export → text/csv", csvResponse.status === 200 && (csvResponse.headers.get("content-type") || "").includes("text/csv"));
  check("CSV has header row", csv.includes("Reference ID"));
  check("CSV contains submission", csv.includes(referenceId));

  const del = await json(`/admin/submissions/${id}`, { method: "DELETE", cookie });
  check("delete submission", del.status === 200);

  const afterDelete = await json(`/admin/submissions/${id}`, { cookie });
  check("deleted submission → 404", afterDelete.status === 404);
}

console.log("[smoke] 8. dashboard + visitors");
{
  const stats = await json("/admin/dashboard/stats", { cookie });
  check("dashboard stats → 200", stats.status === 200);
  check("product count is real", typeof stats.body?.data?.products === "number" && stats.body.data.products >= 4);
  check("visitor today unique ≥ 1", stats.body?.data?.visitors?.todayUnique >= 1, `got ${stats.body?.data?.visitors?.todayUnique}`);
  check("14-day series present", Array.isArray(stats.body?.data?.visitors?.series) && stats.body.data.visitors.series.length === 14);

  const visitors = await json("/admin/visitors", { cookie });
  check("visitors list → 1 deduped record", visitors.status === 200 && visitors.body?.data?.length === 1);
  check("visit count incremented", visitors.body?.data?.[0]?.visitCount === 2, `got ${visitors.body?.data?.[0]?.visitCount}`);
}

console.log("[smoke] 9. logo upload lifecycle");
{
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const created = await json("/admin/logos", {
    method: "POST",
    cookie,
    body: { name: "Partner One", alt: "Partner logo", image: tinyPng },
  });
  check("upload logo → 201", created.status === 201, JSON.stringify(created.body));
  check("stored secureUrl + publicId", Boolean(created.body?.data?.secureUrl && created.body?.data?.publicId));
  const logoId = created.body?.data?._id;
  const storedPublicId = created.body?.data?.publicId;

  const publicList = await json("/logos");
  check("uploaded logo appears in public list", publicList.body?.data?.some((l) => l._id === logoId));

  const hidden = await json(`/admin/logos/${logoId}/visibility`, {
    method: "PATCH",
    cookie,
    body: { isVisible: false },
  });
  check("hide logo → 200", hidden.status === 200 && hidden.body?.data?.isVisible === false);
  const publicAfterHide = await json("/logos");
  check("hidden logo excluded publicly", !publicAfterHide.body?.data?.some((l) => l._id === logoId));

  const replaced = await json(`/admin/logos/${logoId}`, {
    method: "PUT",
    cookie,
    body: { image: tinyPng, isVisible: true },
  });
  check("replace image → new publicId", replaced.status === 200 && replaced.body?.data?.publicId !== storedPublicId);

  const del = await json(`/admin/logos/${logoId}`, { method: "DELETE", cookie });
  check("delete logo → 200", del.status === 200);
  const afterDelete = await json("/admin/logos", { cookie });
  check("deleted logo gone from admin list", !afterDelete.body?.data?.logos?.some((l) => l._id === logoId));

  const unauthorizedUpload = await json("/admin/logos", { method: "POST", body: { name: "X", image: tinyPng } });
  check("unauthenticated upload → 401", unauthorizedUpload.status === 401);
}

console.log("[smoke] 9b. logo image processing pipeline");
let processedLogoId = null;
{
  const solid = await solidPngDataUri();
  const complex = await complexPngDataUri();

  // --- Solid background → removed, artwork preserved ----------------------
  const created = await json("/admin/logos", {
    method: "POST",
    cookie,
    body: { name: "Smoke Solid", alt: "Solid background logo", image: solid },
  });
  processedLogoId = created.body?.data?._id;
  check("solid-bg upload → 201", created.status === 201, JSON.stringify(created.body).slice(0, 200));
  check("backgroundStatus=removed for solid bg", created.body?.data?.backgroundStatus === "removed", created.body?.data?.backgroundStatus);
  check("hasAlpha true after removal", created.body?.data?.hasAlpha === true);
  check("width/height captured", created.body?.data?.width > 0 && created.body?.data?.height > 0, `${created.body?.data?.width}x${created.body?.data?.height}`);
  check("aspectRatio captured", typeof created.body?.data?.aspectRatio === "number");
  check("dominantColors captured", Array.isArray(created.body?.data?.dominantColors) && created.body.data.dominantColors.length > 0);
  check("averageLuminance captured", typeof created.body?.data?.averageLuminance === "number");
  check("tone classified (dark navy)", created.body?.data?.tone === "dark", created.body?.data?.tone);
  check("original asset preserved", Boolean(created.body?.data?.originalUrl && created.body?.data?.originalPublicId));

  const solidPixels = await cornerAlpha(created.body.data.secureUrl);
  check("solid bg: corners transparent", solidPixels.corner[3] === 0, `alpha=${solidPixels.corner[3]}`);
  check("solid bg: centre artwork remains opaque", solidPixels.center[3] > 200, `alpha=${solidPixels.center[3]}`);

  // --- Complex background → preserved, never destroyed --------------------
  const complexCreated = await json("/admin/logos", {
    method: "POST",
    cookie,
    body: { name: "Smoke Complex", image: complex },
  });
  const complexStatus = complexCreated.body?.data?.backgroundStatus;
  check("complex bg upload → 201", complexCreated.status === 201);
  check("complex bg not force-removed", complexStatus === "kept" || complexStatus === "needs-transparent-png", complexStatus);
  check("complex bg original available", Boolean(complexCreated.body?.data?.originalPublicId));

  // --- Reprocess is idempotent (always from the preserved original) --------
  const rp1 = await json(`/admin/logos/${processedLogoId}/reprocess`, { method: "POST", cookie, body: { tolerance: 22 } });
  check("reprocess → 200", rp1.status === 200, JSON.stringify(rp1.body).slice(0, 160));
  const rp2 = await json(`/admin/logos/${processedLogoId}/reprocess`, { method: "POST", cookie, body: { tolerance: 22 } });
  check(
    "reprocess idempotent (same dimensions + tone)",
    rp1.body?.data?.logo?.width === rp2.body?.data?.logo?.width &&
      rp1.body?.data?.logo?.height === rp2.body?.data?.logo?.height &&
      rp1.body?.data?.logo?.tone === rp2.body?.data?.logo?.tone,
  );
  check("reprocess keeps backgroundStatus=removed", rp2.body?.data?.logo?.backgroundStatus === "removed");

  // --- Revert restores the untouched original -----------------------------
  const reverted = await json(`/admin/logos/${processedLogoId}/revert`, { method: "POST", cookie });
  check("revert → 200", reverted.status === 200);
  check("revert points secureUrl at original", reverted.body?.data?.secureUrl === reverted.body?.data?.originalUrl);
  check("revert sets backgroundStatus=kept", reverted.body?.data?.backgroundStatus === "kept");
  const revertedPixels = await cornerAlpha(reverted.body.data.secureUrl);
  check("reverted asset is the opaque original (corner alpha 255)", revertedPixels.corner[3] === 255, `alpha=${revertedPixels.corner[3]}`);

  // --- Bulk fix: idempotent, per-item isolation ---------------------------
  const bulk1 = await json("/admin/logos/bulk-fix", { method: "POST", cookie, body: { tolerance: 22 } });
  check("bulk fix → 200", bulk1.status === 200);
  check("bulk fix reports a summary", typeof bulk1.body?.data?.summary?.total === "number" && bulk1.body.data.summary.total >= 2);
  check("bulk fix had no failures", bulk1.body?.data?.summary?.failed === 0, JSON.stringify(bulk1.body?.data?.summary));
  const bulk2 = await json("/admin/logos/bulk-fix", { method: "POST", cookie, body: { tolerance: 22 } });
  check("repeated bulk fix does not degrade (no failures)", bulk2.body?.data?.summary?.failed === 0);
  check(
    "repeated bulk fix is idempotent (processed drops to 0)",
    bulk2.body?.data?.summary?.processed === 0,
    JSON.stringify(bulk2.body?.data?.summary),
  );

  // --- Public API exposes only safe fields --------------------------------
  const publicList = await json("/logos");
  const publicEntry = publicList.body?.data?.find((l) => l._id === processedLogoId);
  check("public logo present after reprocess", Boolean(publicEntry));
  check("public logo exposes tone + backgroundStatus + dimensions",
    Boolean(publicEntry) && typeof publicEntry.tone === "string" && typeof publicEntry.backgroundStatus === "string" && typeof publicEntry.width === "number");
  check("public logo exposes displayName + alt", Boolean(publicEntry?.displayName) && Boolean(publicEntry?.alt));
  check("public logo exposes NO publicId / original refs",
    Boolean(publicEntry) && !("publicId" in publicEntry) && !("originalPublicId" in publicEntry) && !("originalUrl" in publicEntry));

  // --- Delete cleans processed + original + DB, leaving others untouched --
  const beforeDelete = await json("/admin/logos", { cookie });
  const beforeCount = beforeDelete.body?.data?.logos?.length ?? 0;
  const del = await json(`/admin/logos/${processedLogoId}`, { method: "DELETE", cookie });
  check("delete processed logo → 200", del.status === 200);
  const afterDelete = await json("/admin/logos", { cookie });
  check("deleted logo gone from admin list", !afterDelete.body?.data?.logos?.some((l) => l._id === processedLogoId));
  check("delete removed exactly one record (no unrelated deletion)", (afterDelete.body?.data?.logos?.length ?? 0) === beforeCount - 1, `${beforeCount} → ${afterDelete.body?.data?.logos?.length}`);
  const publicAfterDelete = await json("/logos");
  check("deleted logo gone from public list", !publicAfterDelete.body?.data?.some((l) => l._id === processedLogoId));

  // --- Sensitive calls require authentication -----------------------------
  const unauthReprocess = await json(`/admin/logos/${afterDelete.body?.data?.logos?.[0]?._id}/reprocess`, { method: "POST" });
  check("unauthenticated reprocess → 401", unauthReprocess.status === 401);
  const unauthBulk = await json("/admin/logos/bulk-fix", { method: "POST" });
  check("unauthenticated bulk fix → 401", unauthBulk.status === 401);

  // --- Server-side preview (no asset stored) ------------------------------
  const preview = await json("/admin/logos/preview", {
    method: "POST",
    cookie,
    body: { image: solid, removeBackground: true, trim: true, tolerance: 22 },
  });
  check("preview → 200 with a PNG data URI", preview.status === 200 && /^data:image\/png;base64,/.test(preview.body?.data?.preview || ""));
  check("preview reports backgroundStatus=removed", preview.body?.data?.backgroundStatus === "removed", preview.body?.data?.backgroundStatus);
  check("preview returns metadata", typeof preview.body?.data?.metadata?.width === "number");
  const unauthPreview = await json("/admin/logos/preview", { method: "POST", body: { image: solid } });
  check("unauthenticated preview → 401", unauthPreview.status === 401);
}

console.log("[smoke] 10. super admin + team management");
{
  // Configured account is promoted to super_admin and active.
  const me = await json("/auth/me", { cookie });
  check("configured admin is super_admin", me.body?.data?.admin?.role === "super_admin", `got ${me.body?.data?.admin?.role}`);
  check("/auth/me reports isActive", me.body?.data?.admin?.isActive === true);
  check("/auth/me never returns a password hash", !JSON.stringify(me.body).includes("$2"));

  // JWT carries the role (decoded payload only — signature not trusted here).
  try {
    const payloadPart = cookie.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf8"));
    check("JWT payload includes super_admin role", payload.role === "super_admin");
  } catch {
    check("JWT payload includes super_admin role", false, "could not decode");
  }

  // Team listing (super admin allowed).
  const team = await json("/admin/team", { cookie });
  check("super admin can list team", team.status === 200 && Array.isArray(team.body?.data?.admins));
  check("team list never exposes password hashes", !JSON.stringify(team.body).includes("$2"));

  // Create a normal administrator.
  const TEST_PASSWORD = "SmokeTeam!2026";
  const createdN = await json("/admin/team", {
    method: "POST",
    cookie,
    body: { email: "Smoke.Admin@Example.com", name: "Smoke Admin", role: "admin", password: TEST_PASSWORD },
  });
  const nId = createdN.body?.data?.admin?.id;
  check("create admin → 201", createdN.status === 201, JSON.stringify(createdN.body));
  check("created email normalized", createdN.body?.data?.admin?.email === "smoke.admin@example.com");
  check("create response has no password field", !JSON.stringify(createdN.body).toLowerCase().includes("password"));

  const dup = await json("/admin/team", {
    method: "POST",
    cookie,
    body: { email: "smoke.admin@example.com", name: "Dup", role: "admin", password: TEST_PASSWORD },
  });
  check("duplicate email → 409", dup.status === 409);

  const weak = await json("/admin/team", {
    method: "POST",
    cookie,
    body: { email: "weak@example.com", name: "Weak", role: "admin", password: "short" },
  });
  check("weak password rejected", weak.status === 400);

  // Normal admin logs in and keeps existing permissions, but cannot reach Team.
  const nLogin = await json("/auth/login", {
    method: "POST",
    body: { email: "smoke.admin@example.com", password: TEST_PASSWORD },
  });
  const nCookie = cookieFrom(nLogin.response);
  check("normal admin can sign in", nLogin.status === 200 && nCookie.startsWith("jazari_admin="));
  const nProducts = await json("/admin/products", { cookie: nCookie });
  check("normal admin retains existing admin access", nProducts.status === 200);
  const nTeam = await json("/admin/team", { cookie: nCookie });
  check("normal admin cannot call team API → 403", nTeam.status === 403);

  // Password reset by a super admin (password is never returned).
  const NEW_PASSWORD = "SmokeTeam!2027";
  const reset = await json(`/admin/team/${nId}/password`, {
    method: "POST",
    cookie,
    body: { password: NEW_PASSWORD },
  });
  check("super admin can reset a password", reset.status === 200 && reset.body?.data?.reset === true);
  check("reset response has no password", !JSON.stringify(reset.body).includes(NEW_PASSWORD));
  const nRelogin = await json("/auth/login", {
    method: "POST",
    body: { email: "smoke.admin@example.com", password: NEW_PASSWORD },
  });
  check("new password works", nRelogin.status === 200);

  // Deactivation / reactivation take effect immediately (DB re-check).
  const deactivated = await json(`/admin/team/${nId}/status`, {
    method: "PATCH",
    cookie,
    body: { isActive: false },
  });
  check("super admin can deactivate an admin", deactivated.status === 200 && deactivated.body?.data?.admin?.isActive === false);
  const nBlocked = await json("/admin/products", { cookie: nCookie });
  check("inactive admin loses access immediately → 403", nBlocked.status === 403);

  const reactivated = await json(`/admin/team/${nId}/status`, {
    method: "PATCH",
    cookie,
    body: { isActive: true },
  });
  check("super admin can reactivate an admin", reactivated.status === 200 && reactivated.body?.data?.admin?.isActive === true);
  const nRestored = await json("/admin/products", { cookie: nCookie });
  check("reactivated admin regains access", nRestored.status === 200);

  // Self-protection / last-active-super-admin protection.
  const selfDemote = await json(`/admin/team/${me.body.data.admin.id}/role`, {
    method: "PATCH",
    cookie,
    body: { role: "admin" },
  });
  check("cannot demote self → 403", selfDemote.status === 403);
  const selfDeactivate = await json(`/admin/team/${me.body.data.admin.id}/status`, {
    method: "PATCH",
    cookie,
    body: { isActive: false },
  });
  check("cannot deactivate self → 403", selfDeactivate.status === 403);
  const selfDelete = await json(`/admin/team/${me.body.data.admin.id}`, { method: "DELETE", cookie });
  check("cannot delete self (last super admin) → 403", selfDelete.status === 403);

  // Delete the normal admin — its session dies immediately.
  const deleted = await json(`/admin/team/${nId}`, { method: "DELETE", cookie });
  check("super admin can delete an admin", deleted.status === 200 && deleted.body?.data?.deleted === true);
  const nGone = await json("/admin/products", { cookie: nCookie });
  check("deleted admin loses access immediately → 401", nGone.status === 401);

  // Seed is idempotent and never overwrites the configured password by default.
  const reseed = await runScript(["scripts/seed.js"], { MONGODB_URI: uri });
  check("re-running seed succeeds", reseed === 0);
  const relogin = await json("/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check("seed preserved the configured password", relogin.status === 200);
}

console.log("[smoke] 10b. production seed (seed:prod) safety + idempotency");
{
  const PROD_EMAIL = "smoke.prod@example.com";
  const PROD_PASSWORD = "SmokeProd!2026";
  const RESET_PASSWORD = "SmokeProd!2027";
  const PROD_NAME = "Smoke Prod Admin";
  const prodEnv = (extra = {}) => ({
    MONGODB_URI: uri,
    ADMIN_EMAIL: PROD_EMAIL,
    ADMIN_PASSWORD: PROD_PASSWORD,
    ADMIN_NAME: PROD_NAME,
    CONFIRM_PRODUCTION_SEED: "true",
    ...extra,
  });

  // The guard must refuse before connecting or writing anything.
  const refused = await runScript(["scripts/seed-prod.js"], {
    MONGODB_URI: uri,
    ADMIN_EMAIL: PROD_EMAIL,
    ADMIN_PASSWORD: PROD_PASSWORD,
    ADMIN_NAME: PROD_NAME,
    CONFIRM_PRODUCTION_SEED: "",
  });
  check("seed:prod refuses without CONFIRM_PRODUCTION_SEED", refused !== 0, `exit=${refused}`);

  // Password policy is enforced before the database is touched.
  const weak = await runScript(["scripts/seed-prod.js"], prodEnv({ ADMIN_PASSWORD: "weak" }));
  check("seed:prod rejects a password that violates the policy", weak !== 0, `exit=${weak}`);

  // Missing ADMIN_NAME is rejected.
  const noName = await runScript(["scripts/seed-prod.js"], prodEnv({ ADMIN_NAME: "" }));
  check("seed:prod requires ADMIN_NAME", noName !== 0, `exit=${noName}`);

  const firstRun = await runScript(["scripts/seed-prod.js"], prodEnv());
  check("seed:prod runs with explicit confirmation", firstRun === 0, `exit=${firstRun}`);

  const team1 = await json("/admin/team", { cookie });
  const prodAdmin = team1.body?.data?.admins?.find((a) => a.email === PROD_EMAIL);
  check("seed:prod created the configured admin", Boolean(prodAdmin));
  check("seed:prod promoted the admin to super_admin", prodAdmin?.role === "super_admin", prodAdmin?.role);
  check("seed:prod admin is active", prodAdmin?.isActive === true);

  const beforeServices = (await json("/services")).body?.data?.length;
  const beforeTemplates = (await json("/admin/product-type-templates", { cookie })).body?.data?.length;

  const secondRun = await runScript(["scripts/seed-prod.js"], prodEnv());
  check("seed:prod is idempotent (repeat run succeeds)", secondRun === 0, `exit=${secondRun}`);

  const team2 = await json("/admin/team", { cookie });
  check(
    "seed:prod does not duplicate the admin",
    team2.body?.data?.admins?.filter((a) => a.email === PROD_EMAIL).length === 1,
  );
  const afterServices = (await json("/services")).body?.data?.length;
  const afterTemplates = (await json("/admin/product-type-templates", { cookie })).body?.data?.length;
  check("seed:prod keeps the canonical 14 services", beforeServices === 14 && afterServices === 14, `${beforeServices}→${afterServices}`);
  check("seed:prod keeps the canonical 8 templates", beforeTemplates === 8 && afterTemplates === 8, `${beforeTemplates}→${afterTemplates}`);

  const preserved = await json("/auth/login", { method: "POST", body: { email: PROD_EMAIL, password: PROD_PASSWORD } });
  check("seed:prod preserved the existing password by default", preserved.status === 200, `status=${preserved.status}`);

  const resetRun = await runScript(
    ["scripts/seed-prod.js"],
    prodEnv({ SEED_RESET_ADMIN_PASSWORD: "true", ADMIN_PASSWORD: RESET_PASSWORD }),
  );
  check("seed:prod supports opt-in password reset", resetRun === 0, `exit=${resetRun}`);
  const resetLogin = await json("/auth/login", { method: "POST", body: { email: PROD_EMAIL, password: RESET_PASSWORD } });
  check("reset password signs in", resetLogin.status === 200, `status=${resetLogin.status}`);
  const oldLogin = await json("/auth/login", { method: "POST", body: { email: PROD_EMAIL, password: PROD_PASSWORD } });
  check("previous password rejected after opt-in reset", oldLogin.status === 401, `status=${oldLogin.status}`);

  // Demo admin deactivation (never deleted).
  const DEMO_PASSWORD = "SmokeDemo!2026";
  const demoCreated = await json("/admin/team", {
    method: "POST",
    cookie,
    body: { email: "demo.smoke@example.com", name: "Demo Smoke", role: "admin", password: DEMO_PASSWORD },
  });
  check("demo admin created for the deactivation test", demoCreated.status === 201);
  const demoRun = await runScript(
    ["scripts/seed-prod.js"],
    prodEnv({ DEMO_ADMIN_EMAIL: "demo.smoke@example.com" }),
  );
  check("seed:prod accepts DEMO_ADMIN_EMAIL", demoRun === 0, `exit=${demoRun}`);
  const team3 = await json("/admin/team", { cookie });
  const demoAdmin = team3.body?.data?.admins?.find((a) => a.email === "demo.smoke@example.com");
  check("seed:prod deactivated the demo admin", demoAdmin?.isActive === false, `isActive=${demoAdmin?.isActive}`);

  // hubSlot / hubLabel survive the production seed.
  const services = await json("/services");
  check(
    "seeded services expose hubSlot and hubLabel",
    services.body.data.every((s) => "hubSlot" in s && "hubLabel" in s),
  );
  const featured = services.body.data.filter((s) => Number.isInteger(s.hubSlot));
  check(
    "5 hub services with unique slots 0..4 after prod seed",
    featured.length === 5 && new Set(featured.map((s) => s.hubSlot)).size === 5,
  );
}

console.log("[smoke] 11. logout");
{
  const out = await json("/auth/logout", { method: "POST", cookie });
  check("logout → 200", out.status === 200);
  const cleared = cookieFrom(out.response);
  check("logout clears cookie", cleared === "jazari_admin=" || (out.response.headers.getSetCookie?.() || []).some((c) => c.startsWith("jazari_admin=;")));
}

console.log(`\n[smoke] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const failure of failures) console.log(`  → ${failure}`);
  await cleanup(1);
}
await cleanup(0);
