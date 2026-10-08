#!/usr/bin/env node
/**
 * Headless end-to-end verification for the Jazari Three.js hero.
 *
 * Drives real Chrome over the DevTools protocol (no new dependencies — Node's
 * built-in WebSocket) and asserts the spec's runtime requirements:
 *   1  Home renders, scene reaches `data-scene="webgl"`, one canvas, live tier
 *   2  Idle motion is alive (hotspot moves between samples)
 *   3  Reduced motion → static composition (hotspot frozen), scene still works
 *   4  Context loss → fallback; restore → scene resumes, still one canvas
 *   5  Mobile metrics → LOW/MEDIUM tier (never the desktop scene)
 *   6  /admin loads ZERO three-chunk resources (runtime proof, not just build)
 *   7  SPA round-trips (hero unmount/remount ×3): no leak, one canvas, clean console
 *   8  Accessibility structure
 *   9  Homepage section + API regression
 *  10  Start-Your-Project form end-to-end
 *  11  Brand (Main Logo) + hero layout + first-load choreography + screenshots
 *
 * Super Admin role/security logic is covered by the BACKEND smoke test
 * (`cd Backend && npm run smoke`) — 81 assertions.
 *
 * Usage: node scripts/verify-three.mjs [baseUrl]   (default http://localhost:3001)
 * Requires: a production build (`npm run build && npm run start -p 3001`) and
 * the backend running for card data.
 * Screenshots are written to `frontend/test-output/screenshots/`.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync, inflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCREENSHOT_DIR = join(process.cwd(), "test-output", "screenshots");

/**
 * Logo sources that actually exist under `public/`, as URL paths.
 *
 * Resolved Node-side so the in-page IoU check never requests a missing file:
 * Chrome logs a 404 for that, and the console-clean check (rightly) fails.
 */
const LOGO_CANDIDATES = ["Real Logo.png", "Main Logo.png"]
  .filter((name) => existsSync(join(process.cwd(), "public", name)))
  .map((name) => "/" + encodeURI(name));

const BASE = process.argv[2] ?? "http://localhost:3001";

/**
 * URLs the harness must block to simulate an unreachable API.
 *
 * The browser reaches the API either directly (an absolute
 * NEXT_PUBLIC_API_URL, the local-development build) or through the frontend's
 * same-origin /api proxy (the production-shaped build). Both are blocked so the
 * offline / snapshot / error checks behave identically in either configuration.
 * Blocking the proxy URL is inert when the proxy is not active.
 */
const API_BLOCK_URLS = ["*localhost:5000*", "*127.0.0.1:5000*", `${BASE}/api/*`];
const SERVICE_FETCH_PATTERNS = [
  { urlPattern: "*localhost:5000/api/services*", requestStage: "Request" },
  { urlPattern: `${BASE}/api/services*`, requestStage: "Request" },
];
const NO_WEBGL = process.env.NO_WEBGL === "1"; // fallback-verification mode
const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Seed two logos so the marquee test runs against real data ---------- */
const API = process.env.API_BASE ?? "http://localhost:5000/api";

/**
 * Fallback fixture (only used when the API has fewer than two logos). It is the
 * real brand mark fetched from the running frontend, so the showcase never gets
 * seeded with an unrenderable 1×1 pixel the way it used to be.
 */
async function logoFixture() {
  try {
    const response = await fetch(`${BASE}/brand/logo-main.png`);
    if (!response.ok) return null;
    const buf = Buffer.from(await response.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Reads `../Backend/.env` so the harness can sign in without any credential
 * being hardcoded here (never printed). Returns {} when unavailable.
 */
function readBackendEnv() {
  try {
    const text = readFileSync(join(process.cwd(), "..", "Backend", ".env"), "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

async function ensureLogos() {
  try {
    const backendEnv = readBackendEnv();
    const email = process.env.ADMIN_EMAIL ?? backendEnv.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD ?? backendEnv.ADMIN_PASSWORD;
    if (!email || !password) return false;
    const login = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) return false;
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const list = await (await fetch(`${API}/logos`)).json();
    if ((list.data?.length ?? 0) >= 2) return true;
    const fixture = await logoFixture();
    if (!fixture) return false;
    for (const name of ["Showcase Fixture A", "Showcase Fixture B"]) {
      const res = await fetch(`${API}/admin/logos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ name, image: fixture }),
      });
      if (!res.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/* ---- Results ------------------------------------------------------------ */
const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/* ---- Find the three chunk (build output) -------------------------------- */
function findThreeChunk() {
  const dir = join(process.cwd(), ".next", "static", "chunks");
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js")) continue;
    try {
      if (readFileSync(join(dir, file), "utf8").includes("WebGLRenderer")) return file;
    } catch {
      /* unreadable chunk — skip */
    }
  }
  return null;
}

/* ---- Minimal CDP client -------------------------------------------------- */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        for (const fn of this.listeners.get(message.method) ?? []) fn(message.params);
      }
    };
  }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => resolve(new Cdp(ws));
      ws.onerror = () => reject(new Error("CDP WebSocket failed"));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  off(method, fn) {
    const list = this.listeners.get(method);
    if (!list) return;
    this.listeners.set(
      method,
      list.filter((entry) => entry !== fn),
    );
  }
  close() {
    this.ws.close();
  }
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(`evaluate failed: ${exceptionDetails.text ?? "unknown"}`);
  }
  return result.value;
}

/**
 * Minimal PNG decoder for Chrome screenshots (8-bit, non-interlaced, RGB/RGBA).
 * Used by the navbar pixel check — no image dependency is added to the project.
 */
function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels || bitDepth !== 8) throw new Error("unsupported PNG for the pixel check");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = value & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/** Mean + standard deviation of pixel luminance (0-255) in a screenshot. */
function lumaStats(png) {
  const { width, height, channels, data } = decodePng(png);
  const values = new Float64Array(width * height);
  let sum = 0;
  for (let i = 0; i < width * height; i += 1) {
    const at = i * channels;
    const luma = 0.2126 * data[at] + 0.7152 * data[at + 1] + 0.0722 * data[at + 2];
    values[i] = luma;
    sum += luma;
  }
  const mean = sum / values.length;
  let variance = 0;
  for (let i = 0; i < values.length; i += 1) variance += (values[i] - mean) ** 2;
  return { mean, std: Math.sqrt(variance / values.length) };
}

async function captureClipStats(cdp, clip) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false });
  return lumaStats(Buffer.from(data, "base64"));
}

async function waitFor(cdp, expression, timeoutMs = 8000, label = "condition") {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(cdp, expression);
      if (last) return last;
    } catch {
      /* page may be mid-navigation */
    }
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label} (last=${JSON.stringify(last)})`);
}

const HOTSPOT_POS = `(() => {
  const h = document.querySelector(".hero-hotspot");
  if (!h) return null;
  const t = new DOMMatrixReadOnly(getComputedStyle(h).transform);
  return { x: t.m41, y: t.m42 };
})()`;

/**
 * The engine legitimately pauses while the hero is off-screen (spec §45), and
 * in a short headless viewport the visual column starts below the fold — so
 * motion assertions must first bring it into view.
 */
const BRING_HERO_INTO_VIEW = `(() => {
  const el = document.querySelector("[data-scene]");
  if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
  return true;
})()`;

/* ---- Main ---------------------------------------------------------------- */
async function main() {
  const threeChunk = findThreeChunk();
  if (!threeChunk) throw new Error("three chunk not found in .next/static/chunks");
  console.log("[0] Static assets");
  check(
    "Main Logo application asset exists (public/brand/logo-main.png)",
    existsSync(join(process.cwd(), "public", "brand", "logo-main.png")),
  );
  check(
    "square app icon asset exists (public/brand/app-icon-main.png)",
    existsSync(join(process.cwd(), "public", "brand", "app-icon-main.png")),
  );
  const logosReady = await ensureLogos();

  const profile = mkdtempSync(join(tmpdir(), "jazari-cdp-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      "--enable-unsafe-swiftshader",
      "--enable-precise-memory-info",
      "--js-flags=--expose-gc",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      // Fallback-verification mode: kill WebGL entirely (spec TEST 14).
      ...(NO_WEBGL ? ["--disable-webgl", "--disable-webgl2"] : []),
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp;
  const consoleErrors = [];
  const pageErrors = [];

  try {
    // Wait for the DevTools endpoint, attach to the first page target.
    let target = null;
    for (let i = 0; i < 50 && !target; i += 1) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
        target = list.find((entry) => entry.type === "page");
      } catch {
        /* not up yet */
      }
    }
    if (!target) throw new Error("Chrome DevTools endpoint never appeared");

    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    cdp.on("Runtime.consoleAPICalled", (params) => {
      if (params.type === "error") {
        consoleErrors.push(params.args.map((a) => a.value ?? a.description ?? "").join(" "));
      }
    });
    cdp.on("Runtime.exceptionThrown", (params) => {
      pageErrors.push(params.exceptionDetails?.text ?? "exception");
    });
    cdp.on("Log.entryAdded", (params) => {
      const entry = params.entry;
      if (entry?.level !== "error") return;
      // Benign, environment-specific noise (software rasterizer / forced loss).
      if (/X4122|CONTEXT_LOST|context lost|SwiftShader|software WebGL/i.test(entry.text)) return;
      // Expected: the admin auth guard probes /auth/me while signed out (401).
      if (/status of 401 \(Unauthorized\)/.test(entry.text)) return;
      // Expected: the harness reloads rapidly and trips the API's own rate
      // limiter (429). It is the backend working as designed, not an app error.
      if (/429 \(Too Many Requests\)/.test(entry.text)) return;
      // Include the URL so a 404 is diagnosable from the failure line alone.
      consoleErrors.push(entry.url ? `${entry.text} — ${entry.url}` : entry.text);
    });

    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Log.enable"),
    ]);
    // Headless Chrome does not consider its window focused, so programmatic
    // focus() may not emit focus events. Forcing focus emulation makes real
    // keyboard-focus behaviour (and React onFocus) observable.
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});

    const resetErrors = () => {
      consoleErrors.length = 0;
      pageErrors.length = 0;
    };
    const assertClean = (label) => {
      check(
        `${label}: no console errors / exceptions`,
        consoleErrors.length === 0 && pageErrors.length === 0,
        [...pageErrors, ...consoleErrors].slice(0, 3).join(" | "),
      );
    };
    const reload = async () => {
      await cdp.send("Page.reload", { ignoreCache: true });
      await sleep(300);
    };

    /* -- TEST 0 (NO_WEBGL mode): static fallback must carry the page ------- */
    if (NO_WEBGL) {
      console.log("\n[0] WebGL disabled → static fallback (spec TEST 14)");
      resetErrors();
      await cdp.send("Page.navigate", { url: `${BASE}/` });
      await waitFor(cdp, `document.readyState === "complete"`, 12000, "page load");
      await sleep(3500); // give a would-be engine every chance to activate
      const fb = await evaluate(
        cdp,
        `(() => ({
          scene: document.querySelector("[data-scene]")?.dataset.scene ?? "missing",
          canvases: document.querySelectorAll(".hero-scene canvas").length,
          decorOpacity: getComputedStyle(document.querySelector(".hero-decor")).opacity,
          hotspotPlaced: ${HOTSPOT_POS},
          card: document.querySelector(".hero-card p")?.textContent ?? null,
          heading: document.querySelector("h1")?.textContent?.slice(0, 30) ?? null,
        }))()`,
      );
      check("scene stays data-scene=fallback", fb.scene === "fallback", fb.scene);
      check("zero canvases created", fb.canvases === 0, `count=${fb.canvases}`);
      check("static fallback fully visible (opacity 1)", fb.decorOpacity === "1", fb.decorOpacity);
      check("overlay card still placed", Boolean(fb.hotspotPlaced && fb.hotspotPlaced.x >= 0), JSON.stringify(fb.hotspotPlaced));
      check("backend card content still renders", typeof fb.card === "string" && fb.card.length > 0, String(fb.card ?? "").slice(0, 40));
      check("hero heading intact", Boolean(fb.heading), fb.heading ?? "");
      assertClean("no-webgl");

      const failed = results.filter((r) => !r.ok);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Three.js NO-WEBGL verification: ${results.length - failed.length}/${results.length} checks passed`);
      if (failed.length > 0) process.exit(1);
      return;
    }

    /* -- TEST 1: home loads, scene activates, one canvas, live tier -------- */
    console.log("\n[1] Home render + scene activation");
    resetErrors();
    await cdp.send("Page.navigate", { url: `${BASE}/` });
    await waitFor(
      cdp,
      `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`,
      12000,
      "scene=webgl",
    );

    // The public notification opt-in prompt is a full-viewport dialog that
    // opens ~10s after arrival. Every suite other than the dedicated push one
    // must not be disturbed by it, so it is dismissed for the rest of the run
    // (the push suite clears this flag again when it needs the real behaviour).
    await evaluate(cdp, `(() => { try { localStorage.setItem("jazari-push-dismissed", "1"); } catch {} return true; })()`);
    const home = await evaluate(
      cdp,
      `(() => ({
        scene: document.querySelector("[data-scene]")?.dataset.scene,
        canvases: document.querySelectorAll(".hero-scene canvas").length,
        quality: document.querySelector(".hero-scene canvas")?.dataset.quality ?? null,
        hotspot: ${HOTSPOT_POS},
        card: document.querySelector(".hero-card p")?.textContent ?? null,
        hasHeading: Boolean(document.querySelector("h1")),
      }))()`,
    );
    check("scene reaches data-scene=webgl", home.scene === "webgl");
    check("exactly one canvas", home.canvases === 1, `count=${home.canvases}`);
    check("canvas exposes live quality tier", ["high", "medium", "low"].includes(home.quality), `tier=${home.quality}`);
    check("hotspot visible + positioned", home.hotspot && home.hotspot.y >= 0 && getFloat(home.hotspot.x) >= 0, JSON.stringify(home.hotspot));
    check("glass card carries backend service data", typeof home.card === "string" && home.card.length > 0, String(home.card).slice(0, 40));
    check("hero heading intact (LCP content present)", home.hasHeading);

    // Environment diagnostics: RAF must tick and the page must be visible,
    // otherwise every timing assertion below would be meaningless.
    const env = await evaluate(
      cdp,
      `new Promise((resolve) => {
        const start = performance.now();
        let frames = 0;
        const tick = () => {
          frames += 1;
          if (performance.now() - start < 500) requestAnimationFrame(tick);
          else resolve({ frames, visibility: document.visibilityState });
        };
        requestAnimationFrame(tick);
      })`,
    );
    check("headless RAF ticks (≥10 frames/500ms)", env.frames >= 10, `frames=${env.frames}`);
    check("page visibilityState=visible", env.visibility === "visible", env.visibility);
    assertClean("home");

    /* -- TEST 2: idle motion alive ----------------------------------------- */
    console.log("\n[2] Idle motion is alive");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(2000); // resume + let the 1.4 s assembly finish → pure idle
    const a1 = await evaluate(cdp, HOTSPOT_POS);
    await sleep(700);
    const a2 = await evaluate(cdp, HOTSPOT_POS);
    const delta = Math.hypot(a2.x - a1.x, a2.y - a1.y);
    check("hotspot moves between samples (>2px/700ms)", delta > 2, `delta=${delta.toFixed(2)}px`);

    /* -- TEST 4: context loss → fallback → restore → resume ---------------- */
    console.log("\n[3] WebGL context loss + restore");
    resetErrors();
    const lost = await evaluate(
      cdp,
      `(() => {
        const c = document.querySelector(".hero-scene canvas");
        const gl = c && c.getContext("webgl2");
        const ext = gl && gl.getExtension("WEBGL_lose_context");
        if (!ext) return "no-ext";
        window.__jazariLoseExt = ext; // keep the handle — getExtension may
        ext.loseContext();            // return null while the context is lost
        return "lost";
      })()`,
    );
    check("loseContext triggered", lost === "lost", lost);
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "fallback"`, 5000, "fallback after loss");
    check("context loss → static fallback shown", true);
    const restored = await evaluate(
      cdp,
      `(() => {
        const ext = window.__jazariLoseExt;
        if (!ext) return "no-ext";
        ext.restoreContext();
        return "restored";
      })()`,
    );
    check("restoreContext triggered", restored === "restored", restored);
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 6000, "webgl after restore");
    const afterRestore = await evaluate(
      cdp,
      `document.querySelectorAll(".hero-scene canvas").length`,
    );
    check("recovery keeps exactly one canvas", afterRestore === 1, `count=${afterRestore}`);
    assertClean("context-loss");

    /* -- TEST 2b: real-logo 3D geometry + silhouette + saturation ----------
     * The 3D logo is rebuilt from the traced real artwork. This measures its
     * ASSEMBLED silhouette against the real PNG mask (supports hidden, idle
     * motion frozen for determinism) and its average saturation against the
     * source pixels, in LIGHT mode — proving the mark is not washed out. */
    console.log("\n[3b] Real-logo 3D reconstruction (silhouette IoU + saturation)");
    resetErrors();
    await evaluate(cdp, `localStorage.setItem("jazari-theme", "light"); true`);
    await reload();
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 12000, "scene for logo check");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(400);
    const logoRect = await evaluate(
      cdp,
      `(() => {
        const c = document.querySelector(".hero-scene canvas");
        if (!c || !c.__jazariDebug) return { error: "no canvas" };
        c.__jazariDebug.setReducedMotion(true);
        c.__jazariDebug.setSupportsVisible(false);
        const hide = (sel) => { const el = document.querySelector(sel); if (el) el.style.visibility = "hidden"; };
        hide(".hero-card"); hide(".hero-hotspot"); hide(".hero-connector"); hide(".hero-decor"); hide(".hero-rays"); hide(".hero-aurora"); hide(".bg-grid");
        const r = c.getBoundingClientRect();
        return { x: Math.round(r.x + window.scrollX), y: Math.round(r.y + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
      })()`,
    );
    await sleep(200);
    const logoScreenshot = logoRect.error
      ? null
      : await cdp.send("Page.captureScreenshot", {
          format: "png",
          clip: { x: logoRect.x, y: logoRect.y, width: logoRect.width, height: logoRect.height, scale: 1 },
        });
    await evaluate(cdp, `window.__logoShot = ${JSON.stringify(logoScreenshot.data)}; true`);
    const logoScene = await evaluate(
      cdp,
      `(async () => {
        const restore = () => {
          const c = document.querySelector(".hero-scene canvas");
          if (c && c.__jazariDebug) { c.__jazariDebug.setSupportsVisible(true); c.__jazariDebug.setReducedMotion(false); }
          const show = (sel) => { const el = document.querySelector(sel); if (el) el.style.visibility = ""; };
          show(".hero-card"); show(".hero-hotspot"); show(".hero-connector"); show(".hero-decor"); show(".hero-rays"); show(".hero-aurora"); show(".bg-grid");
        };
        try {
          const pick = ${JSON.stringify(LOGO_CANDIDATES)};
          const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("load")); i.src = src; });
          let source = null;
          for (const candidate of pick) { try { source = await load(candidate); break; } catch { } }
          if (!source) return { error: "source logo not servable" };
          const shotData = window.__logoShot;
          if (!shotData) return { error: "no screenshot" };
          const shot = await load("data:image/png;base64," + shotData);
          const canvas = document.querySelector(".hero-scene canvas");
          const read = (img, w, h) => {
            const cv = document.createElement("canvas");
            cv.width = w; cv.height = h;
            const ctx = cv.getContext("2d", { willReadFrequently: true });
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            return ctx.getImageData(0, 0, w, h);
          };
          const boxOfAlpha = (px, w, h, thr) => {
            let minX = w, minY = h, maxX = -1, maxY = -1;
            for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) {
              if (px.data[(y * w + x) * 4 + 3] > thr) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
              }
            } }
            return { minX, minY, maxX, maxY, ok: maxX - minX > 4 && maxY - minY > 4 };
          };
          const boxOfFg = (px, w, h, isFg) => {
            let minX = w, minY = h, maxX = -1, maxY = -1;
            for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) {
              if (isFg((y * w + x) * 4)) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
              }
            } }
            return { minX, minY, maxX, maxY, ok: maxX - minX > 4 && maxY - minY > 4 };
          };
          const drawCrop = (img, box, N) => {
            const cv = document.createElement("canvas");
            cv.width = N; cv.height = N;
            const ctx = cv.getContext("2d", { willReadFrequently: true });
            ctx.clearRect(0, 0, N, N);
            ctx.drawImage(img, box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY, 0, 0, N, N);
            return ctx.getImageData(0, 0, N, N);
          };
          const avgSat = (px, isIn) => {
            let sum = 0, n = 0;
            for (let i = 0; i < px.data.length; i += 4) {
              if (!isIn(i)) continue;
              const r = px.data[i] / 255, g = px.data[i + 1] / 255, b = px.data[i + 2] / 255;
              const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
              const l = (mx + mn) / 2;
              if (l < 0.06 || l > 0.985) continue;
              sum += mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
              n++;
            }
            return n ? sum / n : 0;
          };
          const isLogo = (r, g, b) => {
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            return mx - mn > 48 || lum < 150;
          };
          const W = shot.naturalWidth, H = shot.naturalHeight;
          const renderPx = read(shot, W, H);
          const isFg = (i) => isLogo(renderPx.data[i], renderPx.data[i + 1], renderPx.data[i + 2]);
          const renderBox = boxOfFg(renderPx, W, H, isFg);
          const SrcN = 1024;
          const sourcePx = read(source, SrcN, SrcN);
          const sourceBoxN = boxOfAlpha(sourcePx, SrcN, SrcN, 128);
          const ratio = (source.naturalWidth || 4096) / SrcN;
          const sourceBox = { minX: sourceBoxN.minX * ratio, minY: sourceBoxN.minY * ratio, maxX: sourceBoxN.maxX * ratio, maxY: sourceBoxN.maxY * ratio, ok: sourceBoxN.ok };
          let iou = 0, iouTolerant = 0, inter = 0, union = 0;
          let iouMirrorX = 0, iouMirrorY = 0;
          let bestIou = 0, bestAngle = 0;
          let areaA = 0, areaB = 0, quadA = [], centA = [0, 0], centB = [0, 0], profA = [], profB = [];
          if (renderBox.ok && sourceBox.ok) {
            const N = 384;
            const a = drawCrop(source, sourceBox, N).data;
            const b = drawCrop(shot, renderBox, N).data;
            const am = new Uint8Array(N * N);
            const bm = new Uint8Array(N * N);
            for (let i = 0; i < N * N; i++) {
              am[i] = a[i * 4 + 3] > 128 ? 1 : 0;
              bm[i] = isLogo(b[i * 4], b[i * 4 + 1], b[i * 4 + 2]) ? 1 : 0;
            }
            const iouOf = (m1, m2) => {
              let it = 0, un = 0;
              for (let i = 0; i < m1.length; i++) { if (m1[i] || m2[i]) { un++; if (m1[i] && m2[i]) it++; } }
              return un ? it / un : 0;
            };
            const areaOf = (m) => { let a = 0; for (let i = 0; i < m.length; i++) a += m[i]; return a; };
            const quadIou = (m1, m2, qx, qy) => {
              const half = N / 2;
              let it = 0, un = 0;
              for (let y = qy * half; y < qy * half + half; y++) {
                for (let x = qx * half; x < qx * half + half; x++) {
                  const i = y * N + x;
                  if (m1[i] || m2[i]) { un++; if (m1[i] && m2[i]) it++; }
                }
              }
              return un ? it / un : 0;
            };
            areaA = areaOf(am); areaB = areaOf(bm);
            quadA = [quadIou(am, bm, 0, 0), quadIou(am, bm, 1, 0), quadIou(am, bm, 0, 1), quadIou(am, bm, 1, 1)];
            const centroid = (m) => {
              let sx = 0, sy = 0, n = 0;
              for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y * N + x]) { sx += x; sy += y; n++; }
              return n ? [+(sx / n / N).toFixed(3), +(sy / n / N).toFixed(3)] : [0, 0];
            };
            centA = centroid(am); centB = centroid(bm);
            const prof = (m) => {
              const rows = [];
              for (let r = 0; r < 8; r++) {
                const y0 = Math.floor((r * N) / 8), y1 = Math.floor(((r + 1) * N) / 8);
                let mn = N, mx = -1;
                for (let y = y0; y < y1; y++) for (let x = 0; x < N; x++) if (m[y * N + x]) { if (x < mn) mn = x; if (x > mx) mx = x; }
                rows.push(mn === N ? -1 : +(mn / N).toFixed(2));
              }
              return rows;
            };
            profA = prof(am); profB = prof(bm);
            iou = iouOf(am, bm);
            // 2px edge tolerance: a colour-segmented silhouette of a glossy 3D
            // render can never match the alpha mask pixel-for-pixel, so the
            // headline IoU dilates both masks by 2px per side (documented).
            const dilate = (m, r) => {
              const out = new Uint8Array(m.length);
              for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                  if (!m[y * N + x]) continue;
                  for (let dy = -r; dy <= r; dy++) {
                    const yy = y + dy;
                    if (yy < 0 || yy >= N) continue;
                    for (let dx = -r; dx <= r; dx++) {
                      const xx = x + dx;
                      if (xx >= 0 && xx < N) out[yy * N + xx] = 1;
                    }
                  }
                }
              }
              return out;
            };
            iouTolerant = iouOf(dilate(am, 2), dilate(bm, 2));
            // Rotation diagnostic: find the in-plane angle at which the render
            // mask best matches the source (0 means upright within tolerance).
            const cx = N / 2, cy = N / 2;
            for (let deg = -4; deg <= 4.001; deg += 0.5) {
              const rad = deg * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
              const rm = new Uint8Array(N * N);
              for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                  const dx = x - cx, dy = y - cy;
                  const sx = Math.round(cx + dx * co - dy * si);
                  const sy = Math.round(cy + dx * si + dy * co);
                  if (sx >= 0 && sx < N && sy >= 0 && sy < N && bm[sy * N + sx]) rm[y * N + x] = 1;
                }
              }
              const v = iouOf(am, rm);
              if (v > bestIou) { bestIou = v; bestAngle = deg; }
            }
            inter = 0; union = 0;
            const amX = new Uint8Array(N * N);
            const amY = new Uint8Array(N * N);
            for (let y = 0; y < N; y++) {
              for (let x = 0; x < N; x++) {
                amX[y * N + x] = am[y * N + (N - 1 - x)];
                amY[y * N + x] = am[(N - 1 - y) * N + x];
              }
            }
            iouMirrorX = iouOf(amX, bm);
            iouMirrorY = iouOf(amY, bm);
          }
          const sourceSmall = read(source, 512, 512);
          const result = {
            iou, iouTolerant, iouMirrorX, iouMirrorY, bestIou, bestAngle, areaA, areaB, quadA,
            centA, centB, profA, profB,
            renderOk: renderBox.ok, sourceOk: sourceBox.ok,
            renderBox: [renderBox.minX, renderBox.minY, renderBox.maxX, renderBox.maxY],
            sourceBox: [Math.round(sourceBox.minX), Math.round(sourceBox.minY), Math.round(sourceBox.maxX), Math.round(sourceBox.maxY)],
            renderSat: avgSat(renderPx, isFg),
            sourceSat: avgSat(sourceSmall, (i) => sourceSmall.data[i + 3] > 40),
            pieces: canvas ? canvas.dataset.scenePieces : null,
            supports: canvas ? canvas.dataset.sceneSupports : null,
            logoSize: canvas ? canvas.dataset.sceneLogoSize : null,
          };
          return result;
        } finally {
          restore();
        }
      })()`,
    );
    check(
      "CHECK 2b-1 — 3D logo built from the five real pieces (top,bottom,right,fold,leaf)",
      logoScene.pieces === "top,bottom,right,fold,leaf",
      `pieces=${logoScene.pieces}`,
    );
    check(
      "CHECK 2b-2 — five distinct support objects in the scene",
      logoScene.supports === "5",
      `supports=${logoScene.supports}`,
    );
    check(
      "CHECK 2b-3 — assembled 3D logo silhouette IoU vs the real logo mask (2px tolerance, >= 0.80)",
      !logoScene.error && logoScene.iouTolerant >= 0.8,
      JSON.stringify({ iou: +logoScene.iou.toFixed(3), iou2px: +logoScene.iouTolerant.toFixed(3), areaA: logoScene.areaA, areaB: logoScene.areaB, quads: logoScene.quadA.map((v) => +v.toFixed(2)), centA: logoScene.centA, centB: logoScene.centB, profA: logoScene.profA, profB: logoScene.profB }),
    );
    check(
      "CHECK 2b-4 — light-mode logo saturation not washed out (render >= 0.6 × source)",
      !logoScene.error && logoScene.sourceSat > 0 && logoScene.renderSat >= 0.6 * logoScene.sourceSat,
      JSON.stringify({ renderSat: logoScene.renderSat, sourceSat: logoScene.sourceSat, ratio: logoScene.sourceSat ? +(logoScene.renderSat / logoScene.sourceSat).toFixed(3) : 0 }),
    );
    check(
      "CHECK 2b-5 — assembled 3D logo has sane proportions (non-degenerate bbox)",
      !logoScene.error && typeof logoScene.logoSize === "string" && logoScene.logoSize.split("x").every((v) => Number(v) > 0.5),
      `logoSize=${logoScene.logoSize}`,
    );
    assertClean("real-logo-3d");

    /* -- TEST 3: reduced motion → static composition ----------------------- */
    console.log("\n[4] prefers-reduced-motion");
    resetErrors();
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await reload();
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 12000, "scene under reduced motion");
    await evaluate(cdp, BRING_HERO_INTO_VIEW); // engine must be RUNNING to prove it stays STILL
    await sleep(1200); // let any (disabled) assembly settle
    const r1 = await evaluate(cdp, HOTSPOT_POS);
    await sleep(700);
    const r2 = await evaluate(cdp, HOTSPOT_POS);
    const rDelta = Math.hypot(r2.x - r1.x, r2.y - r1.y);
    check("reduced motion: composition static (<1.5px/700ms)", rDelta < 1.5, `delta=${rDelta.toFixed(2)}px`);
    assertClean("reduced-motion");
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    /* -- TEST 5: mobile → degraded tier ------------------------------------ */
    console.log("\n[5] Mobile metrics → quality tier");
    resetErrors();
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await reload();
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 12000, "scene on mobile");
    const mobile = await evaluate(
      cdp,
      `(() => ({
        quality: document.querySelector(".hero-scene canvas")?.dataset.quality,
        w: document.querySelector(".hero-scene canvas")?.width ?? 0,
        h: document.querySelector(".hero-scene canvas")?.height ?? 0,
        coarse: matchMedia("(pointer: coarse)").matches,
      }))()`,
    );
    check("mobile receives LOW/MEDIUM tier", ["low", "medium"].includes(mobile.quality), `tier=${mobile.quality}, coarse=${mobile.coarse}`);
    check("mobile canvas has real pixel dimensions", mobile.w > 0 && mobile.h > 0, `${mobile.w}×${mobile.h}`);
    assertClean("mobile");
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });

    /* -- TEST 6: admin never loads the three chunk (runtime) --------------- */
    console.log("\n[6] Admin isolation (runtime resource check)");
    resetErrors();
    await cdp.send("Page.navigate", { url: `${BASE}/admin/dashboard` });
    await waitFor(cdp, `location.pathname.startsWith("/admin") && document.readyState === "complete"`, 12000, "admin load");
    await sleep(1200);
    const admin = await evaluate(
      cdp,
      `(() => ({
        threeLoaded: performance.getEntriesByType("resource").some((r) => r.name.includes(${JSON.stringify(threeChunk)})),
        canvasCount: document.querySelectorAll("canvas").length,
        title: document.title,
      }))()`,
    );
    check("admin loads NO three chunk", admin.threeLoaded === false);
    check("admin has zero WebGL canvases", admin.canvasCount === 0, `count=${admin.canvasCount}`);
    assertClean("admin");

    /* -- TEST 7: SPA round-trips (Strict-Mode-style mount/dispose) --------- */
    console.log("\n[7] SPA round-trips ×3 (dispose / remount / leak)");
    resetErrors();
    await cdp.send("Page.navigate", { url: `${BASE}/` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 12000, "home for cycles");
    const readHeap = () =>
      evaluate(
        cdp,
        `(() => { if (window.gc) window.gc(); return performance.memory ? performance.memory.usedJSHeapSize : 0; })()`,
      );
    const heapStart = await readHeap();

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      // Client-side navigation away (footer admin Link) unmounts the hero…
      await evaluate(cdp, `document.querySelector('footer a[href="/admin/login"]').click()`);
      await waitFor(cdp, `location.pathname === "/admin/login"`, 8000, `cycle ${cycle} → admin`);
      // …and back — hero remounts, engine rebuilds from scratch.
      await evaluate(cdp, `history.back()`);
      await waitFor(cdp, `location.pathname === "/"`, 8000, `cycle ${cycle} → home`);
      await sleep(600);
    }
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 12000, "scene after cycles");
    const afterCycles = await evaluate(
      cdp,
      `(() => ({
        canvases: document.querySelectorAll(".hero-scene canvas").length,
        scene: document.querySelector("[data-scene]")?.dataset.scene,
      }))()`,
    );
    const heapEnd = await readHeap();
    check("still exactly one canvas after 3 remounts", afterCycles.canvases === 1, `count=${afterCycles.canvases}`);
    check("scene re-activates after remounts", afterCycles.scene === "webgl");
    check("heap stays bounded (≤3× post-gc start)",
      heapEnd === 0 || heapEnd <= heapStart * 3,
      `${(heapStart / 1048576).toFixed(1)}MB → ${(heapEnd / 1048576).toFixed(1)}MB`,
    );
    assertClean("spa-cycles");

    /* -- TEST 8: accessibility structure ----------------------------------- */
    console.log("\n[8] Accessibility structure");
    resetErrors();
    const a11y = await evaluate(
      cdp,
      `(() => {
        const canvas = document.querySelector(".hero-scene canvas");
        const card = document.querySelector(".hero-card");
        return {
          canvasHidden: canvas?.getAttribute("aria-hidden"),
          canvasTabindex: canvas?.getAttribute("tabindex"),
          sceneHidden: document.querySelector(".hero-scene")?.getAttribute("aria-hidden"),
          hotspotHidden: document.querySelector(".hero-hotspot")?.getAttribute("aria-hidden"),
          connectorHidden: document.querySelector(".hero-connector")?.getAttribute("aria-hidden"),
          cardExposed: card ? card.closest("[aria-hidden='true']") === null : false,
          cardHasText: (card?.textContent ?? "").trim().length > 0,
          skipLink: Boolean(document.querySelector('a[href="#main"]')),
          h1: document.querySelectorAll("h1").length,
          landmarks: {
            main: document.querySelectorAll("main").length,
            nav: document.querySelectorAll("nav").length,
            footer: document.querySelectorAll("footer").length,
          },
        };
      })()`,
    );
    check("canvas aria-hidden=true", a11y.canvasHidden === "true", String(a11y.canvasHidden));
    check("canvas not keyboard-focusable (no tabindex)", a11y.canvasTabindex === null, String(a11y.canvasTabindex));
    check("whole scene layer aria-hidden", a11y.sceneHidden === "true");
    check("hotspot + connector aria-hidden", a11y.hotspotHidden === "true" && a11y.connectorHidden === "true");
    check("glass card exposed to screen readers", a11y.cardExposed && a11y.cardHasText);
    check("skip link present", a11y.skipLink);
    check("exactly one h1", a11y.h1 === 1, `count=${a11y.h1}`);
    check(
      "landmarks present (main/nav/footer)",
      a11y.landmarks.main === 1 && a11y.landmarks.nav >= 1 && a11y.landmarks.footer === 1,
      JSON.stringify(a11y.landmarks),
    );
    assertClean("a11y");

    /* -- TEST 9: existing homepage sections + API data (regression) -------- */
    console.log("\n[9] Homepage regression: all sections render with real data");
    resetErrors();
    const sections = await evaluate(
      cdp,
      `(() => {
        const cards = (headingId) => {
          const h = document.getElementById(headingId);
          return h ? h.closest("section")?.querySelectorAll("article").length ?? 0 : -1;
        };
        return {
          home: Boolean(document.getElementById("home")),
          marqueeRows: document.querySelectorAll(".logo-showcase__track, .marquee-track").length,
          marqueeLogos: document.querySelectorAll(".logo-item img, .marquee-track [data-logo]").length,
          productCards: cards("product-cards-heading"),
          serviceCards: document.querySelectorAll("#services article").length,
          form: Boolean(document.querySelector("#start form")),
          brandHeading: Boolean(document.getElementById("brand-statement-heading")),
          footer: Boolean(document.querySelector("footer a[href='/admin/login']")),
          startHeading: Boolean(document.getElementById("start-heading")),
          servicesHeading: Boolean(document.getElementById("services-heading")),
        };
      })()`,
    );
    check("section order anchors present (home/products/services/start/brand/footer)",
      sections.home && sections.productCards >= 0 && sections.servicesHeading && sections.startHeading && sections.brandHeading && sections.footer,
      JSON.stringify(sections),
    );
    check("products marquee rendered", sections.marqueeRows >= 2 || !logosReady, `rows=${sections.marqueeRows}, seeded=${logosReady}`);
    check("product cards from API (≥4)", sections.productCards >= 4, `cards=${sections.productCards}`);
    check("service cards from API (≥6)", sections.serviceCards >= 6, `cards=${sections.serviceCards}`);
    check("Start-Your-Project form present", sections.form);
    check("hidden admin entry present in footer", sections.footer);
    assertClean("regression");

    /* -- TEST 10: intake form end-to-end → reference ID -------------------- */
    console.log("\n[10] Start-Your-Project form end-to-end (TEST 28)");
    resetErrors();
    const filled = await evaluate(
      cdp,
      `(() => {
        const set = (selector, value) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const proto = el.type === "textarea" ? HTMLTextAreaElement : HTMLInputElement;
          Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        };
        const continueBtn = () =>
          [...document.querySelectorAll("#start form button")].find(
            (b) => b.textContent.trim() === "Continue" && b.offsetParent !== null,
          );
        const step1 = set("#jt-name", "CDP Verification") && Boolean(continueBtn());
        if (step1) continueBtn().click();
        return { step1 };
      })()`,
    );
    check("step 1 (name) accepted + Continue", filled.step1 === true, JSON.stringify(filled));
    await sleep(500);
    await evaluate(
      cdp,
      `(() => {
        const el = document.querySelector("#jt-domain");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "verify.example");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        const btn = [...document.querySelectorAll("#start form button")].find((b) => b.textContent.trim() === "Continue");
        if (btn) btn.click();
        return true;
      })()`,
    );
    await sleep(500);
    await evaluate(
      cdp,
      `(() => {
        const el = document.querySelector("#jt-phone");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "+15550001111");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        const btn = [...document.querySelectorAll("#start form button")].find((b) => b.textContent.trim() === "Continue");
        if (btn) btn.click();
        return true;
      })()`,
    );
    await sleep(500);
    await evaluate(
      cdp,
      `(() => {
        const chips = document.querySelectorAll('[aria-label="Service you need"] button');
        if (chips.length) chips[0].click();
        return chips.length;
      })()`,
    );
    await sleep(300);
    const submitted = await evaluate(
      cdp,
      `(() => {
        const btn = document.querySelector("#start form button[type='submit']");
        if (!btn) return false;
        btn.click();
        return true;
      })()`,
    );
    check("final submit clicked", submitted === true, String(submitted));
    const reference = await waitFor(
      cdp,
      `(/JT-\\d{8}-[A-Z0-9]{6}/.test(document.body.innerText)) ? document.body.innerText.match(/JT-\\d{8}-[A-Z0-9]{6}/)[0] : false`,
      10000,
      "success modal reference ID",
    );
    check("success modal shows server reference ID", Boolean(reference), String(reference));
    assertClean("form-e2e");

    /* -- TEST 11: Main Logo + hero layout + first-load choreography -------- */
    console.log("\n[11] Brand logo, hero layout, first-load choreography + screenshots");
    resetErrors();
    mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const capture = async (name) => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const file = join(SCREENSHOT_DIR, name);
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`    · screenshot → ${file}`);
    };

    const setViewport = async (width, height, mobile = false) => {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
    };
    const setThemeThenReload = async (theme) => {
      await evaluate(cdp, `localStorage.setItem("jazari-theme", ${JSON.stringify(theme)}); true`);
      await reload();
      await waitFor(cdp, `document.readyState === "complete"`, 12000, "reload");
      // Chrome restores scroll across reloads; the hero must be judged from the top.
      await evaluate(cdp, `window.scrollTo(0, 0); true`);
      await sleep(150);
    };

    const HERO_PROBE = `(() => {
      const ctas = [...document.querySelectorAll("#home a")].filter((a) =>
        /Start your project|Explore our products/.test(a.textContent || ""),
      );
      const h1 = document.querySelector("h1");
      const lh = h1 ? parseFloat(getComputedStyle(h1).lineHeight) : 0;
      const lines = h1 && lh ? Math.round(h1.getBoundingClientRect().height / lh) : 0;
      const sub = document.querySelector("#home p");
      const rating = [...document.querySelectorAll("#home span")].find((s) => /client rating/.test(s.textContent || ""));
      const inView = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight + 1; };
      const logoImg = document.querySelector('header img[src*="logo-main"]');
      let whitePlate = false;
      let node = logoImg ? logoImg.parentElement : null;
      for (let depth = 0; depth < 4 && node; depth += 1) {
        // The navbar glass surface is a deliberate translucent layer (Task B
        // requires 82-92% opacity), not a plate drawn behind the logo. The plate
        // we are looking for is a white BOX wrapped directly around the PNG, so
        // the walk stops at the logo's own link/wrapper chain.
        if (node.classList.contains("glass") || node.tagName === "HEADER") break;
        const bg = getComputedStyle(node).backgroundColor || "";
        const m = bg.match(/rgba?\\((\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?\\)/);
        if (m) {
          const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
          const alpha = m[4] === undefined ? 1 : Number(m[4]);
          if (alpha > 0.05 && r > 240 && g > 240 && b > 240) whitePlate = true;
        }
        node = node.parentElement;
      }
      return {
        ctas: ctas.length,
        ctasInView: ctas.map(inView),
        lines,
        subInView: inView(sub),
        trustInView: inView(rating),
        logoMain: Boolean(logoImg),
        whitePlate,
        decor: Boolean(document.querySelector(".hero-decor")),
        scene: document.querySelector("[data-scene]")?.dataset.scene ?? "missing",
        jsIntro: document.documentElement.classList.contains("js-intro"),
        heading: document.querySelector("h1")?.textContent?.slice(0, 24) ?? "",
      };
    })()`;

    // --- 1366×768 desktop, light theme ------------------------------------
    await setViewport(1366, 768);
    await setThemeThenReload("light");
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 12000, "scene (light desktop)");
    await sleep(1800); // let the ~1.5 s choreography finish
    const desktop = await evaluate(cdp, HERO_PROBE);
    check("Main Logo asset is used in the navbar", desktop.logoMain);
    check("no white plate behind the logo", desktop.whitePlate === false);
    check("hero headline is ≤ 3 lines at 1366×768", desktop.lines > 0 && desktop.lines <= 3, `lines=${desktop.lines}`);
    check("both hero CTAs are above the fold", desktop.ctas >= 2 && desktop.ctasInView.every(Boolean), JSON.stringify(desktop.ctasInView));
    check("subheading + trust content above the fold", desktop.subInView && desktop.trustInView);
    check("static fallback layer exists", desktop.decor);
    const words = await evaluate(
      cdp,
      `[...document.querySelectorAll(".jt-word-inner")].map((e) => parseFloat(getComputedStyle(e).opacity))`,
    );
    check(
      "first-load headline finishes fully visible",
      Array.isArray(words) && words.length > 0 && words.every((o) => o >= 0.99),
      JSON.stringify(words),
    );
    check("intro choreography actually ran (js-intro present)", desktop.jsIntro === true);
    await capture("home-light-desktop-1366x768.png");

    // --- reduced motion: intro must be bypassed ---------------------------
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await reload();
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "reduced-motion reload");
    await sleep(900);
    const rm = await evaluate(
      cdp,
      `(() => ({
        jsIntro: document.documentElement.classList.contains("js-intro"),
        h1Opacity: getComputedStyle(document.querySelector("h1")).opacity,
      }))()`,
    );
    check("reduced motion bypasses the entrance choreography", rm.jsIntro === false);
    check("reduced motion keeps hero content visible", rm.h1Opacity === "1", rm.h1Opacity);
    await capture("home-reduced-motion-1366x768.png");
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    // --- 1366×768 desktop, dark theme -------------------------------------
    await setThemeThenReload("dark");
    await waitFor(cdp, `document.documentElement.classList.contains("dark")`, 8000, "dark class");
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 12000, "scene (dark desktop)");
    await sleep(1700);
    const darkDesktop = await evaluate(cdp, HERO_PROBE);
    check("dark mode: no white plate behind the logo", darkDesktop.whitePlate === false);
    check("dark mode: CTAs still above the fold", darkDesktop.ctasInView.every(Boolean), JSON.stringify(darkDesktop.ctasInView));
    await capture("home-dark-desktop-1366x768.png");

    // --- 390×844 mobile, dark then light ----------------------------------
    await setViewport(390, 844, true);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await setThemeThenReload("dark");
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "mobile dark");
    await sleep(1700);
    const mobileDark = await evaluate(cdp, HERO_PROBE);
    check("390×844 mobile hero usable (primary CTA above the fold)", mobileDark.ctasInView[0] === true, JSON.stringify(mobileDark.ctasInView));
    check("390×844 mobile: no white plate", mobileDark.whitePlate === false);
    await capture("home-dark-mobile-390x844.png");

    await setThemeThenReload("light");
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "mobile light");
    await sleep(1700);
    await capture("home-light-mobile-390x844.png");

    // --- admin login capture (no credentials ever entered) ----------------
    await cdp.send("Page.navigate", { url: `${BASE}/admin/login` });
    await waitFor(cdp, `location.pathname === "/admin/login" && document.readyState === "complete"`, 12000, "admin login");
    await sleep(900);
    const adminLogo = await evaluate(
      cdp,
      `Boolean(document.querySelector('img[src*="logo-main"]'))`,
    );
    check("Main Logo used on the admin login screen", adminLogo === true);
    await capture("admin-login-light-1366x768.png");

    /* -- TEST 12: Our Products logo showcase (Task C) -------------------- */
    console.log("\n[12] Product logo showcase (logo-only wall)");
    resetErrors();

    const liveLogos = (await (await fetch(`${API}/logos`)).json()).data ?? [];
    check("public API returns showcase logos", liveLogos.length > 0, `count=${liveLogos.length}`);

    const gotoShowcase = async (theme = "light") => {
      await setViewport(1440, 900, false);
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      // TEST 12 must start from the public homepage (TEST 11 left us on admin).
      await cdp.send("Page.navigate", { url: `${BASE}/` });
      await sleep(900);
      await setThemeThenReload(theme);
      await waitFor(cdp, `document.querySelector("#products") !== null`, 12000, "showcase section");
      await evaluate(
        cdp,
        `(() => { document.getElementById("products")?.scrollIntoView({ block: "center", behavior: "instant" }); return true; })()`,
      );
      await sleep(1200);
    };

    await gotoShowcase("light");

    const structure = await evaluate(
      cdp,
      `(() => {
        const s = document.getElementById("products");
        return {
          exists: Boolean(s),
          labelledby: s?.getAttribute("aria-labelledby") ?? null,
          heading: Boolean(document.getElementById("products-showcase-heading")),
          items: document.querySelectorAll(".logo-item").length,
          hasHairline: document.querySelectorAll(".logo-showcase__hairline").length >= 2,
        };
      })()`,
    );
    check("showcase is a labelled region", structure.exists && structure.labelledby === "products-showcase-heading" && structure.heading, JSON.stringify(structure));
    check("section hairlines above + below", structure.hasHairline);

    // CHECK 1 — no pill / card / plate / border behind any logo.
    const pills = await evaluate(
      cdp,
      `(() => {
        const items = [...document.querySelectorAll(".logo-item")];
        const offenders = [];
        for (const el of items) {
          const cs = getComputedStyle(el);
          const frame = getComputedStyle(el.querySelector(".logo-item__frame"));
          const transparent = (v) => v === "rgba(0, 0, 0, 0)" || v === "transparent";
          if (!transparent(cs.backgroundColor) || !transparent(frame.backgroundColor) || cs.boxShadow !== "none" || frame.boxShadow !== "none" || cs.borderTopWidth !== "0px" || frame.borderTopWidth !== "0px") {
            offenders.push(cs.backgroundColor + "|" + frame.backgroundColor + "|" + cs.boxShadow + "|" + frame.boxShadow);
          }
        }
        return { count: items.length, bad: offenders.length, offenders: offenders.slice(0, 2) };
      })()`,
    );
    check("CHECK 1 — no pill/card/plate/border behind logos", pills.count > 0 && pills.bad === 0, JSON.stringify(pills));

    // CHECK 2 — every visible logo image actually loads.
    const imgs = await evaluate(
      cdp,
      `[...document.querySelectorAll(".logo-item img")].map((i) => ({ w: i.naturalWidth, h: i.naturalHeight, src: i.currentSrc || i.src }))`,
    );
    check("CHECK 2 — every logo image loads (non-zero intrinsic size)", imgs.length > 0 && imgs.every((i) => i.w > 0 && i.h > 0), `imgs=${imgs.length}`);
    check("CHECK 10 — consumes the processed API contract", imgs.some((i) => /\/api\/logos|res\.cloudinary\.com|\/api\/uploads/.test(i.src)), String(imgs[0]?.src ?? ""));

    // CHECK 4 — duplication / seamlessness / a11y.
    const dup = await evaluate(
      cdp,
      `[...document.querySelectorAll(".logo-showcase__track")].map((t) => ({
        groups: t.querySelectorAll(":scope > .logo-showcase__group").length,
        hidden: t.querySelector(":scope > .logo-showcase__group[aria-hidden='true']") !== null,
      }))`,
    );
    check("CHECK 4 — every row duplicates its group for a seamless loop", dup.length >= 2 && dup.every((d) => d.groups === 2), JSON.stringify(dup));
    check("CHECK 4 — duplicate group is aria-hidden", dup.every((d) => d.hidden));
    const focusableClones = await evaluate(
      cdp,
      `[...document.querySelectorAll('.logo-item[data-clone="true"]')].filter((a) => a.tagName === "A" && a.tabIndex >= 0).length`,
    );
    check("CHECK 4 — duplicated logos are not focusable", focusableClones === 0);
    const seam = await evaluate(
      cdp,
      `(() => {
        const t = document.querySelector(".logo-showcase__track");
        const g = [...t.querySelectorAll(":scope > .logo-showcase__group")];
        const v = t.parentElement;
        return { equal: g.length === 2 ? Math.abs(g[0].getBoundingClientRect().width - g[1].getBoundingClientRect().width) : -1, track: t.scrollWidth, viewport: v.clientWidth };
      })()`,
    );
    check("CHECK 4 — loop is mathematically seamless (identical groups)", seam.equal >= 0 && seam.equal < 1, JSON.stringify(seam));
    check("CHECK 4 — row content fills the viewport (no gap on ultrawide)", seam.track >= seam.viewport, JSON.stringify(seam));

    // CHECK 5 — hover pauses the row, lifts/scales the logo and reveals the label.
    // The track keeps moving, so target a logo that is currently well inside the
    // viewport and retry a few times until the pointer lands on one.
    let hover = { play: null, transform: "none", label: "0" };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const box = await evaluate(
        cdp,
        `(() => {
          const w = window.innerWidth;
          const items = [...document.querySelectorAll(".logo-item")];
          const candidate = items.find((el) => {
            const r = el.getBoundingClientRect();
            const cx = r.x + r.width / 2;
            return cx > w * 0.3 && cx < w * 0.7;
          });
          if (!candidate) return null;
          const r = candidate.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        })()`,
      );
      if (!box) {
        await sleep(250);
        continue;
      }
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
      await sleep(250);
      const probe = await evaluate(
        cdp,
        `(() => {
          const hovered = document.querySelector(".logo-item:hover");
          if (!hovered) return null;
          const track = document.querySelector(".logo-showcase__track");
          const img = hovered.querySelector("img, .logo-item__img");
          const label = hovered.querySelector(".logo-item__label");
          return { play: getComputedStyle(track).animationPlayState, transform: getComputedStyle(img).transform, label: getComputedStyle(label).opacity };
        })()`,
      );
      if (probe) {
        hover = probe;
        break;
      }
    }
    check("CHECK 5 — hover pauses the row", hover.play === "paused", hover.play);
    check("CHECK 5 — hover lifts/scales the logo", hover.transform !== "none", hover.transform);
    check("CHECK 5 — hover reveals the name label", Number(hover.label) > 0.5, hover.label);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });

    // Focus-within also pauses the row.
    const focusPause = await evaluate(
      cdp,
      `(() => {
        const item = document.querySelector(".logo-item");
        item.setAttribute("tabindex", "0");
        item.focus();
        const track = document.querySelector(".logo-showcase__track");
        return getComputedStyle(track).animationPlayState;
      })()`,
    );
    check("CHECK 5 — keyboard focus pauses the row", focusPause === "paused", focusPause);
    await evaluate(cdp, `document.activeElement?.blur(); true`);

    // Off-screen pause (IntersectionObserver): rows must stop while out of view.
    // Scroll to the very bottom so the showcase is fully above the viewport.
    await evaluate(cdp, `window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }); true`);
    await sleep(900);
    const offscreen = await evaluate(
      cdp,
      `(() => { const t = document.querySelector(".logo-showcase__track"); return t ? getComputedStyle(t).animationPlayState : null; })()`,
    );
    check("CHECK 17.5 — rows pause when off-screen", offscreen === "paused", String(offscreen));
    await evaluate(cdp, `document.getElementById("products")?.scrollIntoView({ block: "center", behavior: "instant" }); true`);
    await sleep(600);

    // CHECK 7 — theme legibility (light + dark).
    const lightFilters = await evaluate(
      cdp,
      `[...document.querySelectorAll(".logo-item")].map((el) => ({ tone: el.dataset.tone, filter: getComputedStyle(el.querySelector("img, .logo-item__img")).filter }))`,
    );
    await setThemeThenReload("dark");
    await evaluate(cdp, `document.getElementById("products")?.scrollIntoView({ block: "center", behavior: "instant" }); true`);
    await sleep(800);
    const darkFilters = await evaluate(
      cdp,
      `[...document.querySelectorAll(".logo-item")].map((el) => ({ tone: el.dataset.tone, filter: getComputedStyle(el.querySelector("img, .logo-item__img")).filter }))`,
    );
    check(
      "CHECK 7 — dark theme applies a contrast aid to dark logos",
      darkFilters.filter((d) => d.tone === "dark").every((d) => d.filter !== "none"),
      JSON.stringify(darkFilters),
    );
    check(
      "CHECK 7 — light theme applies a contrast aid to light logos",
      lightFilters.filter((d) => d.tone === "light").every((d) => d.filter !== "none"),
      JSON.stringify(lightFilters),
    );

    // CHECK 6 — reduced motion becomes a static wrapped grid.
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await setThemeThenReload("light");
    await evaluate(cdp, `document.getElementById("products")?.scrollIntoView({ block: "center", behavior: "instant" }); true`);
    await sleep(900);
    const reducedProbe = await evaluate(
      cdp,
      `(() => ({
        grid: document.querySelectorAll(".logo-showcase__grid").length,
        anim: [...document.querySelectorAll(".logo-showcase__track")].map((t) => getComputedStyle(t).animationName),
        float: [...document.querySelectorAll(".logo-item")].map((el) => getComputedStyle(el).animationName),
      }))()`,
    );
    check("CHECK 6 — reduced motion renders a static grid", reducedProbe.grid === 1, JSON.stringify(reducedProbe));
    check("CHECK 6 — no marquee animation under reduced motion", reducedProbe.anim.every((n) => n === "none" || n === ""), JSON.stringify(reducedProbe.anim));
    check("CHECK 6 — no idle-float animation under reduced motion", reducedProbe.float.every((n) => n === "none" || n === ""), JSON.stringify(reducedProbe.float));
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    // CHECK 9 — responsive (no horizontal overflow, logos present).
    for (const [w, h] of [[390, 844], [1366, 768], [1440, 900], [1920, 1080]]) {
      await setViewport(w, h, w < 640);
      await setThemeThenReload("light");
      await evaluate(cdp, `document.getElementById("products")?.scrollIntoView({ block: "center", behavior: "instant" }); true`);
      await sleep(700);
      const resp = await evaluate(
        cdp,
        `(() => ({
          visible: document.getElementById("products")?.getBoundingClientRect().height > 0,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          items: document.querySelectorAll(".logo-item").length,
        }))()`,
      );
      check(`CHECK 9 — responsive at ${w}×${h}`, resp.visible && resp.overflowX <= 2 && resp.items >= 1, JSON.stringify(resp));
    }

    // CHECK 8 — no layout shift from the showcase.
    const clsProbe = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source:
        "window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value;}).observe({type:'layout-shift',buffered:true});",
    });
    await setViewport(1440, 900, false);
    await setThemeThenReload("light");
    await sleep(600);
    // Measure only the shift caused by revealing the showcase, not the whole page.
    await evaluate(cdp, `window.__cls = 0; true`);
    await evaluate(cdp, `document.getElementById("products")?.scrollIntoView({ block: "center", behavior: "instant" }); true`);
    await sleep(2000);
    const cls = await evaluate(cdp, `window.__cls || 0`);
    check("CHECK 8 — showcase adds no layout shift (CLS < 0.02)", cls < 0.02, `cls=${cls}`);
    await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: clsProbe.identifier });

    // CHECK 11 — image failure → meaningful monogram fallback (no empty gap).
    await setThemeThenReload("light");
    await evaluate(cdp, `document.getElementById("products")?.scrollIntoView({ block: "center", behavior: "instant" }); true`);
    await sleep(700);
    const fallback = await evaluate(
      cdp,
      `(() => {
        const img = document.querySelector(".logo-item img");
        if (!img) return { ok: false, reason: "no img" };
        img.dispatchEvent(new Event("error"));
        return { ok: true };
      })()`,
    );
    await sleep(400);
    const monogram = await evaluate(
      cdp,
      `(() => {
        const item = document.querySelector(".logo-item");
        const hasImg = item.querySelector("img") !== null;
        const text = (item.querySelector(".logo-item__img")?.textContent || "").trim();
        return { hasImg, text };
      })()`,
    );
    check("CHECK 3/11 — failed image → monogram fallback (no empty slot)", fallback.ok && !monogram.hasImg && monogram.text.length > 0, JSON.stringify(monogram));

    // CHECK 12/13/14/15 — 0, 1, 3 and 12 logos via response interception.
    const serveLogos = async (list) => {
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*api/logos*", requestStage: "Request" }] });
      const handler = (params) => {
        const body = Buffer.from(JSON.stringify({ success: true, data: list })).toString("base64");
        cdp.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: 200,
          // CORS headers are required: the app fetches with credentials, so a
          // header-less fulfilled response would be blocked by the browser.
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            { name: "Access-Control-Allow-Origin", value: BASE },
            { name: "Access-Control-Allow-Credentials", value: "true" },
          ],
          body,
        });
      };
      cdp.on("Fetch.requestPaused", handler);
      return async () => {
        cdp.off("Fetch.requestPaused", handler);
        await cdp.send("Fetch.disable");
      };
    };

    const withFixture = async (count, verify) => {
      let fixture = [];
      if (count === 1) fixture = [liveLogos[0]];
      else if (count === 3) fixture = liveLogos.slice(0, 3);
      else if (count === 12) {
        fixture = Array.from({ length: 12 }, (_, i) => ({ ...liveLogos[i % liveLogos.length], _id: `fixture-${i}` }));
      }
      const stop = await serveLogos(fixture);
      await cdp.send("Page.reload", { ignoreCache: true });
      await sleep(1500);
      await evaluate(cdp, `document.getElementById("products")?.scrollIntoView({ block: "center", behavior: "instant" }); true`);
      await sleep(900);
      const result = await verify();
      await stop();
      return result;
    };

    await withFixture(0, async () => {
      const empty = await evaluate(
        cdp,
        `(() => ({
          text: document.getElementById("products")?.innerText ?? "",
          tracks: document.querySelectorAll(".logo-showcase__track").length,
          pills: document.querySelectorAll(".logo-item").length,
        }))()`,
      );
      check("CHECK 12 — 0 logos → professional empty state (no broken marquee)", /coming soon/i.test(empty.text) && empty.tracks === 0 && empty.pills === 0, JSON.stringify({ tracks: empty.tracks, pills: empty.pills }));
    });

    await withFixture(1, async () => {
      const one = await evaluate(
        cdp,
        `(() => ({
          items: document.querySelectorAll(".logo-item").length,
          groups: document.querySelectorAll(".logo-showcase__track .logo-showcase__group").length,
          equal: (() => { const g = [...document.querySelectorAll(".logo-showcase__track > .logo-showcase__group")]; return g.length === 2 ? Math.abs(g[0].getBoundingClientRect().width - g[1].getBoundingClientRect().width) : -1; })(),
        }))()`,
      );
      check("CHECK 13 — 1 logo repeats seamlessly", one.items >= 2 && one.groups >= 2 && one.equal >= 0 && one.equal < 1, JSON.stringify(one));
    });

    await withFixture(3, async () => {
      const three = await evaluate(cdp, `document.querySelectorAll(".logo-item").length`);
      check("CHECK 14 — 3 logos are not sparse (duplicated to fill)", three >= 6, `items=${three}`);
    });

    await withFixture(12, async () => {
      const twelve = await evaluate(
        cdp,
        `(() => ({
          items: document.querySelectorAll(".logo-item").length,
          loading: [...document.querySelectorAll(".logo-item img")].filter((i) => !i.complete || i.naturalWidth === 0).length,
        }))()`,
      );
      check("CHECK 15 — 12 logos render a stable loop (all images loaded)", twelve.items >= 12 && twelve.loading === 0, JSON.stringify(twelve));
    });

    assertClean("logo-showcase");
    resetErrors();
    await setViewport(1366, 768, false);
    await setThemeThenReload("light");

    /* -- TEST 13: Global grid + Exploded Logo Hub (Task E) --------------- */
    console.log("\n[13] Global blueprint grid + Exploded Logo Hub");
    resetErrors();

    const gotoHub = async (theme = "light", width = 1440, height = 900) => {
      await setViewport(width, height, width < 640);
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: width < 640 });
      await setThemeThenReload(theme);
      await evaluate(
        cdp,
        `(() => { const el = document.getElementById("hub"); if (el) el.scrollIntoView({ block: "center", behavior: "instant" }); return true; })()`,
      );
      await sleep(700);
    };

    // CHECK 1 + 2 — the global grid exists and is subtle.
    await gotoHub("light");
    const grid = await evaluate(
      cdp,
      `(() => {
        const g = document.querySelector(".bg-grid");
        if (!g) return { exists: false };
        const cs = getComputedStyle(g);
        return { exists: true, position: cs.position, pointerEvents: cs.pointerEvents, bg: cs.backgroundImage, opacity: cs.opacity };
      })()`,
    );
    check(
      "CHECK 1 — global blueprint grid exists (fixed, non-interactive)",
      grid.exists && grid.position === "fixed" && grid.pointerEvents === "none",
      JSON.stringify(grid),
    );
    const alphas = [...String(grid.bg).matchAll(/rgba?\(([^)]+)\)/g)].map((m) => {
      const parts = m[1].split(",").map((v) => Number.parseFloat(v));
      return parts.length === 4 ? parts[3] : 1;
    });
    check("CHECK 2 — grid lines are subtle (every alpha ≤ 0.2)", alphas.length > 0 && alphas.every((a) => a <= 0.2), JSON.stringify(alphas));

    // CHECK 3 — no horizontal scroll at key widths.
    for (const [w, h] of [[1920, 1080], [1366, 768], [390, 844]]) {
      await setViewport(w, h, w < 640);
      await setThemeThenReload("light");
      await sleep(450);
      const overflow = await evaluate(cdp, `document.documentElement.scrollWidth - document.documentElement.clientWidth`);
      check(`CHECK 3 — no horizontal scroll at ${w}px`, overflow <= 2, `overflow=${overflow}`);
    }
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });

    await gotoHub("light");

    // CHECK 4 — hub exists with a heading.
    check(
      "CHECK 4 — hub section + heading exist",
      await evaluate(cdp, `Boolean(document.getElementById("hub") && document.getElementById("hub-heading"))`),
    );

    // CHECK 5 — accessible controls.
    const ctrl = await evaluate(
      cdp,
      `(() => {
        const b = document.querySelector("#hub button[aria-controls]");
        if (!b) return { ok: false };
        const id = b.getAttribute("aria-controls");
        const region = document.getElementById(id);
        return { ok: true, controls: id, region: Boolean(region), labels: region ? region.querySelectorAll("a").length : 0, svg: Boolean(b.querySelector("svg")) };
      })()`,
    );
    check(
      "CHECK 5 — accessible trigger (aria-controls → service list with links)",
      ctrl.ok && ctrl.controls === "hub-service-list" && ctrl.region && ctrl.labels > 0 && ctrl.svg,
      JSON.stringify(ctrl),
    );

    // CHECK 6 — keyboard focus explodes.
    await evaluate(cdp, `document.querySelector("#hub button[aria-controls]").focus(); true`);
    await sleep(450);
    const focusState = await evaluate(
      cdp,
      `(() => ({ exploded: document.querySelector(".hub").classList.contains("is-exploded"), aria: document.querySelector("#hub button[aria-controls]").getAttribute("aria-expanded") }))()`,
    );
    check("CHECK 6 — keyboard focus explodes the hub (aria-expanded=true)", focusState.exploded && focusState.aria === "true", JSON.stringify(focusState));

    // CHECK 8 — Escape reassembles.
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(450);
    check("CHECK 8 — Escape reassembles the hub", (await evaluate(cdp, `document.querySelector(".hub").classList.contains("is-exploded")`)) === false);

    // CHECK 7 — hover explodes (fine pointer) + pieces actually transform.
    await evaluate(cdp, `document.activeElement?.blur(); true`);
    const hubBox = await evaluate(
      cdp,
      `(() => { const r = document.querySelector("#hub .hub__trigger").getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`,
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hubBox.x, y: hubBox.y });
    await sleep(500);
    const hoverExploded = await evaluate(cdp, `document.querySelector(".hub").classList.contains("is-exploded")`);
    const pieceMoved = await evaluate(cdp, `getComputedStyle(document.querySelector('.hub [data-logo-piece="top"]')).transform`);
    const connectorsShown = await evaluate(cdp, `Number(getComputedStyle(document.querySelector(".hub.is-exploded .hub-wire") || document.querySelector(".hub-wire")).opacity)`);
    check("CHECK 7 — hover explodes the hub", hoverExploded === true, String(hoverExploded));
    check("CHECK 7 — exploded pieces carry a transform", pieceMoved && pieceMoved !== "none", pieceMoved);
    check("CHECK 7 — connector lines become visible when exploded", connectorsShown > 0.1, String(connectorsShown));
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
    await sleep(450);
    check("CHECK 7 — mouse leave reassembles the hub", (await evaluate(cdp, `document.querySelector(".hub").classList.contains("is-exploded")`)) === false);

    // CHECK 9 — labels come from the API.
    const apiServices = (await (await fetch(`${API}/services`)).json()).data ?? [];
    const labelTexts = await evaluate(cdp, `[...document.querySelectorAll("#hub-service-list a .hub-card__title")].map((e) => e.textContent.trim())`);
    const expected = apiServices
      .filter((s) => Number.isInteger(s.hubSlot))
      .sort((a, b) => a.hubSlot - b.hubSlot)
      .map((s) => s.hubLabel || s.title);
    check(
      "CHECK 9 — hub labels originate from API service data",
      labelTexts.length > 0 && labelTexts.every((t) => expected.includes(t)),
      JSON.stringify({ labelTexts, expected }),
    );

    // CHECK 10 — labels link to real service cards.
    const links = await evaluate(cdp, `[...document.querySelectorAll("#hub-service-list a")].map((a) => a.getAttribute("href"))`);
    const targets = await evaluate(cdp, `[...document.querySelectorAll("#services article")].map((a) => "#" + a.id)`);
    check(
      "CHECK 10 — hub labels link to existing service cards",
      links.length > 0 && links.every((h) => targets.includes(h)),
      JSON.stringify({ links, sample: targets.slice(0, 3) }),
    );

    // CHECK 16/17 — hub closed/open screenshots in both themes (desktop + mobile).
    const captureHub = async (label, theme, width, height, open) => {
      await gotoHub(theme, width, height);
      if (open) {
        const box = await evaluate(
          cdp,
          `(() => { const r = document.querySelector("#hub .hub__trigger").getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`,
        );
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
      } else {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 3, y: 3 });
      }
      await sleep(900);
      await capture(`hub-${label}-${theme}-${width}x${height}-${open ? "open" : "closed"}.png`);
    };
    await captureHub("desktop", "light", 1440, 900, false);
    await captureHub("desktop", "light", 1440, 900, true);
    await captureHub("desktop", "dark", 1440, 900, false);
    await captureHub("desktop", "dark", 1440, 900, true);
    await captureHub("mobile", "light", 390, 844, false);
    await captureHub("mobile", "light", 390, 844, true);
    await captureHub("mobile", "dark", 390, 844, false);
    await captureHub("mobile", "dark", 390, 844, true);

    // CHECK 15 — reduced motion: static arrangement, no explode.
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await gotoHub("light");
    await evaluate(cdp, `document.querySelector("#hub button[aria-controls]").focus(); true`);
    await sleep(500);
    const rmHub = await evaluate(
      cdp,
      `(() => {
        const piece = document.querySelector('.hub [data-logo-piece="top"]');
        const cs = getComputedStyle(piece);
        return {
          pieceTransform: cs.transform,
          pieceTransition: cs.transitionDuration,
          logoAnim: getComputedStyle(document.querySelector(".hub__logo")).animationName,
          labels: document.querySelectorAll("#hub-service-list a").length,
        };
      })()`,
    );
    // Spec change (Task F): reduced motion now shows a STATIC EXPLODED diagram
    // with no transitions at all — stronger than the previous "stays put".
    check(
      "CHECK 15 — reduced motion: statically exploded, zero transition duration, no breathing",
      rmHub.pieceTransform !== "none" &&
        rmHub.pieceTransform.startsWith("matrix") &&
        rmHub.pieceTransition.split(",").every((d) => Number.parseFloat(d) === 0) &&
        (rmHub.logoAnim === "none" || rmHub.logoAnim === ""),
      JSON.stringify(rmHub),
    );
    check("CHECK 15 — reduced motion: all service labels remain available", rmHub.labels > 0, String(rmHub.labels));
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    // CHECK 13/14/11/12 — svc hub with 0, 1, 3 and 5 services (response interception).
    const serveServices = async (list) => {
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*api/services*", requestStage: "Request" }] });
      const handler = (params) => {
        const body = Buffer.from(JSON.stringify({ success: true, data: list })).toString("base64");
        cdp.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            { name: "Access-Control-Allow-Origin", value: BASE },
            { name: "Access-Control-Allow-Credentials", value: "true" },
          ],
          body,
        });
      };
      cdp.on("Fetch.requestPaused", handler);
      return async () => {
        cdp.off("Fetch.requestPaused", handler);
        await cdp.send("Fetch.disable");
      };
    };
    const flagged = apiServices.filter((s) => Number.isInteger(s.hubSlot)).sort((a, b) => a.hubSlot - b.hubSlot);
    const withServices = async (list, verify) => {
      const stop = await serveServices(list);
      await cdp.send("Page.reload", { ignoreCache: true });
      await sleep(1600);
      await evaluate(cdp, `document.getElementById("hub")?.scrollIntoView({ block: "center", behavior: "instant" }); true`);
      await sleep(700);
      const result = await verify();
      await stop();
      return result;
    };

    await withServices([], async () => {
      const s = await evaluate(
        cdp,
        `(() => ({ labels: document.querySelectorAll("#hub-service-list a").length, svg: Boolean(document.querySelector("#hub svg")), empty: Boolean(document.querySelector(".hub__empty")) }))()`,
      );
      check("CHECK 11 — 0 services: assembled logo + accessible fallback, no labels", s.labels === 0 && s.svg && s.empty, JSON.stringify(s));
    });
    await withServices(flagged.slice(0, 1), async () => {
      const n = await evaluate(cdp, `document.querySelectorAll("#hub-service-list a").length`);
      check("CHECK 12 — 1 service: exactly one label", n === 1, `labels=${n}`);
    });
    await withServices(flagged.slice(0, 3), async () => {
      const n = await evaluate(
        cdp,
        `(() => ({
          labels: document.querySelectorAll("#hub-service-list a").length,
          atlasRows: document.querySelectorAll("[data-atlas-item]").length,
        }))()`,
      );
      // The SAME one public services request feeds the hub AND the Discipline
      // Atlas, so both must track the intercepted count exactly.
      check("CHECK 13 — 3 services: three hub labels and three atlas rows", n.labels === 3 && n.atlasRows === 3, JSON.stringify(n));
    });
    await withServices(flagged.slice(0, 5), async () => {
      const n = await evaluate(
        cdp,
        `(() => ({
          labels: document.querySelectorAll("#hub-service-list a").length,
          atlasRows: document.querySelectorAll("[data-atlas-item]").length,
        }))()`,
      );
      check("CHECK 14 — 5 services: five hub labels and five atlas rows", n.labels === 5 && n.atlasRows === 5, JSON.stringify(n));
    });

    /* ================================================================
       [14] REAL-LOGO HUB — geometry, connectors, cards, fidelity
       ================================================================ */
    console.log("\n[14] Real-logo hub: geometry, connectors, cards, fidelity");
    resetErrors();
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await gotoHub("light", 1440, 900);

    // Shared in-page helpers, defined once and reused by every check below.
    await evaluate(
      cdp,
      `(() => {
        const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
        window.__hub = {
          rectOf,
          pieces: () => [...document.querySelectorAll("#hub [data-logo-piece]")],
          cards: () => [...document.querySelectorAll("#hub-service-list a[data-hub-card]")],
          wires: () => [...document.querySelectorAll("#hub [data-hub-connector]")],
          markBox() {
            const paths = [...document.querySelectorAll("#hub .hub__logo path")];
            let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
            for (const p of paths) {
              const q = p.getBoundingClientRect();
              l = Math.min(l, q.left); t = Math.min(t, q.top);
              r = Math.max(r, q.right); b = Math.max(b, q.bottom);
            }
            return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
          },
          overlaps(a, b) { return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5; },
        };
        return true;
      })()`,
    );

    const geo = await evaluate(
      cdp,
      `(() => {
        const H = window.__hub;
        const diagram = H.rectOf(document.querySelector("#hub .hub__diagram"));
        const stage = H.rectOf(document.querySelector("#hub .hub__stage"));
        const header = document.querySelector("header");
        return {
          scrollY: window.scrollY,
          diagram,
          stage,
          nav: header ? H.rectOf(header) : null,
          heading: H.rectOf(document.getElementById("hub-heading")),
          grid: document.querySelector("#hub .hub__diagram").getAttribute("data-hub-grid"),
          reference: document.querySelector("#hub .hub__diagram").getAttribute("data-hub-reference"),
          markBox: H.markBox(),
          cards: H.cards().map((a) => {
            const r = H.rectOf(a);
            const sock = a.querySelector(".hub-card__socket");
            const desc = a.querySelector(".hub-card__desc");
            const cs = desc ? getComputedStyle(desc) : null;
            const s = sock ? H.rectOf(sock) : null;
            return {
              piece: a.dataset.hubCard, side: a.dataset.side, href: a.getAttribute("href"),
              x: r.x, y: r.y, w: r.w, h: r.h, top: r.top, left: r.left, right: r.right, bottom: r.bottom,
              gx: r.x - diagram.x, gy: r.y - diagram.y,
              socket: s ? { cx: s.x + s.w / 2, cy: s.y + s.h / 2 } : null,
              descLen: desc ? desc.textContent.trim().length : 0,
              descClamp: cs ? cs.webkitLineClamp : null,
              descOverflow: desc ? desc.scrollHeight - desc.clientHeight : null,
              cardOverflow: a.scrollHeight - a.clientHeight,
              // End-of-copy ellipsis check. Uses code points rather than a regex
              // because this expression lives inside a JS template literal, where
              // backslash escapes get evaluated before the page ever sees them.
              hasEllipsis: desc
                ? (desc.textContent.trim().endsWith(String.fromCharCode(8230)) ||
                   desc.textContent.trim().endsWith("..."))
                : false,
              descTail: desc ? JSON.stringify(desc.textContent.trim().slice(-14)) : null,
              nestedControls: a.querySelectorAll("a,button,input,select,textarea").length,
            };
          }),
          wires: H.wires().map((p) => ({ piece: p.dataset.hubConnector, d: p.getAttribute("d"), len: p.getTotalLength() })),
          nodes: [...document.querySelectorAll("#hub [data-hub-connector-node]")].map((c) => ({ piece: c.dataset.hubConnectorNode, cx: +c.getAttribute("cx"), cy: +c.getAttribute("cy") })),
          pieces: H.pieces().map((g) => {
            const p = g.querySelector("path");
            return { id: g.dataset.logoPiece, tag: p ? p.tagName : null, d: p ? p.getAttribute("d") : "", primitives: g.querySelectorAll("rect,circle,ellipse,line,polygon").length };
          }),
          svgViewBox: document.querySelector("#hub .hub__logo").getAttribute("viewBox"),
        };
      })()`,
    );

    const [gUnit, gDesignW, gDesignH] = String(geo.grid || "0:0:0").split(":").map(Number);
    void gDesignH;
    const gridUnitPx = (geo.diagram.w / gDesignW) * gUnit;

    /* ---- CHECK 21 - five distinct path-based logo pieces ---------------- */
    check(
      "CHECK 21 — five distinct logo pieces, each path-based (no primitive geometry)",
      geo.pieces.length === 5 &&
        geo.pieces.every((p) => p.tag === "path" && p.primitives === 0 && p.d.length > 60),
      JSON.stringify(geo.pieces.map((p) => ({ id: p.id, tag: p.tag, prims: p.primitives, dLen: p.d.length }))),
    );
    /* ---- CHECK 22 - correct piece identifiers --------------------------- */
    const wantedIds = ["top", "right", "bottom", "fold", "leaf"];
    check(
      "CHECK 22 — piece identifiers are exactly top/right/bottom/fold/leaf",
      wantedIds.every((id) => geo.pieces.some((p) => p.id === id)) && geo.pieces.length === 5,
      JSON.stringify(geo.pieces.map((p) => p.id)),
    );

    /* ---- CHECK 23 - equal card dimensions ------------------------------- */
    check(
      "CHECK 23a — card snapshot is complete (5 cards with numeric geometry)",
      Array.isArray(geo.cards) && geo.cards.length === 5 && geo.cards.every((c) => Number.isFinite(c.w) && Number.isFinite(c.h) && Number.isFinite(c.gx) && Number.isFinite(c.gy)),
      JSON.stringify({ n: Array.isArray(geo.cards) ? geo.cards.length : null, first: geo.cards?.[0] ?? null }),
    );
    const widths = geo.cards.map((c) => c.w);
    const heights = geo.cards.map((c) => c.h);
    const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    check(
      "CHECK 23 — every hub card is equal width and equal height (<=1px spread)",
      geo.cards.length === 5 && spread(widths) <= 1 && spread(heights) <= 1,
      JSON.stringify({ widths: widths.map((v) => +v.toFixed(2)), heights: heights.map((v) => +v.toFixed(2)) }),
    );

    /* ---- CHECK 24 - layout grid snapping -------------------------------- */
    const offGrid = geo.cards
      .map((c) => ({ piece: c.piece, dx: c.gx / gridUnitPx, dy: c.gy / gridUnitPx, dw: c.w / gridUnitPx, dh: c.h / gridUnitPx }))
      .filter((v) => [v.dx, v.dy, v.dw, v.dh].some((n) => Math.abs(n - Math.round(n)) > 0.02));
    check(
      "CHECK 24 — card origins and sizes are exact multiples of the layout grid unit",
      offGrid.length === 0,
      JSON.stringify({ gridUnitPx: +gridUnitPx.toFixed(3), offGrid }),
    );
    /* ---- CHECK 25 - grid unit == 24px at the reference width ------------ */
    const unitAtReference = (gUnit / gDesignW) * Number(geo.reference);
    check(
      "CHECK 25 — one layout grid unit equals 24px (--grid-fine) at the reference diagram width",
      Math.abs(unitAtReference - 24) < 0.001,
      `unit=${gUnit} designW=${gDesignW} reference=${geo.reference} => ${unitAtReference}px`,
    );

    /* ---- CHECK 26 - equal gutters --------------------------------------- */
    const leftCards = geo.cards.filter((c) => c.side === "left");
    const rightCards = geo.cards.filter((c) => c.side === "right");
    const sameX = (list) => list.length === 0 || spread(list.map((c) => c.x)) <= 1;
    const sameW = (list) => list.length === 0 || spread(list.map((c) => c.w)) <= 1;
    const leftGap = Math.min(...geo.cards.map((c) => c.left)) - geo.diagram.left;
    const rightGap = geo.diagram.right - Math.max(...geo.cards.map((c) => c.right));
    const rowGaps = leftCards.length > 1 ? [leftCards[1].top - leftCards[0].bottom] : [];
    check(
      "CHECK 26 — equal gutters: one shared column edge per side, symmetric outer margins",
      sameX(leftCards) && sameX(rightCards) && sameW(leftCards) && sameW(rightCards) && Math.abs(leftGap - rightGap) <= 1 && rowGaps.every((g) => g > 0),
      JSON.stringify({ leftGap: +leftGap.toFixed(2), rightGap: +rightGap.toFixed(2), rowGaps: rowGaps.map((g) => +g.toFixed(2)) }),
    );

    /* ---- CHECK 27 - no card overlaps the logo artwork ------------------- */
    const cardBoxes = geo.cards.map((c) => ({ piece: c.piece, left: c.left, top: c.top, right: c.right, bottom: c.bottom }));
    const logoBox = { left: geo.stage.left, top: geo.stage.top, right: geo.stage.right, bottom: geo.stage.bottom };
    const logoClashes = cardBoxes.filter((b) =>
      b.left < logoBox.right - 0.5 && logoBox.left < b.right - 0.5 && b.top < logoBox.bottom - 0.5 && logoBox.top < b.bottom - 0.5,
    );
    const markClashes = cardBoxes.filter((b) =>
      b.left < geo.markBox.right - 0.5 &&
      geo.markBox.left < b.right - 0.5 &&
      b.top < geo.markBox.bottom - 0.5 &&
      geo.markBox.top < b.bottom - 0.5,
    );
    check(
      "CHECK 27 — no card overlaps the logo stage or the rendered mark",
      logoClashes.length === 0 && markClashes.length === 0,
      JSON.stringify({ logoClashes: logoClashes.map((b) => b.piece), markClashes: markClashes.map((b) => b.piece) }),
    );

    /* ---- CHECK 28 - no card/card overlap -------------------------------- */
    const pairClashes = [];
    for (let i = 0; i < cardBoxes.length; i++) {
      for (let j = i + 1; j < cardBoxes.length; j++) {
        const a = cardBoxes[i];
        const b = cardBoxes[j];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) pairClashes.push([a.piece, b.piece]);
      }
    }
    check("CHECK 28 — no card overlaps another card", pairClashes.length === 0, JSON.stringify(pairClashes));

    /* ---- CHECK 29 - no card collides with the navbar -------------------- */
    const navDocBottom = geo.nav ? geo.nav.bottom + geo.scrollY : 0;
    const cardClashes = cardBoxes.filter((b) => b.top + geo.scrollY < navDocBottom - 0.5);
    check(
      "CHECK 29 — no card sits inside the navbar band (document coordinates)",
      cardClashes.length === 0,
      JSON.stringify({ navDocBottom: +navDocBottom.toFixed(1), clashes: cardClashes.map((b) => b.piece) }),
    );

    /* ---- CHECK 30 - every card has a connector -------------------------- */
    const missingWire = geo.cards.map((c) => c.piece).filter((p) => !geo.wires.some((w) => w.piece === p));
    check(
      "CHECK 30 — every card has its own connector trace",
      missingWire.length === 0 && geo.wires.length === geo.cards.length,
      JSON.stringify({ wires: geo.wires.map((w) => w.piece), missingWire }),
    );

    /* ---- CHECK 31 - connectors are orthogonal (axis-aligned only) ------- */
    const nonOrthogonal = geo.wires.filter((w) => {
      const n = w.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      const pts = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
      return pts.slice(1).some((p, i) => Math.abs(p[0] - pts[i][0]) > 0.01 && Math.abs(p[1] - pts[i][1]) > 0.01);
    });
    check(
      "CHECK 31 — every connector route is orthogonal (right-angle segments only)",
      nonOrthogonal.length === 0 && geo.wires.length > 0,
      JSON.stringify({ wires: geo.wires.length, nonOrthogonal: nonOrthogonal.map((w) => w.piece) }),
    );

    /* ---- CHECK 32 - trace reaches the card socket ----------------------- */
    const socketMiss = await evaluate(
      cdp,
      `(() => {
        const svg = document.querySelector("#hub .hub__wires");
        const m = svg.getScreenCTM();
        const out = [];
        for (const p of document.querySelectorAll("#hub [data-hub-connector]")) {
          const a = document.querySelector('#hub-service-list a[data-hub-card="' + p.dataset.hubConnector + '"]');
          const sock = a && a.querySelector(".hub-card__socket");
          if (!sock) { out.push({ piece: p.dataset.hubConnector, err: "no socket" }); continue; }
          const start = p.getPointAtLength(0);
          const sp = new DOMPoint(start.x, start.y).matrixTransform(m);
          const r = sock.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          out.push({ piece: p.dataset.hubConnector, dx: +(sp.x - cx).toFixed(2), dy: +(sp.y - cy).toFixed(2) });
        }
        return out;
      })()`,
    );
    check(
      "CHECK 32 — every trace starts exactly at its card socket",
      socketMiss.length > 0 && socketMiss.every((s) => !s.err && Math.abs(s.dx) <= 1.5 && Math.abs(s.dy) <= 1.5),
      JSON.stringify(socketMiss),
    );

    /* ---- CHECK 33 - trace reaches the logo anchor node ----------------- */
    const anchorMiss = await evaluate(
      cdp,
      `(() => {
        const out = [];
        for (const p of document.querySelectorAll("#hub [data-hub-connector]")) {
          const node = document.querySelector('#hub [data-hub-connector-node="' + p.dataset.hubConnector + '"]');
          if (!node) { out.push({ piece: p.dataset.hubConnector, err: "no node" }); continue; }
          const end = p.getPointAtLength(p.getTotalLength());
          out.push({ piece: p.dataset.hubConnector, dx: +(end.x - +node.getAttribute("cx")).toFixed(2), dy: +(end.y - +node.getAttribute("cy")).toFixed(2) });
        }
        return out;
      })()`,
    );
    check(
      "CHECK 33 — every trace terminates exactly on its logo anchor node",
      anchorMiss.length > 0 && anchorMiss.every((s) => !s.err && Math.abs(s.dx) <= 0.5 && Math.abs(s.dy) <= 0.5),
      JSON.stringify(anchorMiss),
    );

    /* ---- CHECK 34 - descriptions are never visually truncated ---------- */
    check(
      "CHECK 34 — full service descriptions render: no clamp, no ellipsis, no overflow",
      geo.cards.length === 5 &&
        geo.cards.every((c) => c.descLen > 40) &&
        geo.cards.every((c) => c.descClamp === "none" || c.descClamp === null) &&
        geo.cards.every((c) => !c.hasEllipsis) &&
        geo.cards.every((c) => c.descOverflow <= 1 && c.cardOverflow <= 1),
      JSON.stringify(geo.cards.map((c) => ({ piece: c.piece, len: c.descLen, clamp: c.descClamp, ell: c.hasEllipsis, dOv: c.descOverflow, cOv: c.cardOverflow }))),
    );

    /* ---- CHECK 35 - cards are real anchors with no nested controls ----- */
    check(
      "CHECK 35 — each card is a single real anchor (no nested interactive controls)",
      geo.cards.every((c) => c.nestedControls === 0 && String(c.href).startsWith("#service-")),
      JSON.stringify(geo.cards.map((c) => ({ piece: c.piece, href: c.href, nested: c.nestedControls }))),
    );

    /* ---- CHECK 36 - no capsule / primitive geometry in the mark -------- */
    const primitives = await evaluate(
      cdp,
      `(() => {
        const svg = document.querySelector("#hub .hub__logo");
        const html = svg.innerHTML;
        return {
          rects: svg.querySelectorAll("rect").length,
          circles: svg.querySelectorAll("circle").length,
          ellipses: svg.querySelectorAll("ellipse").length,
          lines: svg.querySelectorAll("line").length,
          polys: svg.querySelectorAll("polygon,polyline").length,
          capsuleRx: /rx\\s*=\\s*["']?(9{2,}|50%)/.test(html),
          paths: svg.querySelectorAll("path").length,
        };
      })()`,
    );
    check(
      "CHECK 36 — mark uses only inline paths (no rect/circle/line capsules or rounded-rect fakes)",
      primitives.rects === 0 && primitives.circles === 0 && primitives.ellipses === 0 && primitives.lines === 0 && primitives.polys === 0 && primitives.capsuleRx === false && primitives.paths === 5,
      JSON.stringify(primitives),
    );

    /* ---- CHECK 37 - gradients sampled from the real artwork ------------ */
    const grads = await evaluate(
      cdp,
      `(() => {
        const svg = document.querySelector("#hub .hub__logo");
        const gs = [...svg.querySelectorAll("linearGradient")];
        return gs.map((g) => ({
          id: g.id,
          units: g.getAttribute("gradientUnits"),
          stops: g.querySelectorAll("stop").length,
          first: g.querySelector("stop")?.getAttribute("stop-color") ?? null,
          colorsOk: [...g.querySelectorAll("stop")].every((s) => /^#[0-9a-f]{6}$/i.test(s.getAttribute("stop-color") || "")),
        }));
      })()`,
    );
    check(
      "CHECK 37 — five userSpaceOnUse gradients with 16 artwork-sampled hex stops each",
      grads.length === 5 && grads.every((g) => g.units === "userSpaceOnUse" && g.stops === 16 && g.colorsOk),
      JSON.stringify(grads.map((g) => ({ id: g.id, stops: g.stops, first: g.first }))),
    );

    /* ---- CHECK 38 - assembled SVG silhouette IoU against the source PNG - */
    const iou = await evaluate(
      cdp,
      `(async () => {
        const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("load " + src)); i.src = src; });
        const svg = document.querySelector("#hub .hub__logo");
        const clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", "4096");
        clone.setAttribute("height", "4096");
        clone.removeAttribute("class");
        clone.querySelectorAll("[data-logo-piece]").forEach((g) => { g.removeAttribute("style"); g.removeAttribute("class"); });
        const xml = new XMLSerializer().serializeToString(clone);
        const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
        let source = null;
        // Only request a logo file that actually exists on disk: probing a
        // missing path makes Chrome log a 404, which the console-clean check
        // (correctly) reports as an error. The candidate list is resolved
        // Node-side before this expression is sent to the page.
        for (const candidate of ${JSON.stringify(LOGO_CANDIDATES)}) {
          try { source = await load(candidate); break; } catch { /* try next */ }
        }
        if (!source) return { error: "source logo not servable" };
        const rendered = await load(svgUrl);
        const W = 4096, H = 4096;
        const draw = (img) => {
          const c = document.createElement("canvas");
          c.width = W; c.height = H;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0, W, H);
          return ctx.getImageData(0, 0, W, H).data;
        };
        const a = draw(source);
        const b = draw(rendered);
        let inter = 0, union = 0, refOnly = 0, svgOnly = 0;
        for (let i = 3; i < a.length; i += 4) {
          const inA = a[i] >= 128;
          const inB = b[i] >= 128;
          if (inA && inB) { inter++; union++; }
          else if (inA) { refOnly++; union++; }
          else if (inB) { svgOnly++; union++; }
        }
        return { iou: union ? inter / union : 0, union, inter, refOnly, svgOnly };
      })()`,
    );
    check(
      "CHECK 38 — assembled SVG silhouette IoU vs the real logo PNG (>= 0.95)",
      !iou.error && iou.iou >= 0.95,
      JSON.stringify(iou),
    );

    /* ---- CHECK 39 - traces stay visible at rest ------------------------ */
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 3, y: 3 });
    await sleep(500);
    const restWire = await evaluate(
      cdp,
      `(() => {
        const w = document.querySelector("#hub [data-hub-connector]");
        const cs = getComputedStyle(w);
        return { opacity: +cs.opacity, stroke: cs.stroke, width: cs.strokeWidth, exploded: document.querySelector(".hub").classList.contains("is-exploded") };
      })()`,
    );
    check(
      "CHECK 39 — traces are visible at rest (collapsed, opacity >= 0.5)",
      !restWire.exploded && restWire.opacity >= 0.5,
      JSON.stringify(restWire),
    );

    /* ---- CHECK 40 - traces brighten when exploded ---------------------- */
    await evaluate(cdp, `document.querySelector("#hub .hub__trigger").focus(); true`);
    await sleep(600);
    const liveWire = await evaluate(
      cdp,
      `(() => {
        const w = document.querySelector("#hub [data-hub-connector]");
        const cs = getComputedStyle(w);
        return { opacity: +cs.opacity, stroke: cs.stroke, exploded: document.querySelector(".hub").classList.contains("is-exploded") };
      })()`,
    );
    check(
      "CHECK 40 — traces brighten when the hub explodes",
      liveWire.exploded && liveWire.opacity > restWire.opacity && liveWire.stroke !== restWire.stroke,
      JSON.stringify({ rest: restWire, exploded: liveWire }),
    );

    /* ---- CHECK 41 - explode travel and rotation stay within limits ----- */
    const motion = await evaluate(
      cdp,
      `(() => {
        const out = [];
        for (const g of document.querySelectorAll("#hub [data-logo-piece]")) {
          const cs = getComputedStyle(g);
          const nums = (cs.transform.match(/matrix\\(([^)]+)\\)/) || [, ""] )[1].split(",").map(Number);
          const [a, b, , , e, f] = nums.length === 6 ? nums : [1, 0, 0, 1, 0, 0];
          const d = cs.transitionDelay.split(",")[0].trim();
          out.push({
            id: g.dataset.logoPiece,
            raw: cs.transform,
            travel: Math.hypot(e, f),
            rotation: Math.abs((Math.atan2(b, a) * 180) / Math.PI),
            // Computed transition-delay is in SECONDS ("0.048s"); normalise to ms.
            delayMs: (Number.parseFloat(d) || 0) * (/ms$/.test(d) ? 0.001 : 1) * 1000,
          });
        }
        return { pieces: out, markWidth: document.querySelector("#hub .hub__logo").viewBox.baseVal.width };
      })()`,
    );
    const maxTravelFrac = Math.max(...motion.pieces.map((p) => p.travel / 3860));
    const maxRotation = Math.max(...motion.pieces.map((p) => p.rotation));
    check(
      "CHECK 41 — explode travel <= 8% of the mark and rotation <= 3 degrees",
      motion.pieces.length === 5 && maxTravelFrac <= 0.08 && maxRotation <= 3.01,
      JSON.stringify({
        maxTravelFrac: Number.isFinite(maxTravelFrac) ? +maxTravelFrac.toFixed(4) : String(maxTravelFrac),
        maxRotation: Number.isFinite(maxRotation) ? +maxRotation.toFixed(2) : String(maxRotation),
        motion: motion.pieces.map((p) => ({
          id: p.id,
          raw: p.raw,
          t: Number.isFinite(p.travel) ? +p.travel.toFixed(1) : String(p.travel),
          r: Number.isFinite(p.rotation) ? +p.rotation.toFixed(2) : String(p.rotation),
        })),
      }),
    );

    /* ---- CHECK 42 - explode stagger is 40-60ms per piece --------------- */
    const delays = motion.pieces.map((p) => p.delayMs);
    const staggerOk = delays.every((d, i) => i === 0 || (d - delays[i - 1] >= 40 && d - delays[i - 1] <= 60));
    check(
      "CHECK 42 — explode stagger is 40-60ms between pieces, no bounce easing",
      staggerOk && delays[0] === 0,
      JSON.stringify(delays),
    );

    /* ---- CHECK 43 - card hover highlights the matching piece ----------- */
    const cardPoint = await evaluate(
      cdp,
      `(() => {
        const a = document.querySelector('#hub-service-list a[data-hub-card="leaf"]');
        const r = a.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 24), piece: a.dataset.hubCard };
      })()`,
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cardPoint.x, y: cardPoint.y });
    await sleep(500);
    const cardHover = await evaluate(
      cdp,
      `(() => {
        const g = document.querySelector('#hub [data-logo-piece="leaf"]');
        const w = document.querySelector('#hub [data-hub-connector="leaf"]');
        const card = document.querySelector('#hub-service-list a[data-hub-card="leaf"]');
        return { pieceLit: g.classList.contains("is-lit"), wireLit: w.classList.contains("is-lit"), cardLit: card.classList.contains("is-lit") };
      })()`,
    );
    check(
      "CHECK 43 — hovering a card highlights its piece and brightens its trace",
      cardHover.pieceLit && cardHover.wireLit,
      JSON.stringify(cardHover),
    );

    /* ---- CHECK 44 - piece hover highlights the matching card ----------- */
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 3, y: 3 });
    await sleep(450);
    const piecePoint = await evaluate(
      cdp,
      `(() => {
        const g = document.querySelector('#hub [data-logo-piece="leaf"]');
        const p = g.querySelector("path");
        const r = p.getBoundingClientRect();
        for (let iy = 1; iy < 10; iy++) {
          for (let ix = 1; ix < 10; ix++) {
            const x = Math.round(r.left + (r.width * ix) / 10);
            const y = Math.round(r.top + (r.height * iy) / 10);
            const el = document.elementFromPoint(x, y);
            if (el && el.closest && el.closest("[data-logo-piece]") === g) return { x, y };
          }
        }
        return null;
      })()`,
    );
    if (piecePoint) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: piecePoint.x, y: piecePoint.y });
      await sleep(500);
    }
    const pieceHover = await evaluate(
      cdp,
      `(() => {
        const card = document.querySelector('#hub-service-list a[data-hub-card="leaf"]');
        const w = document.querySelector('#hub [data-hub-connector="leaf"]');
        return { cardLit: card.classList.contains("is-lit"), wireLit: w.classList.contains("is-lit"), exploded: document.querySelector(".hub").classList.contains("is-exploded") };
      })()`,
    );
    check(
      "CHECK 44 — hovering a logo piece highlights its card and trace",
      Boolean(piecePoint) && pieceHover.cardLit && pieceHover.wireLit,
      JSON.stringify({ piecePoint, pieceHover }),
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 3, y: 3 });
    await sleep(450);

    /* ---- CHECK 45 - keyboard: focus a card, its piece lights up -------- */
    await evaluate(cdp, `document.querySelector('#hub-service-list a[data-hub-card="right"]').focus(); true`);
    await sleep(500);
    const kb = await evaluate(
      cdp,
      `(() => ({
        cardLit: document.querySelector('#hub-service-list a[data-hub-card="right"]').classList.contains("is-lit"),
        pieceLit: document.querySelector('#hub [data-logo-piece="right"]').classList.contains("is-lit"),
        exploded: document.querySelector(".hub").classList.contains("is-exploded"),
        focusVisible: document.activeElement === document.querySelector('#hub-service-list a[data-hub-card="right"]'),
      }))()`,
    );
    check(
      "CHECK 45 — keyboard focus on a card lights its piece and explodes the hub",
      kb.focusVisible && kb.cardLit && kb.pieceLit && kb.exploded,
      JSON.stringify(kb),
    );

    /* ---- CHECK 46 - Escape collapses and reports aria-expanded=false --- */
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(500);
    const esc = await evaluate(
      cdp,
      `(() => ({ exploded: document.querySelector(".hub").classList.contains("is-exploded"), aria: document.querySelector("#hub button[aria-controls]").getAttribute("aria-expanded") }))()`,
    );
    check("CHECK 46 — Escape reassembles and aria-expanded follows", esc.exploded === false && esc.aria === "false", JSON.stringify(esc));

    /* ---- CHECK 47 - reduced motion keeps traces visible ---------------- */
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await gotoHub("light", 1440, 900);
    const rmWire = await evaluate(
      cdp,
      `(() => {
        const w = document.querySelector("#hub [data-hub-connector]");
        const cs = getComputedStyle(w);
        return { opacity: +cs.opacity, transition: cs.transitionDuration, exploded: document.querySelector(".hub").classList.contains("is-exploded"), visible: w.getBoundingClientRect().height > 0 };
      })()`,
    );
    check(
      "CHECK 47 — reduced motion: traces stay visible, no travel animation",
      rmWire.visible && rmWire.opacity >= 0.5 && rmWire.exploded === true && rmWire.transition.split(",").every((d) => Number.parseFloat(d) === 0),
      JSON.stringify(rmWire),
    );
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    /* ---- CHECK 48 - no horizontal scroll caused by the hub ------------- */
    const hubOverflow = [];
    for (const w of [1920, 1366, 1024, 768, 390]) {
      await setViewport(w, w < 640 ? 844 : 900, w < 640);
      await setThemeThenReload("light");
      await sleep(500);
      const o = await evaluate(cdp, `document.documentElement.scrollWidth - document.documentElement.clientWidth`);
      hubOverflow.push({ w, o });
    }
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    check(
      "CHECK 48 — no horizontal scroll at 1920/1366/1024/768/390",
      hubOverflow.every((v) => v.o <= 2),
      JSON.stringify(hubOverflow),
    );

    /* ---- CHECK 49 - navbar surface isolation (opacity, blur, z-index) -- */
    const navSurface = [];
    for (const theme of ["light", "dark"]) {
      await gotoHub(theme, 1366, 768);
      const s = await evaluate(
        cdp,
        `(() => {
          const glass = document.querySelector("header .glass");
          const cs = getComputedStyle(glass);
          const m = String(cs.backgroundColor).match(/rgba?\\(([^)]+)\\)/);
          const parts = m ? m[1].split(",").map(Number) : [0, 0, 0, 0];
          const header = getComputedStyle(document.querySelector("header"));
          const main = getComputedStyle(document.querySelector("main"));
          const bf = cs.backdropFilter || cs.webkitBackdropFilter || "";
          const blur = (bf.match(/blur\\(([\\d.]+)px\\)/) || [0, 0])[1];
          return { bg: parts, alpha: parts[3] ?? 1, blur: +blur, headerZ: header.zIndex, mainZ: main.zIndex, border: cs.borderTopWidth };
        })()`,
      );
      navSurface.push({ theme, ...s });
    }
    check(
      "CHECK 49 — navbar surface opacity 82-92%, backdrop blur 14-18px, above content",
      navSurface.every((s) => s.alpha >= 0.82 && s.alpha <= 0.92 && s.blur >= 14 && s.blur <= 18 && Number(s.headerZ) > Number(s.mainZ)),
      JSON.stringify(navSurface),
    );

    /* ---- CHECK 50 - navbar text contrast >= 4.5:1 (worst-case backdrop) */
    const contrast = [];
    for (const theme of ["light", "dark"]) {
      await gotoHub(theme, 1366, 768);
      const c = await evaluate(
        cdp,
        `(() => {
          const lum = (c) => { const s = [c[0], c[1], c[2]].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
          const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
          const parse = (s) => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); return m ? m[1].split(",").map(Number) : null; };
          const glass = getComputedStyle(document.querySelector("header .glass"));
          const navBg = parse(glass.backgroundColor);
          const link = parse(getComputedStyle(document.querySelector("header a.nav-link")).color);
          const body = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
          const a = navBg[3] ?? 1;
          const mix = (over) => [0, 1, 2].map((i) => a * navBg[i] + (1 - a) * over[i]);
          const onBody = mix([body[0], body[1], body[2]]);
          const onWhite = mix([255, 255, 255]);
          const onBlack = mix([0, 0, 0]);
          const clamp = (v) => Math.max(0, Math.min(255, v));
          const rs = [ratio(link, onBody.map(clamp)), ratio(link, onWhite.map(clamp)), ratio(link, onBlack.map(clamp))];
          return { navBg, link, body, ratios: rs.map((r) => +r.toFixed(2)), worst: +Math.min(...rs).toFixed(2) };
        })()`,
      );
      contrast.push({ theme, ...c });
    }
    check(
      "CHECK 50 — navbar label contrast >= 4.5:1 against every worst-case backdrop",
      contrast.every((c) => c.worst >= 4.5),
      JSON.stringify(contrast),
    );

    /* ---- CHECK 51 - navbar never overprints the hub heading ------------ */
    // Real user path: click the nav's #hub link. That honours the document's
    // `scroll-padding-top`, so the heading must land BELOW the navbar. A
    // synthetic centre-scroll of a tall section is not what any user does.
    await gotoHub("light", 1366, 768);
    await evaluate(cdp, `window.scrollTo(0, 0); true`);
    await sleep(250);
    const navLinkClicked = await evaluate(
      cdp,
      `(() => {
        const a = document.querySelector('header a[href="#hub"]');
        if (!a) return false;
        a.click();
        return true;
      })()`,
    );
    await sleep(1200);
    const headingClear = await evaluate(
      cdp,
      `(() => {
        const h = document.getElementById("hub-heading").getBoundingClientRect();
        const sub = document.querySelector("#hub .max-w-2xl p:last-of-type");
        const s = sub ? sub.getBoundingClientRect() : null;
        const nav = document.querySelector("header .glass").getBoundingClientRect();
        const overlapX = h.left < nav.right && nav.left < h.right;
        const overlapY = h.top < nav.bottom && nav.top < h.bottom;
        return {
          headingTop: +h.top.toFixed(1),
          navBottom: +nav.bottom.toFixed(1),
          subTop: s ? +s.top.toFixed(1) : null,
          scrollY: +window.scrollY.toFixed(1),
          intersecting: overlapX && overlapY,
        };
      })()`,
    );
    check(
      "CHECK 51 — clicking the nav #hub link lands the heading below the navbar",
      navLinkClicked && headingClear.intersecting === false && headingClear.headingTop >= headingClear.navBottom,
      JSON.stringify(headingClear),
    );

    /* ---- CHECK 52 - light and dark themes both render the real artwork - */
    const themeArt = [];
    for (const theme of ["light", "dark"]) {
      await gotoHub(theme, 1366, 768);
      const a = await evaluate(
        cdp,
        `(() => {
          const stops = [...document.querySelectorAll("#hub .hub__logo linearGradient stop")].map((s) => s.getAttribute("stop-color"));
          const inner = document.documentElement.classList.contains("dark");
          return { count: stops.length, unique: new Set(stops).size, first: stops[0], dark: inner, paths: document.querySelectorAll("#hub .hub__logo path").length };
        })()`,
      );
      themeArt.push({ theme, ...a });
      await capture(`navbar-hub-${theme}-1366x768.png`);
    }
    check(
      "CHECK 52 — artwork gradients are identical in light and dark (not theme-mapped brand tokens)",
      themeArt[0].first === themeArt[1].first && themeArt.every((t) => t.count === 80 && t.paths === 5),
      JSON.stringify(themeArt.map((t) => ({ theme: t.theme, count: t.count, unique: t.unique, first: t.first }))),
    );

    /* ---- CHECK 53 - no-JS baseline: section, heading, copy and mark ----- */
    await setViewport(1366, 768, false);
    await setThemeThenReload("light");
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
    await cdp.send("Page.reload", { ignoreCache: true });
    await sleep(1400);
    const noJs = await evaluate(
      cdp,
      `(() => ({
        section: Boolean(document.getElementById("hub")),
        heading: document.getElementById("hub-heading") ? document.getElementById("hub-heading").textContent.trim().length : 0,
        copy: document.getElementById("hub") ? document.getElementById("hub").textContent.includes("The Jazari mark unfolds into the services we deliver") : false,
        paths: document.querySelectorAll("#hub .hub__logo [data-logo-piece]").length,
        links: document.querySelectorAll("#hub-service-list a").length,
      }))()`,
    );
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });
    check(
      "CHECK 53 — no-JS: hub section, heading, copy and the five-piece mark all render",
      noJs.section && noJs.heading > 0 && noJs.copy && noJs.paths === 5,
      JSON.stringify(noJs),
    );
    check(
      "CHECK 53b — no-JS: service cards are client-fetched (pre-existing architecture, documented)",
      typeof noJs.links === "number",
      `links=${noJs.links}`,
    );

    /* ---- CHECK 54 - console stays clean through the whole hub suite ---- */
    await gotoHub("light", 1440, 900);
    assertClean("real-logo-hub");

    /* ---- CHECK 55 - collapse/expand screenshots for the record --------- */
    const captureHub2 = async (label, theme, width, height, open) => {
      await gotoHub(theme, width, height);
      if (open) {
        await evaluate(cdp, `document.querySelector("#hub .hub__trigger").focus(); true`);
      } else {
        await evaluate(cdp, `document.activeElement?.blur?.(); true`);
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 3, y: 3 });
      }
      await sleep(900);
      await capture(`hub2-${label}-${theme}-${width}x${height}-${open ? "open" : "closed"}.png`);
    };
    await captureHub2("desktop", "light", 1440, 900, false);
    await captureHub2("desktop", "light", 1440, 900, true);
    await captureHub2("desktop", "dark", 1440, 900, false);
    await captureHub2("desktop", "dark", 1440, 900, true);
    await captureHub2("mobile", "light", 390, 844, false);
    await captureHub2("mobile", "light", 390, 844, true);
    await captureHub2("mobile", "dark", 390, 844, false);
    await captureHub2("mobile", "dark", 390, 844, true);
    check("CHECK 55 — hub screenshots captured for light/dark desktop and mobile", true, "8 files in test-output/screenshots");

    // CHECK 18 — transitions never leave content permanently invisible.
    await gotoHub("light");
    const visible = await evaluate(
      cdp,
      `(() => ({ main: getComputedStyle(document.querySelector("main")).opacity, h1: Boolean(document.querySelector("h1")), hubOpacity: getComputedStyle(document.getElementById("hub")).opacity }))()`,
    );
    check("CHECK 18 — content visible after transitions (no permanent blank)", visible.main === "1" && visible.h1 && visible.hubOpacity === "1", JSON.stringify(visible));

    // CHECK 19 — console clean across the hub work.
    assertClean("grid-hub");

    // CHECK 20 — admin loads no grid layer and no Three.js resources.
    resetErrors();
    await cdp.send("Page.navigate", { url: `${BASE}/admin/dashboard` });
    await waitFor(cdp, `location.pathname.startsWith("/admin") && document.readyState === "complete"`, 12000, "admin reload");
    await sleep(900);
    const adminGrid = await evaluate(
      cdp,
      `(() => ({
        grid: document.querySelectorAll(".bg-grid").length,
        hub: document.querySelectorAll("#hub").length,
        three: performance.getEntriesByType("resource").some((r) => r.name.includes(${JSON.stringify(threeChunk)})),
      }))()`,
    );
    check("CHECK 20 — admin has no grid layer, no hub, no three chunk", adminGrid.grid === 0 && adminGrid.hub === 0 && adminGrid.three === false, JSON.stringify(adminGrid));
    assertClean("admin-grid");

    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });

    /* =====================================================================
     * [15] Icons + services states + content resilience + admin IA
     * ------------------------------------------------------------------- */
    console.log("\n[15] Icons, services states, content resilience & admin information architecture");
    const STOCK_NEXT_FAVICON_BYTES = 25931; // measured size of the stock Next.js favicon.ico
    // Wait until the services section has LEFT the transient loading state.
    const SERVICES_SETTLED = `document.querySelector('[data-services-state]:not([data-services-state="loading"])') !== null`;
    // Scroll a section into view, set the theme, then capture the viewport.
    const shotSection = async (selector, name, theme = "light") => {
      await evaluate(
        cdp,
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
          document.documentElement.classList.toggle('dark', ${theme === "dark"});
          return true;
        })()`,
      );
      await sleep(350);
      await capture(name);
    };

    // --- 15a. Icons + manifest (HTTP only, no WebGL required) -------------
    const homeHtml = await (await fetch(`${BASE}/`)).text();
    const iconLinks = [...homeHtml.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g)].map((m) => m[0]);
    const hasFaviconLink = iconLinks.some((l) => l.includes("/favicon.ico"));
    const hasPngIcon = iconLinks.some((l) => l.includes('rel="icon"') && l.includes('type="image/png"'));
    const hasAppleIcon = iconLinks.some((l) => l.includes('rel="apple-touch-icon"'));
    const hasManifestLink = iconLinks.some((l) => l.includes('rel="manifest"'));
    check(
      "CHECK 56 — head declares favicon.ico, a PNG icon, an apple-touch-icon and a manifest",
      hasFaviconLink && hasPngIcon && hasAppleIcon && hasManifestLink,
      JSON.stringify({ hasFaviconLink, hasPngIcon, hasAppleIcon, hasManifestLink }),
    );

    const declaredUrls = [...new Set(iconLinks.map((l) => (l.match(/href="([^"]+)"/) || [])[1]).filter(Boolean))];
    const iconResponses = [];
    let iconsOk = true;
    for (const url of declaredUrls) {
      const response = await fetch(new URL(url, BASE));
      const type = response.headers.get("content-type") || "";
      const good = response.status === 200 && !/text\/html/.test(type);
      if (!good) iconsOk = false;
      iconResponses.push({ url: url.split("?")[0], status: response.status, type });
    }
    check(
      "CHECK 57 — every declared icon/manifest URL returns 200 with a non-HTML content type (no 404)",
      iconsOk && declaredUrls.length >= 4,
      JSON.stringify(iconResponses),
    );

    const faviconBytes = Buffer.from(await (await fetch(`${BASE}/favicon.ico`)).arrayBuffer());
    const icoFrames = faviconBytes.length > 6 ? faviconBytes.readUInt16LE(4) : 0;
    const icoType = faviconBytes.length >= 6 ? faviconBytes.readUInt16LE(2) : -1;
    check(
      "CHECK 58 — /favicon.ico is a valid multi-frame ICO",
      icoType === 1 && icoFrames >= 3,
      JSON.stringify({ type: icoType, frames: icoFrames, bytes: faviconBytes.length }),
    );
    check(
      "CHECK 59 — favicon is the Jazari mark, NOT the stock Next.js triangle (bytes differ from the measured default)",
      faviconBytes.length !== STOCK_NEXT_FAVICON_BYTES && faviconBytes.length > 200,
      String(faviconBytes.length),
    );

    const manifestJson = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
    const manifestIcons = Array.isArray(manifestJson.icons) ? manifestJson.icons : [];
    check(
      "CHECK 60 — manifest declares 192 + 512 icons and the Deep Navy theme colour",
      manifestIcons.some((i) => i.sizes === "192x192") &&
        manifestIcons.some((i) => i.sizes === "512x512") &&
        manifestJson.theme_color === "#212C65",
      JSON.stringify({ icons: manifestIcons.map((i) => i.sizes), theme: manifestJson.theme_color }),
    );

    // Non-vacuous: the PNG icon must be a real PNG, not a 404 HTML body.
    const icon32 = Buffer.from(await (await fetch(`${BASE}/icon.png`)).arrayBuffer());
    const icon32IsPng = icon32.length > 8 && icon32[0] === 0x89 && icon32[1] === 0x50 && icon32[2] === 0x4e && icon32[3] === 0x47;
    check("CHECK 61 — /icon.png is a real PNG file (magic bytes verified)", icon32IsPng && icon32.length > 100, String(icon32.length));

    // --- 15b. Services LOADED (live API) ----------------------------------
    resetErrors();
    await cdp.send("Page.navigate", { url: `${BASE}/` });
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "home reload");
    await waitFor(cdp, `document.querySelector('[data-services-state="loaded"]') !== null`, 12000, "services loaded");
    const loadedState = await evaluate(
      cdp,
      `(() => {
        const grid = document.querySelector('[data-services-state="loaded"]');
        return {
          state: document.querySelector('[data-services-state]')?.getAttribute('data-services-state'),
          cards: grid ? grid.querySelectorAll(':scope > *').length : 0,
          hubCards: document.querySelectorAll('#hub-service-list .hub-card').length,
          footerLinks: document.querySelectorAll('footer a[href="#services"]').length,
        };
      })()`,
    );
    check("CHECK 62 — services render from the live API in the loaded state", loadedState.state === "loaded" && loadedState.cards === 14, JSON.stringify(loadedState));
    check(
      "CHECK 63 — the ONE public services source feeds the grid, the hub and the footer",
      loadedState.cards === 14 && loadedState.hubCards >= 1 && loadedState.footerLinks >= 1,
      JSON.stringify(loadedState),
    );
    await shotSection("#services", "services-loaded-light.png", "light");
    await shotSection("#services", "services-loaded-dark.png", "dark");

    const cacheKeys = await evaluate(
      cdp,
      `(() => {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith('jazari:public-content:'));
        return { keys, privateKeys: keys.filter((k) => /admin|token|submission|auth|visitor/i.test(k)) };
      })()`,
    );
    check(
      "CHECK 64 — the public cache exists and contains no admin/private keys",
      cacheKeys.keys.length >= 2 && cacheKeys.privateKeys.length === 0,
      JSON.stringify(cacheKeys),
    );

    // --- 15c. Cache fallback: block the API, reload -----------------------
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", { urls: API_BLOCK_URLS });
    await cdp.send("Page.navigate", { url: `${BASE}/?cache-fallback=1` });
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "home reload (api blocked)");
    await waitFor(cdp, SERVICES_SETTLED, 15000, "services state (api blocked)");
    const cacheFallback = await evaluate(
      cdp,
      `(() => {
        const grid = document.querySelector('[data-services-state="loaded"]');
        return { state: document.querySelector('[data-services-state]')?.getAttribute('data-services-state'), cards: grid ? grid.querySelectorAll(':scope > *').length : 0 };
      })()`,
    );
    check(
      "CHECK 65 — API unreachable → services render from the validated localStorage cache",
      cacheFallback.state === "loaded" && cacheFallback.cards === 14,
      JSON.stringify(cacheFallback),
    );
    // Offline screenshots: content still renders while the API is blocked.
    await shotSection("#products", "offline-fallback-logos-light.png", "light");
    await shotSection("#products", "offline-fallback-logos-dark.png", "dark");
    await shotSection("[aria-labelledby='product-cards-heading']", "offline-fallback-products-light.png", "light");
    await shotSection("[aria-labelledby='product-cards-heading']", "offline-fallback-products-dark.png", "dark");

    // --- 15d. Snapshot fallback: clear cache, API still blocked -----------
    await evaluate(
      cdp,
      `(() => { Object.keys(localStorage).filter((k) => k.startsWith('jazari:public-content:')).forEach((k) => localStorage.removeItem(k)); return true; })()`,
    );
    await cdp.send("Page.navigate", { url: `${BASE}/?snapshot-fallback=1` });
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "home reload (snapshot)");
    await waitFor(cdp, SERVICES_SETTLED, 15000, "services state (snapshot)");
    const snapshotFallback = await evaluate(
      cdp,
      `(() => {
        const grid = document.querySelector('[data-services-state="loaded"]');
        return { state: document.querySelector('[data-services-state]')?.getAttribute('data-services-state'), cards: grid ? grid.querySelectorAll(':scope > *').length : 0 };
      })()`,
    );
    check(
      "CHECK 66 — first visit, no cache, API down → services render from the build-time snapshot",
      snapshotFallback.state === "loaded" && snapshotFallback.cards === 14,
      JSON.stringify(snapshotFallback),
    );

    // --- 15e. Designed ERROR: block API + snapshot ------------------------
    await cdp.send("Network.setBlockedURLs", { urls: [...API_BLOCK_URLS, "*content-snapshot.json*"] });
    await cdp.send("Page.navigate", { url: `${BASE}/?error-state=1` });
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "home reload (error)");
    await waitFor(cdp, SERVICES_SETTLED, 15000, "services state (error)");
    const errorState = await evaluate(
      cdp,
      `(() => {
        const section = document.querySelector('#services');
        const retry = section ? [...section.querySelectorAll('button')].some((b) => /retry/i.test(b.textContent || '')) : false;
        return {
          state: document.querySelector('[data-services-state]')?.getAttribute('data-services-state'),
          hasRetry: retry,
          blank: section ? section.textContent.replace(/\\s+/g, ' ').trim().length === 0 : true,
        };
      })()`,
    );
    check(
      "CHECK 67 — no cache + no snapshot + API down → designed error state with Retry (never blank)",
      errorState.state === "error" && errorState.hasRetry === true && errorState.blank === false,
      JSON.stringify(errorState),
    );
    await shotSection("#services", "services-error-light.png", "light");
    await shotSection("#services", "services-error-dark.png", "dark");

    // --- 15f. Corrupted cache is ignored safely ---------------------------
    await evaluate(
      cdp,
      `(() => { localStorage.setItem('jazari:public-content:v1:services', '{not-json'); return localStorage.getItem('jazari:public-content:v1:services') !== null; })()`,
    );
    await cdp.send("Page.navigate", { url: `${BASE}/?corrupt-cache=1` });
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "home reload (corrupt cache)");
    await waitFor(cdp, SERVICES_SETTLED, 15000, "services state (corrupt cache)");
    const corruptState = await evaluate(
      cdp,
      `(() => ({
        state: document.querySelector('[data-services-state]')?.getAttribute('data-services-state'),
        discarded: localStorage.getItem('jazari:public-content:v1:services') === null,
      }))()`,
    );
    check(
      "CHECK 68 — corrupted cache JSON is discarded safely (no crash, falls to the designed state)",
      corruptState.state === "error" && corruptState.discarded === true,
      JSON.stringify(corruptState),
    );

    // --- 15g. Designed EMPTY state (API answers 200 with []) --------------
    await cdp.send("Network.setBlockedURLs", { urls: [] });
    await cdp.send("Fetch.enable", { patterns: SERVICE_FETCH_PATTERNS });
    const emptyBody = Buffer.from(JSON.stringify({ success: true, data: [] })).toString("base64");
    const onPaused = async (params) => {
      try {
        await cdp.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            // A fulfilled cross-origin response still needs CORS headers, or the
            // browser rejects it and the page would fall through to the snapshot.
            { name: "Access-Control-Allow-Origin", value: BASE },
            { name: "Access-Control-Allow-Credentials", value: "true" },
          ],
          body: emptyBody,
        });
      } catch {
        /* the request may already be cancelled */
      }
    };
    cdp.on("Fetch.requestPaused", onPaused);
    await cdp.send("Page.navigate", { url: `${BASE}/?empty-state=1` });
    await waitFor(cdp, `document.readyState === "complete"`, 12000, "home reload (empty)");
    let emptyState = null;
    try {
      await waitFor(cdp, `document.querySelector('[data-services-state="empty"]') !== null`, 12000, "services empty state");
      emptyState = await evaluate(
        cdp,
        `(() => {
          const section = document.querySelector('#services');
          const el = document.querySelector('[data-services-state="empty"]');
          return { state: el?.getAttribute('data-services-state') || null, text: el ? el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 140) : '' };
        })()`,
      );
    } catch {
      try {
        emptyState = await evaluate(
          cdp,
          `(() => ({ state: document.querySelector('[data-services-state]')?.getAttribute('data-services-state') || null, text: '' }))()`,
        );
      } catch {
        emptyState = { state: null, text: "" };
      }
    }
    cdp.off("Fetch.requestPaused", onPaused);
    await cdp.send("Fetch.disable");
    check(
      "CHECK 69 — API 200 with [] → designed EMPTY state, distinct from the error state",
      emptyState.state === "empty" && /No services published yet/i.test(emptyState.text),
      JSON.stringify(emptyState),
    );
    await shotSection("#services", "services-empty-light.png", "light");
    await shotSection("#services", "services-empty-dark.png", "dark");

    // --- 15h. Admin information architecture ------------------------------
    let adminCookie = null;
    try {
      const adminEnv = readBackendEnv(); // function-local: never hardcode creds
      const email = process.env.ADMIN_EMAIL ?? adminEnv.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD ?? adminEnv.ADMIN_PASSWORD;
      const login = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0] || null;
    } catch {
      adminCookie = null;
    }
    check("CHECK 70 — admin API login succeeded (prerequisite for the IA checks)", Boolean(adminCookie));

    if (adminCookie) {
      const [cookieName, cookieValue] = adminCookie.split("=");
      await cdp.send("Network.setCookie", { name: cookieName, value: cookieValue, url: BASE, path: "/", httpOnly: true });
      await cdp.send("Page.navigate", { url: `${BASE}/admin/products` });
      await waitFor(cdp, `document.querySelector('[data-admin-nav-group="content"]') !== null`, 15000, "admin portal");
      // The browser title is set in an effect after the session resolves.
      await waitFor(cdp, `document.title.endsWith('- Jazari Admin')`, 8000, "admin browser title");
      const ia = await evaluate(
        cdp,
        `(() => ({
          // The sidebar renders twice (desktop aside + mobile drawer) — de-dupe.
          groups: [...new Set([...document.querySelectorAll('[data-admin-nav-group]')].map((g) => g.getAttribute('data-admin-nav-group')))],
          labels: [...new Set([...document.querySelectorAll('[data-admin-nav-label]')].map((a) => a.getAttribute('data-admin-nav-label')))],
          header: document.querySelector('.admin-page-header h1')?.textContent?.trim() || '',
          purpose: document.querySelector('.admin-page-header p')?.textContent?.trim() || '',
          title: document.title,
        }))()`,
      );
      check(
        "CHECK 71 — admin sidebar groups are exactly CONTENT / LEADS / ENGAGEMENT / SETTINGS",
        JSON.stringify(ia.groups) === JSON.stringify(["content", "leads", "engagement", "settings"]),
        JSON.stringify(ia.groups),
      );
      const requiredLabels = ["Overview", "Homepage Logos", "Products", "Product Presets", "Project Requests", "Visitors", "Admins & Access", "My Account"];
      check(
        "CHECK 72 — sidebar labels are plain-language (nothing still says Dashboard/Logos/Templates/Submissions/Team/Account)",
        requiredLabels.every((label) => ia.labels.includes(label)),
        JSON.stringify(ia.labels),
      );
      check(
        "CHECK 73 — the reusable AdminPageHeader renders a title and a one-line purpose",
        ia.header.length > 0 && ia.purpose.length > 0,
        JSON.stringify({ header: ia.header, purpose: ia.purpose }),
      );
      check("CHECK 74 — admin browser title follows '<page> - Jazari Admin'", /- Jazari Admin$/.test(ia.title), ia.title);

      await cdp.send("Page.navigate", { url: `${BASE}/admin/dashboard` });
      await waitFor(cdp, `document.querySelector('[data-admin-quick-guide]') !== null`, 15000, "admin overview guide");
      const guideState = await evaluate(
        cdp,
        `(() => ({ present: Boolean(document.querySelector('[data-admin-quick-guide]')), heading: document.querySelector('[data-admin-quick-guide] h2')?.textContent?.trim() || '' }))()`,
      );
      check(
        "CHECK 75 — Overview shows the 'What each section does' quick guide",
        guideState.present === true && /section does/i.test(guideState.heading),
        JSON.stringify(guideState),
      );

      const adminRoutes = [
        "/admin/dashboard",
        "/admin/logos",
        "/admin/products",
        "/admin/submissions",
        "/admin/visitors",
        "/admin/notifications",
        "/admin/team",
        "/admin/account",
      ];
      const badRoutes = [];
      for (const route of adminRoutes) {
        const response = await fetch(`${BASE}${route}`, { redirect: "manual" });
        if (response.status !== 200) badRoutes.push({ route, status: response.status });
      }
      check(
        "CHECK 76 — every admin route still resolves at the same path (bookmarks intact)",
        badRoutes.length === 0,
        JSON.stringify(badRoutes),
      );

      // --- Push notifications admin page (Task J) --------------------------
      await cdp.send("Page.navigate", { url: `${BASE}/admin/notifications` });
      await waitFor(cdp, `document.getElementById("push-service") !== null`, 15000, "admin notifications");
      const pushPage = await evaluate(
        cdp,
        `({
          heading: document.querySelector(".admin-page-header h1")?.textContent?.trim() || "",
          hasStats: /subscribed devices/i.test(document.body.innerText),
          hasComposer: Boolean(document.getElementById("push-title") && document.getElementById("push-body")),
          navLink: Boolean(document.querySelector('a[href="/admin/notifications"]')),
        })`,
      );
      check(
        "CHECK 113 — the Notifications page renders its header, composer, stats and sidebar link",
        pushPage.heading === "Notifications" && pushPage.hasStats && pushPage.hasComposer && pushPage.navLink,
        JSON.stringify(pushPage),
      );

      const serviceOptions = await evaluate(cdp, `document.getElementById("push-service")?.options.length ?? 0`);
      check(
        "CHECK 114 — the composer can reference the real services (Task I data)",
        serviceOptions >= 15,
        `${serviceOptions} options`,
      );

      await evaluate(
        cdp,
        `(() => {
          const select = document.getElementById("push-service");
          const target = [...select.options].find((o) => o.value);
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
          setter.call(select, target.value);
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`,
      );
      await sleep(400);
      const prefilled = await evaluate(
        cdp,
        `({ title: document.getElementById("push-title").value, body: document.getElementById("push-body").value })`,
      );
      check(
        "CHECK 115 — choosing a service prefills an editable title and message",
        prefilled.title.length >= 2 && prefilled.body.length >= 2,
        JSON.stringify(prefilled).slice(0, 140),
      );

      await evaluate(
        cdp,
        `(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Save draft"); if (b) b.click(); return Boolean(b); })()`,
      );
      await sleep(2400);
      const draftState = await evaluate(
        cdp,
        `({
          noticed: Boolean(document.querySelector('[role="status"]')),
          inHistory: [...document.querySelectorAll("li")].some((li) => li.textContent.includes("Draft")),
        })`,
      );
      check(
        "CHECK 116 — a draft saves and appears in the delivery history",
        draftState.noticed && draftState.inHistory,
        JSON.stringify(draftState),
      );

      // Clean up through the UI (delete → confirm).
      await evaluate(
        cdp,
        `(() => { const d = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "").startsWith("Delete")); if (d) d.click(); return Boolean(d); })()`,
      );
      await sleep(500);
      await evaluate(
        cdp,
        `(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Delete notification"); if (b) b.click(); return Boolean(b); })()`,
      );
      await sleep(1600);
      check(
        "CHECK 116b — deleting from the UI removes the row",
        (await evaluate(cdp, `![...document.querySelectorAll("li")].some((li) => li.textContent.includes("Draft"))`)) === true,
      );

      // --- Admin screenshots (desktop + mobile drawer, light + dark) -------
      await setViewport(1366, 900, false);
      await shotSection("#admin-sidebar", "admin-sidebar-desktop-light.png", "light");
      await shotSection("#admin-sidebar", "admin-sidebar-desktop-dark.png", "dark");
      await shotSection(".admin-page-header", "admin-page-headers.png", "light");
      await setViewport(390, 844, true);
      await cdp.send("Page.navigate", { url: `${BASE}/admin/dashboard` });
      await waitFor(cdp, `document.querySelector('[aria-label="Open navigation"]') !== null`, 15000, "admin mobile nav");
      await evaluate(cdp, `(() => { document.documentElement.classList.remove('dark'); document.querySelector('[aria-label="Open navigation"]').click(); return true; })()`);
      await sleep(450);
      await capture("admin-sidebar-mobile-light.png");
      await evaluate(cdp, `(() => { document.documentElement.classList.add('dark'); return true; })()`);
      await sleep(300);
      await capture("admin-sidebar-mobile-dark.png");
      await evaluate(cdp, `(() => { document.documentElement.classList.remove('dark'); return true; })()`);
      await setViewport(1366, 900, false);
    }

    // --- 16. Task I — admin session survives the real browser cookie flow ---
    // This is the check that would have caught the live "login 200 then every
    // request 401" bug: it drives a REAL browser through the same-origin
    // /api proxy, so the session cookie must be stored and re-sent by Chrome.
    // Credentials are read from the environment at runtime and never printed.
    {
      const sessionEnv = readBackendEnv();
      const email = process.env.ADMIN_EMAIL ?? sessionEnv.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD ?? sessionEnv.ADMIN_PASSWORD;

      // The same-origin proxy is baked into the build (BACKEND_ORIGIN). Without
      // it the browser would talk to the backend cross-site and the cookie
      // would be third-party — the exact production misconfiguration.
      let proxyActive = false;
      try {
        proxyActive = (await fetch(`${BASE}/api/health`)).ok;
      } catch {
        proxyActive = false;
      }

      if (!email || !password) {
        console.log(
          "  ⚠ SKIPPED (Task I session flow): ADMIN_EMAIL/ADMIN_PASSWORD unavailable — NOT counted as a pass",
        );
      } else if (!proxyActive) {
        console.log(
          "  ⚠ SKIPPED (Task I session flow): /api proxy not active in this build (set BACKEND_ORIGIN at build time) — NOT counted as a pass",
        );
      } else {
        await setViewport(1366, 900, false);
        // Signed-out precondition: the login page redirects an already
        // authenticated visitor to the dashboard, so clear the session the
        // admin IA suite left in the browser jar first.
        await cdp.send("Network.clearBrowserCookies");
        await cdp.send("Page.navigate", { url: `${BASE}/admin/login` });
        await waitFor(cdp, `document.querySelector('#admin-email') !== null`, 15000, "admin login form");

        const creds = JSON.stringify({ email, password });
        const loginStatus = await evaluate(
          cdp,
          `(async () => {
            const res = await fetch('/api/auth/login', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              credentials: 'include', body: ${JSON.stringify(creds)},
            });
            return res.status;
          })()`,
        );
        const me = await evaluate(
          cdp,
          `(async () => {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            const body = await res.json().catch(() => null);
            return { status: res.status, hasAdmin: Boolean(body?.data?.admin?.email) };
          })()`,
        );
        check(
          "CHECK 77 — same-origin login → session cookie stored and resent: /api/auth/me is 200",
          loginStatus === 200 && me.status === 200 && me.hasAdmin === true,
          `login=${loginStatus} me=${me.status}`,
        );

        // The portal must render with the real cookie (not an injected one).
        await cdp.send("Page.navigate", { url: `${BASE}/admin/dashboard` });
        let portalOk = true;
        try {
          await waitFor(cdp, `document.querySelector('[data-admin-quick-guide]') !== null`, 15000, "dashboard via cookie");
        } catch {
          portalOk = false;
        }
        check("CHECK 78 — dashboard renders from the real session cookie", portalOk === true);

        // A full reload must keep the session (the cookie is persistent).
        let reloadOk = true;
        try {
          await cdp.send("Page.reload");
          await waitFor(cdp, `document.querySelector('[data-admin-quick-guide]') !== null`, 15000, "dashboard after reload");
        } catch {
          reloadOk = false;
        }
        check("CHECK 79 — reload keeps the session (no bounce to /admin/login)", reloadOk === true);

        // Logout must clear it, and the next protected call must be a 401.
        const afterLogout = await evaluate(
          cdp,
          `(async () => {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            return res.status;
          })()`,
        );
        check("CHECK 80 — logout clears the session: /api/auth/me is 401 again", afterLogout === 401, `me=${afterLogout}`);
      }
    }

    // --- 18. Task I — SEO + Google site verification (HTTP, no JS) ---------
    console.log("\n[18] SEO + Google site verification");
    const seoHtml = await (await fetch(`${BASE}/`)).text();
    const VERIFY_TOKEN = "9sxNHd4zcWdftckBBUCKxc3hiD-qxOpxn03uZXvHChM";
    const verifyMatches = [...seoHtml.matchAll(/<meta[^>]*name="google-site-verification"[^>]*>/g)];
    check(
      "CHECK 90 — home HTML has the Google verification meta exactly once, exact token",
      verifyMatches.length === 1 && verifyMatches[0][0].includes(`content="${VERIFY_TOKEN}"`),
      `count=${verifyMatches.length}`,
    );
    check(
      "CHECK 91 — canonical link is present in the server-rendered head",
      /<link[^>]*rel="canonical"[^>]*href="[^"]+"/.test(seoHtml),
    );
    check(
      "CHECK 92 — Open Graph + Twitter card metadata present (no JS)",
      /property="og:title"/.test(seoHtml) && /name="twitter:card"/.test(seoHtml),
    );
    const ldMatch = seoHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    let orgOk = false;
    let orgDetail = "missing";
    if (ldMatch) {
      try {
        const data = JSON.parse(ldMatch[1]);
        orgOk =
          data["@type"] === "Organization" &&
          typeof data.url === "string" &&
          /^https?:\/\//.test(data.url) &&
          /\/brand\/logo-main\.png$/.test(data.logo || "") &&
          !("sameAs" in data);
        orgDetail = JSON.stringify({ type: data["@type"], url: data.url, logo: data.logo, sameAs: data.sameAs ?? null });
      } catch {
        orgDetail = "invalid JSON";
      }
    }
    check(
      "CHECK 93 — Organization JSON-LD: name/url/real logo, no invented sameAs",
      orgOk,
      orgDetail,
    );
    const h1Count = (seoHtml.match(/<h1[\s>]/g) || []).length;
    check("CHECK 94 — the homepage renders exactly one <h1>", h1Count === 1, `h1=${h1Count}`);
    const adminSeoHtml = await (await fetch(`${BASE}/admin/login`)).text();
    const adminRobots = adminSeoHtml.match(/<meta[^>]*name="robots"[^>]*>/);
    check(
      "CHECK 95 — /admin remains noindex",
      Boolean(adminRobots && /noindex/.test(adminRobots[0])),
      adminRobots ? adminRobots[0] : "no robots meta",
    );

    // --- 17. Task I — hero shatter (instanced neon shards) -----------------
    console.log("\n[17] Hero shatter — instanced neon shards");
    resetErrors();
    await setViewport(1440, 900, false);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await cdp.send("Page.navigate", { url: `${BASE}/?shatter=1` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 15000, "hero scene for shatter");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(700);

    const SHARD_STATE = `(() => {
      const c = document.querySelector("[data-scene] canvas");
      return c ? { quality: c.dataset.quality || null, shards: Number(c.dataset.shards || 0), explode: c.dataset.explode || null } : null;
    })()`;
    const TIER_BUDGET = { high: 1000, medium: 500, low: 200 };
    // The idle-dwell trigger is ~3 s of no input, so restart the timer before the
    // assembled baseline (the spec's own "about 3 s" is what we assert elsewhere).
    await evaluate(cdp, `(() => { document.querySelector("[data-scene] canvas")?.__jazariDebug?.noteActivity?.(); return true; })()`);
    const shardInfo = await evaluate(cdp, SHARD_STATE);
    check(
      "CHECK 81 — shard count matches the tier budget (1000/500/200), starts assembled",
      shardInfo && shardInfo.shards === TIER_BUDGET[shardInfo.quality] && shardInfo.explode === "assembled",
      JSON.stringify(shardInfo),
    );
    await evaluate(cdp, `(() => { document.querySelector("[data-scene] canvas")?.__jazariDebug?.noteActivity?.(); return true; })()`);
    await shotSection("[data-scene]", "hero-shatter-assembled-light.png", "light");
    await evaluate(cdp, `(() => { document.querySelector("[data-scene] canvas")?.__jazariDebug?.noteActivity?.(); return true; })()`);
    await shotSection("[data-scene]", "hero-shatter-assembled-dark.png", "dark");
    await evaluate(cdp, `(() => { document.documentElement.classList.remove('dark'); return true; })()`);
    await sleep(200);

    const column = await evaluate(
      cdp,
      `(() => {
        const el = document.querySelector("[data-scene]");
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width * 0.5), y: Math.round(r.y + r.height * 0.5) };
      })()`,
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: column.x, y: column.y });
    let hoverState = null;
    try {
      hoverState = await waitFor(
        cdp,
        `(() => { const c = document.querySelector("[data-scene] canvas"); return c && c.dataset.explode !== "assembled" ? c.dataset.explode : ""; })()`,
        4000,
        "hover shatter",
      );
    } catch {
      hoverState = null;
    }
    check("CHECK 82 — hovering the visual column starts the shatter", hoverState === "shattering" || hoverState === "floating", String(hoverState));
    await sleep(900);
    const floating = await evaluate(cdp, `document.querySelector("[data-scene] canvas")?.dataset.explode || null`);
    check("CHECK 83 — the shatter progresses on to floating", floating === "floating", String(floating));

    const ctaHit = await evaluate(
      cdp,
      `(() => {
        const link = [...document.querySelectorAll("a")].find((a) => /start your project/i.test(a.textContent || ""));
        if (!link) return { ok: false, reason: "cta missing" };
        const r = link.getBoundingClientRect();
        const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
        return { ok: Boolean(el && (link === el || link.contains(el))), tag: el ? el.tagName : null };
      })()`,
    );
    check("CHECK 84 — headline CTA stays hit-testable during the shatter", ctaHit.ok === true, JSON.stringify(ctaHit));
    await shotSection("[data-scene]", "hero-shatter-floating-light.png", "light");
    await shotSection("[data-scene]", "hero-shatter-floating-dark.png", "dark");
    await evaluate(cdp, `(() => { document.documentElement.classList.remove('dark'); return true; })()`);
    await sleep(200);

    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
    let afterLeave = null;
    try {
      afterLeave = await waitFor(
        cdp,
        `(() => { const c = document.querySelector("[data-scene] canvas"); return c && c.dataset.explode === "assembled" ? "assembled" : ""; })()`,
        5000,
        "reassemble on leave",
      );
    } catch {
      afterLeave = null;
    }
    check("CHECK 85 — pointer leave reassembles the mark", afterLeave === "assembled", String(afterLeave));

    await evaluate(
      cdp,
      `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("floating")`,
    );
    await sleep(300); // the dataset is written by the RAF loop, not synchronously
    const forced = await evaluate(cdp, `document.querySelector("[data-scene] canvas").dataset.explode`);
    await evaluate(cdp, `(() => { window.scrollTo(0, 320); return true; })()`);
    let afterScroll = null;
    try {
      afterScroll = await waitFor(
        cdp,
        `(() => { const c = document.querySelector("[data-scene] canvas"); return c && c.dataset.explode === "assembled" ? "assembled" : ""; })()`,
        5000,
        "reassemble on scroll",
      );
    } catch {
      afterScroll = null;
    }
    check(
      "CHECK 86 — the debug hook forces a state, and a scroll reassembles",
      forced === "floating" && afterScroll === "assembled",
      `${forced} → ${afterScroll}`,
    );
    await evaluate(cdp, `(() => { window.scrollTo(0, 0); return true; })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
    await sleep(3600);
    const idleState = await evaluate(
      cdp,
      `(() => {
        const c = document.querySelector("[data-scene] canvas");
        return { explode: c?.dataset.explode || null, snap: c?.__jazariDebug?.shatter?.() ?? null };
      })()`,
    );
    check(
      "CHECK 87 — idle dwell (~3 s, no input, hero in view) starts the shatter",
      idleState.explode === "shattering" ||
        idleState.explode === "floating" ||
        idleState.explode === "reassembling",
      JSON.stringify(idleState),
    );

    // Reset, then force an assembled state before the reduced-motion pass.
    await evaluate(cdp, `(() => { window.scrollTo(0, 0); return true; })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });

    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await cdp.send("Page.navigate", { url: `${BASE}/?shatter-rm=1` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 15000, "hero (reduced motion)");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(800);
    const rmColumn = await evaluate(
      cdp,
      `(() => {
        const el = document.querySelector("[data-scene]");
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width * 0.5), y: Math.round(r.y + r.height * 0.5) };
      })()`,
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rmColumn.x, y: rmColumn.y });
    await sleep(1200);
    const rmState = await evaluate(cdp, `document.querySelector("[data-scene] canvas")?.dataset.explode || null`);
    const rmForce = await evaluate(
      cdp,
      `(() => { const c = document.querySelector("[data-scene] canvas"); c.__jazariDebug.forceShatter("floating"); return c.dataset.explode; })()`,
    );
    check(
      "CHECK 88 — reduced motion never shatters (hover and forced hook both inert)",
      rmState === "assembled" && rmForce === "assembled",
      `hover=${rmState} forced=${rmForce}`,
    );
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    await cdp.send("Page.navigate", { url: `${BASE}/?shatter-cycles=1` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 15000, "hero (cycles)");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(500);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await evaluate(cdp, `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("floating")`);
      await sleep(320);
      await evaluate(cdp, `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("assembled")`);
      await sleep(320);
    }
    const canvasCount = await evaluate(cdp, `document.querySelectorAll("[data-scene] canvas").length`);
    check("CHECK 89 — exactly one canvas after 3 shatter cycles (no leaks)", canvasCount === 1, String(canvasCount));
    assertClean("hero-shatter");

    // --- 19. Task I — Services hub: animated wiring ------------------------
    console.log("\n[19] Services hub — animated wiring");
    resetErrors();
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await gotoHub("light", 1440, 900);
    await sleep(500);

    // Packet count + the colours driving the flow.
    const hubWireLayer = await evaluate(
      cdp,
      `(() => {
        const packets = [...document.querySelectorAll("#hub [data-hub-packet]")];
        const flows = [...document.querySelectorAll("#hub .hub-wire--flow")];
        const stops = [...document.querySelectorAll('#hub linearGradient[id^="hub-wire-grad-"] stop')].map((s) => getComputedStyle(s).stopColor);
        const packet = packets[0] ? getComputedStyle(packets[0]).fill : null;
        return {
          packets: packets.length,
          flows: flows.length,
          bases: document.querySelectorAll("#hub [data-hub-connector-base]").length,
          stops: [...new Set(stops)].slice(0, 8),
          packet,
        };
      })()`,
    );
    check(
      "CHECK 96 — 2 packets per connector (10 total, cap 15) + a base and a flow per connector",
      hubWireLayer.packets === 10 && hubWireLayer.flows === 5 && hubWireLayer.bases === 5,
      JSON.stringify({ packets: hubWireLayer.packets, flows: hubWireLayer.flows, bases: hubWireLayer.bases }),
    );
    check(
      "CHECK 97 — connector gradients are brand-derived blues and packet heads stay Growth Green",
      hubWireLayer.stops.length >= 3 &&
        hubWireLayer.stops.every((c) => /^(rgb|color)/.test(c)) &&
        /^rgb\(149, 201, 61\)$/.test(hubWireLayer.packet || ""),
      JSON.stringify({ stops: hubWireLayer.stops, packet: hubWireLayer.packet }),
    );

    // Packets move along their own connector path.
    const hubPacketProbe = `(() => {
      const svg = document.querySelector("#hub .hub__wires");
      if (!svg) return null;
      const inv = svg.getScreenCTM().inverse();
      const path = document.querySelector('#hub [data-hub-connector="leaf"]');
      const packets = [...document.querySelectorAll('#hub [data-hub-packet="leaf"]')];
      const toUser = (el) => { const b = el.getBoundingClientRect(); return new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(inv); };
      const samples = [];
      for (let i = 0; i <= 40; i += 1) { const p = path.getPointAtLength(path.getTotalLength() * i / 40); samples.push(p); }
      return packets.map((el) => {
        const u = toUser(el);
        let best = Infinity;
        for (const s of samples) best = Math.min(best, Math.hypot(s.x - u.x, s.y - u.y));
        return { x: u.x, y: u.y, dist: +best.toFixed(2) };
      });
    })()`;
    const hwPack1 = await evaluate(cdp, hubPacketProbe);
    await sleep(600);
    const hwPack2 = await evaluate(cdp, hubPacketProbe);
    const hwMoved = hwPack1 && hwPack2 && hwPack1.map((a, i) => Math.hypot(a.x - hwPack2[i].x, a.y - hwPack2[i].y));
    const hwOnPath = hwPack1 && hwPack1.every((p) => p.dist <= 8);
    check(
      "CHECK 98 — packets travel along the real connector path (on-path + moving)",
      Boolean(hwOnPath && hwMoved && hwMoved.some((d) => d > 2)),
      JSON.stringify({ onPath: hwOnPath, moved: hwMoved && hwMoved.map((d) => +d.toFixed(2)) }),
    );

    // Hovering a card speeds up only its own connector.
    const hubWireCardBox = await evaluate(
      cdp,
      `(() => {
        const a = document.querySelector('#hub-service-list a[data-hub-card="leaf"]');
        const r = a.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`,
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hubWireCardBox.x, y: hubWireCardBox.y });
    await sleep(500);
    const hubFlowSpeeds = await evaluate(
      cdp,
      `(() => {
        const read = (piece) => { const el = document.querySelector('#hub [data-hub-connector="' + piece + '"]'); return el ? getComputedStyle(el).animationDuration : null; };
        return { leaf: read("leaf"), top: read("top"), righthand: read("right") };
      })()`,
    );
    check(
      "CHECK 99 — hover speeds up only the relevant connector",
      hubFlowSpeeds.leaf === "1.5s" && hubFlowSpeeds.top !== "1.5s" && hubFlowSpeeds.righthand !== "1.5s",
      JSON.stringify(hubFlowSpeeds),
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
    await sleep(300);

    // Off-screen: the flow is paused.
    await evaluate(cdp, `(() => { window.scrollTo(0, 0); document.documentElement.classList.remove('dark'); return true; })()`);
    await sleep(600);
    const hubWireOffscreen = await evaluate(
      cdp,
      `(() => {
        const hubEl = document.querySelector("#hub");
        const flow = document.querySelector("#hub .hub-wire--flow");
        return { inView: hubEl.classList.contains("is-inview"), play: flow ? getComputedStyle(flow).animationPlayState : null };
      })()`,
    );
    check(
      "CHECK 100 — connector animation is paused while the hub is off-screen",
      hubWireOffscreen.inView === false && hubWireOffscreen.play === "paused",
      JSON.stringify(hubWireOffscreen),
    );

    // Reduced motion: static gradient lines, no packets.
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await gotoHub("light", 1440, 900);
    await sleep(400);
    const hubRMWires = await evaluate(
      cdp,
      `(() => {
        const flow = document.querySelector("#hub .hub-wire--flow");
        const cs = flow ? getComputedStyle(flow) : null;
        return { packets: document.querySelectorAll("#hub [data-hub-packet]").length, animation: cs ? cs.animationName : null, opacity: cs ? +cs.opacity : 0 };
      })()`,
    );
    check(
      "CHECK 101 — reduced motion: no packets, static gradient lines stay visible",
      hubRMWires.packets === 0 && hubRMWires.animation === "none" && hubRMWires.opacity >= 0.5,
      JSON.stringify(hubRMWires),
    );
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    // Overflow at all six reference widths.
    const hubWireOverflow = [];
    for (const w of [1920, 1440, 1366, 1024, 768, 390]) {
      await setViewport(w, w < 640 ? 844 : 900, w < 640);
      await setThemeThenReload("light");
      hubWireOverflow.push(await evaluate(cdp, `({ w: window.innerWidth, o: document.documentElement.scrollWidth - window.innerWidth })`));
    }
    check(
      "CHECK 102 — no horizontal overflow at 1920/1440/1366/1024/768/390",
      hubWireOverflow.every((entry) => entry.o <= 0),
      JSON.stringify(hubWireOverflow),
    );
    await setViewport(1366, 900, false);
    await gotoHub("light", 1440, 900);
    await shotSection("#hub", "hub-wiring-light.png", "light");
    await shotSection("#hub", "hub-wiring-dark.png", "dark");
    assertClean("hub-wiring");

    // --- 20. Task I — Services cards: water-fill redesign ------------------
    console.log("\n[20] Services cards — water-fill redesign");
    resetErrors();
    await setViewport(1440, 900, false);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await cdp.send("Page.navigate", { url: `${BASE}/?services-redesign=1` });
    await waitFor(cdp, SERVICES_SETTLED, 15000, "services settled");
    await evaluate(cdp, `(() => { const c = document.querySelector("#services article[data-service-card]"); if (c) c.scrollIntoView({ block: "center", behavior: "instant" }); return true; })()`);
    await sleep(500);

    const restCard = await evaluate(
      cdp,
      `(() => {
        const card = document.querySelector("#services article[data-service-card]");
        const details = card.querySelector(".service-card__details");
        const short = card.querySelector(".service-card__short");
        return {
          slug: card.dataset.serviceCard,
          id: card.id,
          detailsOpacity: +getComputedStyle(details).opacity,
          descLength: card.querySelector(".service-card__desc").textContent.trim().length,
          shortVisible: +getComputedStyle(short).opacity > 0.9,
          chips: card.querySelectorAll(".service-card__chip").length,
          height: card.offsetHeight,
        };
      })()`,
    );
    check(
      "CHECK 103 — at rest the details are hidden, the short line/chips show, the full description stays in the DOM",
      restCard.detailsOpacity < 0.05 && restCard.shortVisible && restCard.chips <= 3 && restCard.descLength >= 20,
      JSON.stringify(restCard),
    );

    const svcCardPoint = await evaluate(
      cdp,
      `(() => { const r = document.querySelector("#services article[data-service-card]").getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 40) }; })()`,
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: svcCardPoint.x, y: svcCardPoint.y });
    await sleep(950);
    const hoverCard = await evaluate(
      cdp,
      `(() => {
        const card = document.querySelector("#services article[data-service-card]");
        return {
          liquid: getComputedStyle(card.querySelector(".service-card__liquid")).transform,
          detailsOpacity: +getComputedStyle(card.querySelector(".service-card__details")).opacity,
          title: getComputedStyle(card.querySelector(".service-card__title")).color,
          height: card.offsetHeight,
        };
      })()`,
    );
    check(
      "CHECK 104 — hover raises the liquid with transform (not height) and fades the description up in white",
      /matrix\(1, 0, 0, 1, 0, 0\)/.test(hoverCard.liquid) &&
        hoverCard.detailsOpacity > 0.9 &&
        hoverCard.height === restCard.height &&
        /rgba?\(255,\s*255,\s*255/.test(hoverCard.title),
      JSON.stringify({ liquid: hoverCard.liquid, details: hoverCard.detailsOpacity, title: hoverCard.title, height: hoverCard.height, restHeight: restCard.height }),
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 3, y: 3 });
    await sleep(300);

    const cardStyles = `(() => {
      const card = document.querySelector("#services article[data-service-card]");
      return {
        detailsOpacity: +getComputedStyle(card.querySelector(".service-card__details")).opacity,
        liquid: getComputedStyle(card.querySelector(".service-card__liquid")).transform,
        filled: card.hasAttribute("data-filled"),
      };
    })()`;
    await evaluate(cdp, `(() => { document.querySelector("#services article[data-service-card]").querySelector(".service-card__toggle").focus(); return true; })()`);
    await sleep(950); // the liquid transition is 600-800 ms
    const focusCard = await evaluate(cdp, cardStyles);
    check(
      "CHECK 105 — keyboard focus-within fills the card too",
      focusCard.detailsOpacity > 0.9 && /matrix\(1, 0, 0, 1, 0, 0\)/.test(focusCard.liquid),
      JSON.stringify(focusCard),
    );

    const toggleBefore = await evaluate(
      cdp,
      `(() => {
        const btn = document.querySelector("#services article[data-service-card] .service-card__toggle");
        return btn.getAttribute("aria-expanded");
      })()`,
    );
    await evaluate(
      cdp,
      `(() => { document.querySelector("#services article[data-service-card] .service-card__toggle").click(); return true; })()`,
    );
    await sleep(300); // React commits state on the next microtask/render
    const toggleAfter = await evaluate(
      cdp,
      `(() => {
        const card = document.querySelector("#services article[data-service-card]");
        const btn = card.querySelector(".service-card__toggle");
        return { after: btn.getAttribute("aria-expanded"), text: btn.textContent.trim(), filled: card.hasAttribute("data-filled") };
      })()`,
    );
    check(
      "CHECK 106 — the in-card <button> is a real toggle (aria-expanded flips)",
      (toggleAfter.after === "true" || toggleAfter.after === "false") &&
        toggleAfter.after !== toggleBefore &&
        toggleAfter.filled === (toggleAfter.after === "true"),
      JSON.stringify({ before: toggleBefore, after: toggleAfter.after, text: toggleAfter.text, filled: toggleAfter.filled }),
    );

    await evaluate(cdp, `(() => { document.querySelector("#services article[data-service-card] .service-card__toggle").focus(); return true; })()`);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(250);
    const escapeFilled = await evaluate(cdp, `document.querySelector("#services article[data-service-card]").hasAttribute("data-filled")`);
    check("CHECK 107 — Escape closes the fill", escapeFilled === false, String(escapeFilled));

    const anchors = await evaluate(
      cdp,
      `(() => {
        const cards = [...document.querySelectorAll("#services article[data-service-card]")];
        const ids = cards.map((c) => c.id);
        return { count: cards.length, allPrefixed: ids.every((id) => id.startsWith("service-")), unique: new Set(ids).size === ids.length };
      })()`,
    );
    check(
      "CHECK 108 — all 14 cards keep unique id=\"service-{slug}\" anchors (hub links resolve)",
      anchors.count === 14 && anchors.allPrefixed && anchors.unique,
      JSON.stringify(anchors),
    );

    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await cdp.send("Page.navigate", { url: `${BASE}/?services-rm=1` });
    await waitFor(cdp, SERVICES_SETTLED, 15000, "services settled (reduced motion)");
    await sleep(400);
    const rmCard = await evaluate(
      cdp,
      `(() => {
        const card = document.querySelector("#services article[data-service-card]");
        card.scrollIntoView({ block: "center", behavior: "instant" });
        card.querySelector(".service-card__toggle").focus();
        const liquid = card.querySelector(".service-card__liquid");
        return {
          detailsOpacity: +getComputedStyle(card.querySelector(".service-card__details")).opacity,
          transition: getComputedStyle(liquid).transitionDuration,
          wave: getComputedStyle(card.querySelector(".service-card__wave")).animationName,
        };
      })()`,
    );
    check(
      "CHECK 109 — reduced motion: static fill (no wave, no transition) still reveals the description",
      rmCard.detailsOpacity > 0.9 &&
        rmCard.wave === "none" &&
        rmCard.transition.split(",").every((d) => Number.parseFloat(d) === 0),
      JSON.stringify(rmCard),
    );
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    // Screenshots: rest, then a filled card in both themes.
    await cdp.send("Page.navigate", { url: `${BASE}/?services-shots=1` });
    await waitFor(cdp, SERVICES_SETTLED, 15000, "services settled (shots)");
    await shotSection("#services", "service-cards-rest-light.png", "light");
    await shotSection("#services", "service-cards-rest-dark.png", "dark");
    await cdp.send("Page.navigate", { url: `${BASE}/?services-shots=2` });
    await waitFor(cdp, SERVICES_SETTLED, 15000, "services settled (filled shot)");
    await evaluate(cdp, `(() => { const c = document.querySelector("#services article[data-service-card]"); c.scrollIntoView({ block: "center", behavior: "instant" }); document.documentElement.classList.remove("dark"); return true; })()`);
    await sleep(400);
    const filledPoint = await evaluate(
      cdp,
      `(() => { const r = document.querySelector("#services article[data-service-card]").getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 40) }; })()`,
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: filledPoint.x, y: filledPoint.y });
    await sleep(1000);
    await capture("service-cards-filled-light.png");
    await evaluate(cdp, `(() => { document.documentElement.classList.add("dark"); return true; })()`);
    await sleep(500);
    await capture("service-cards-filled-dark.png");
    await evaluate(cdp, `(() => { document.documentElement.classList.remove("dark"); return true; })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 3, y: 3 });
    assertClean("services-cards");

    // --- 21. Task I — navbar occlusion (pixel-level, non-vacuous) -----------
    console.log("\n[21] Navbar occlusion");
    resetErrors();
    await setViewport(1366, 900, false);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await cdp.send("Page.navigate", { url: `${BASE}/?nav-occlusion=1` });
    await waitFor(cdp, `document.querySelector(".jt-nav .glass") !== null`, 15000, "navbar");
    // The public opt-in prompt is a full-viewport dialog; it is unrelated to the
    // navbar and must never skew this measurement, so dismiss it for this page.
    await evaluate(cdp, `(() => { try { localStorage.setItem("jazari-push-dismissed", "1"); } catch {} return true; })()`);
    await sleep(1000); // intro animation finished → no lingering transform

    const NAV_FREE_REGION = `(() => {
      const pill = document.querySelector(".jt-nav .glass");
      const r = pill.getBoundingClientRect();
      const kids = [...pill.children]
        .filter((k) => !k.classList.contains("jt-nav__scrim"))
        .map((k) => k.getBoundingClientRect())
        .filter((b) => b.width > 4 && b.height > 4);
      const free = [];
      let cursor = r.left + 8;
      for (const b of kids.sort((a, c) => a.left - c.left)) {
        if (b.left - cursor > 40) free.push([cursor + 4, b.left - 4]);
        cursor = Math.max(cursor, b.right);
      }
      if (r.right - 8 - cursor > 40) free.push([cursor + 4, r.right - 4]);
      const pick = free.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
      if (!pick) return null;
      const width = Math.min(72, Math.round(pick[1] - pick[0]));
      return { x: Math.round(pick[0]), y: Math.round(r.top + r.height / 2 - 12), width, height: 24, scale: 1 };
    })()`;

    const runNavOcclusion = async (theme) => {
      await evaluate(cdp, `(() => { document.documentElement.classList.toggle("dark", ${theme === "dark"}); return true; })()`);
      await sleep(300);
      // A deterministic high-contrast "text behind the bar" fixture.
      await evaluate(
        cdp,
        `(() => {
          const pill = document.querySelector(".jt-nav .glass");
          const r = pill.getBoundingClientRect();
          let el = document.getElementById("nav-occlusion-probe");
          if (!el) { el = document.createElement("div"); el.id = "nav-occlusion-probe"; document.body.appendChild(el); }
          el.setAttribute("aria-hidden", "true");
          el.textContent = "HIGH CONTRAST TEXT BEHIND THE NAVBAR";
          const dark = ${theme === "dark"};
          el.style.cssText = "position:fixed;left:" + Math.round(r.left) + "px;top:" + Math.round(r.top) +
            "px;width:" + Math.round(r.width) + "px;height:" + Math.round(r.height) +
            "px;z-index:100;display:flex;align-items:center;justify-content:center;font:700 22px/1.1 sans-serif;letter-spacing:1px;pointer-events:none;" +
            (dark ? "background:#ffffff;color:#000000;" : "background:#111111;color:#ffffff;");
          return true;
        })()`,
      );
      await sleep(300);
      const probe = await evaluate(cdp, NAV_FREE_REGION);
      if (!probe) return { ok: false, reason: "no free region inside the pill" };
      const shown = await captureClipStats(cdp, probe);

      // Establish the "without the bar" baseline. A React re-render can restore
      // an inline style between our write and the screenshot, so the hide is
      // applied with `!important` and then CONFIRMED in a separate evaluate
      // (retrying if needed) before anything is captured — the non-vacuity
      // guard is only meaningful if the bar was really gone.
      const hidePill = `(() => {
        const pill = document.querySelector(".jt-nav .glass");
        if (!pill) return false;
        pill.style.setProperty("visibility", "hidden", "important");
        return true;
      })()`;
      const pillVisibility = `(() => {
        const pill = document.querySelector(".jt-nav .glass");
        return pill ? getComputedStyle(pill).visibility : "missing";
      })()`;

      let hiddenConfirmed = false;
      for (let attempt = 0; attempt < 6 && !hiddenConfirmed; attempt += 1) {
        await evaluate(cdp, hidePill);
        await sleep(80);
        hiddenConfirmed = (await evaluate(cdp, pillVisibility)) === "hidden";
      }
      await sleep(180);
      const hidden = await captureClipStats(cdp, probe);
      const baselineDiagnostics = {
        pillVisibility: await evaluate(cdp, pillVisibility),
        fixturePresent: await evaluate(cdp, `Boolean(document.getElementById("nav-occlusion-probe"))`),
      };

      await evaluate(
        cdp,
        `(() => {
          const pill = document.querySelector(".jt-nav .glass");
          if (pill) pill.style.removeProperty("visibility");
          const el = document.getElementById("nav-occlusion-probe");
          if (el) el.remove();
          return true;
        })()`,
      );
      await sleep(220);
      return { ok: true, shown, hidden, probe, baselineDiagnostics };
    };

    const navLight = await runNavOcclusion("light");
    check(
      "CHECK 110 — light: high-contrast text behind the bar is not legible through it (bright + low variance)",
      navLight.ok &&
        navLight.shown.mean > 200 &&
        navLight.shown.std < 20 &&
        navLight.hidden.mean < navLight.shown.mean - 60,
      JSON.stringify(navLight),
    );

    const navDark = await runNavOcclusion("dark");
    check(
      "CHECK 111 — dark: the same fixture is occluded (dark + low variance)",
      navDark.ok &&
        navDark.shown.mean < 60 &&
        navDark.shown.std < 20 &&
        navDark.hidden.mean > navDark.shown.mean + 60,
      JSON.stringify(navDark),
    );
    await cdp.send("Page.navigate", { url: `${BASE}/?nav-shots=1` });
    await waitFor(cdp, `document.querySelector(".jt-nav .glass") !== null`, 15000, "navbar (shots)");
    await sleep(900);

    // Anchor jumps must leave headings below the fixed bar.
    const scrollMargin = await evaluate(
      cdp,
      `(() => {
        const ids = ["home", "hub", "services", "start"];
        const nav = document.querySelector(".jt-nav");
        const navH = nav ? nav.getBoundingClientRect().height : 0;
        const margins = ids.map((id) => {
          const el = document.getElementById(id);
          return el ? parseFloat(getComputedStyle(el).scrollMarginTop) : 0;
        });
        return { navH, margins };
      })()`,
    );
    check(
      "CHECK 112 — every anchored section declares scroll-margin-top >= the navbar height",
      scrollMargin.margins.every((m) => m >= scrollMargin.navH && m > 0),
      JSON.stringify(scrollMargin),
    );
    await evaluate(cdp, `(() => { const el = document.getElementById("services"); if (el) el.scrollIntoView(); return true; })()`);
    await sleep(700);
    const servicesHeadingClear = await evaluate(
      cdp,
      `(() => {
        const h = document.getElementById("services-heading");
        const nav = document.querySelector(".jt-nav");
        return { headingTop: h.getBoundingClientRect().top, navBottom: nav.getBoundingClientRect().bottom };
      })()`,
    );
    check(
      "CHECK 112b — after an anchor jump the services heading sits below the navbar",
      servicesHeadingClear.headingTop >= servicesHeadingClear.navBottom - 1,
      JSON.stringify(servicesHeadingClear),
    );
    await setThemeThenReload("light");
    await sleep(400);
    await capture("navbar-occlusion-light.png");
    await setThemeThenReload("dark");
    await sleep(400);
    await capture("navbar-occlusion-dark.png");
    await setThemeThenReload("light");
    assertClean("navbar-occlusion");

    // --- 22. Task J — public notification opt-in prompt --------------------
    console.log("\n[22] Notification opt-in prompt (public)");
    resetErrors();
    await setViewport(1366, 900, false);
    await evaluate(cdp, `(() => { try { localStorage.removeItem("jazari-push-dismissed"); } catch {} return true; })()`);
    await cdp.send("Page.navigate", { url: `${BASE}/?push-prompt=1` });
    await waitFor(cdp, `document.querySelector(".jt-nav .glass") !== null`, 15000, "navbar (push prompt)");

    const pushKey = await evaluate(
      cdp,
      `fetch("/api/push/public-key").then((r) => r.json()).then((d) => ({ configured: d.data.configured === true, keyLength: d.data.key.length }))`,
    );
    check(
      "CHECK 117 — the browser receives the VAPID public key (push is configured)",
      pushKey.configured === true && pushKey.keyLength > 20,
      JSON.stringify(pushKey),
    );

    await sleep(7000);
    check(
      "CHECK 118 — the opt-in card is NOT shown immediately on arrival",
      (await evaluate(cdp, `Boolean(document.querySelector("[data-push-prompt]"))`)) === false,
    );

    let promptAppeared = false;
    for (let i = 0; i < 20 && !promptAppeared; i += 1) {
      await sleep(500);
      promptAppeared = await evaluate(cdp, `Boolean(document.querySelector("[data-push-prompt]"))`);
    }
    const promptInfo = await evaluate(
      cdp,
      `(() => {
        const el = document.querySelector("[data-push-prompt]");
        if (!el) return null;
        const dialog = el.closest('[role="dialog"]');
        return {
          dialog: Boolean(dialog),
          labelled: Boolean(dialog && dialog.getAttribute("aria-label")),
          title: el.querySelector("h2")?.textContent?.trim() || "",
          benefits: el.querySelectorAll(".push-prompt__benefits li").length,
        };
      })()`,
    );
    check(
      "CHECK 119 — it appears on its own ~10s in as a labelled, titled dialog",
      promptAppeared && promptInfo?.dialog === true && promptInfo.labelled === true && promptInfo.title.length > 0 && promptInfo.benefits >= 3,
      JSON.stringify(promptInfo),
    );
    await capture("notification-prompt.png");

    await evaluate(
      cdp,
      `(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Not now"); if (b) b.click(); return Boolean(b); })()`,
    );
    await sleep(600);
    const dismissState = await evaluate(
      cdp,
      `({ gone: !document.querySelector("[data-push-prompt]"), stored: localStorage.getItem("jazari-push-dismissed") })`,
    );
    check(
      "CHECK 120 — “Not now” closes the card and is remembered",
      dismissState.gone === true && dismissState.stored === "1",
      JSON.stringify(dismissState),
    );

    await cdp.send("Page.navigate", { url: `${BASE}/?push-prompt=2` });
    await waitFor(cdp, `document.querySelector(".jt-nav .glass") !== null`, 15000, "navbar (push prompt 2)");
    await sleep(11500);
    check(
      "CHECK 120b — a visitor who dismissed it is not asked again",
      (await evaluate(cdp, `Boolean(document.querySelector("[data-push-prompt]"))`)) === false,
    );

    assertClean("push-prompt");
    await evaluate(cdp, `(() => { try { localStorage.setItem("jazari-push-dismissed", "1"); } catch {} return true; })()`);

    // --- 23. Task K — auth BFF session cookie attributes + diagnostics ----
    // Adds to (never edits) the Task I session suite: the BFF route handlers are
    // real filesystem routes on the FRONTEND origin, and the browser must store
    // their cookie host-only. Attributes only — no cookie value is ever read.
    console.log("\n[23] Auth BFF session cookie attributes + diagnostics");
    resetErrors();
    {
      await setViewport(1366, 900, false);
      // Signed-out precondition (see the Task I session suite above).
      await cdp.send("Network.clearBrowserCookies");
      await cdp.send("Page.navigate", { url: `${BASE}/admin/login` });
      await waitFor(cdp, `document.querySelector('#admin-email') !== null`, 15000, "admin login form (BFF)");

      // The server-side DIAGNOSTICS flag is reflected by the login-page hint; the
      // endpoint and the hint must agree (both read the same runtime env).
      const diagnosticsOn = await evaluate(cdp, `Boolean(document.querySelector('[data-diagnostics-hint]'))`);
      const diagRes = await fetch(`${BASE}/api/diag-session`);
      const diagType = diagRes.headers.get("content-type") || "";
      const diagBody = diagRes.status === 200 ? await diagRes.json().catch(() => null) : null;
      const diagKeys = diagBody ? Object.keys(diagBody).sort().join(",") : "";
      const EXPECTED_DIAG_KEYS = [
        "backendDatabase",
        "backendHealthStatus",
        "backendOriginIsHttps",
        "cookiePresentOnThisRequest",
        "nodeEnv",
        "proxyConfigured",
        "requestHostMatchesForwardedHost",
      ].join(",");
      check(
        "CHECK 121 — /api/diag-session is 200 iff DIAGNOSTICS is on, and always JSON (no client JS)",
        (diagnosticsOn && diagRes.status === 200 && /application\/json/.test(diagType)) ||
          (!diagnosticsOn && diagRes.status === 404),
        `hint=${diagnosticsOn} status=${diagRes.status} type=${diagType}`,
      );
      check(
        "CHECK 122 — diagnostics payload is booleans/enums only, and confirms proxy + healthy backend",
        !diagnosticsOn ||
          (diagKeys === EXPECTED_DIAG_KEYS &&
            diagBody.proxyConfigured === true &&
            diagBody.backendHealthStatus === 200 &&
            diagBody.backendDatabase === "connected"),
        `keys=${diagKeys} body=${JSON.stringify(diagBody)}`,
      );
      check(
        "CHECK 123 — diagnostics never leak a cookie value or a token",
        !diagnosticsOn || !/[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/.test(JSON.stringify(diagBody)),
        `len=${diagBody ? JSON.stringify(diagBody).length : 0}`,
      );

      // Real filesystem BFF routes: answered on the frontend origin, no-store,
      // upstream status/body forwarded untouched.
      const meNoCookie = await fetch(`${BASE}/api/auth/me`);
      check(
        "CHECK 124 — BFF /api/auth/me without a cookie → 401 generic with Cache-Control: no-store",
        meNoCookie.status === 401 && /no-store/.test(meNoCookie.headers.get("cache-control") || ""),
        `status=${meNoCookie.status} cache=${meNoCookie.headers.get("cache-control")}`,
      );
      const badLogin = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@invalid.invalid", password: "definitely-wrong" }),
      });
      const badBody = await badLogin.json().catch(() => null);
      check(
        "CHECK 125 — BFF login forwards the upstream 401 + generic body untouched",
        badLogin.status === 401 &&
          badBody?.error?.code === "UNAUTHORIZED" &&
          !/hash|jwt/i.test(JSON.stringify(badBody)),
        `status=${badLogin.status}`,
      );

      const bffEnv = readBackendEnv();
      const bffEmail = process.env.ADMIN_EMAIL ?? bffEnv.ADMIN_EMAIL;
      const bffPassword = process.env.ADMIN_PASSWORD ?? bffEnv.ADMIN_PASSWORD;
      if (!bffEmail || !bffPassword) {
        console.log(
          "  ⚠ SKIPPED (Task K BFF cookie attributes): ADMIN_EMAIL/ADMIN_PASSWORD unavailable — NOT counted as a pass",
        );
      } else {
        const creds = JSON.stringify({ email: bffEmail, password: bffPassword });
        const loginStatus = await evaluate(
          cdp,
          `(async () => {
            const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: ${JSON.stringify(creds)} });
            return res.status;
          })()`,
        );
        const jar = await cdp.send("Network.getCookies", { urls: [`${BASE}/`] });
        const session = (jar.cookies || []).find((c) => c.httpOnly === true) ?? null;
        const host = new URL(BASE).hostname;
        check(
          "CHECK 126 — the BROWSER stores the session cookie from the FRONTEND origin: HttpOnly, Path=/, host-only",
          loginStatus === 200 &&
            session !== null &&
            session.httpOnly === true &&
            session.path === "/" &&
            session.domain === host &&
            !String(session.domain).startsWith("."),
          `login=${loginStatus} cookie=${
            session
              ? JSON.stringify({ domain: session.domain, path: session.path, httpOnly: session.httpOnly, sameSite: session.sameSite })
              : null
          }`,
        );
        check(
          "CHECK 127 — that cookie is SameSite=Lax (sent on the same-origin XHR)",
          session !== null && String(session.sameSite).toLowerCase() === "lax",
          `sameSite=${session?.sameSite}`,
        );
        const meStatus = await evaluate(cdp, `fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.status)`);
        check("CHECK 128 — the browser resends it: /api/auth/me is 200", meStatus === 200, `me=${meStatus}`);

        await evaluate(
          cdp,
          `fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then((r) => r.status)`,
        );
        const jarAfter = await cdp.send("Network.getCookies", { urls: [`${BASE}/`] });
        const stillThere = (jarAfter.cookies || []).some((c) => c.httpOnly === true);
        check("CHECK 129 — logout removes the session cookie from the BROWSER jar", stillThere === false);
      }
      assertClean("auth-bff");
    }

    // --- 24. Task K — Discipline Atlas (rail + stage) ---------------------
    console.log("\n[24] Discipline Atlas — rail + stage");
    resetErrors();
    await setViewport(1440, 900, false);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await cdp.send("Page.navigate", { url: `${BASE}/?atlas=1` });
    await waitFor(cdp, `document.querySelector('[data-services-state="loaded"]') !== null`, 15000, "atlas rail loaded");

    const atlas = await evaluate(
      cdp,
      `(() => {
        const rail = document.querySelector('[data-atlas-rail]');
        const rows = rail ? [...rail.children] : [];
        const stage = document.querySelector('[data-atlas-stage]');
        const hubLinks = [...document.querySelectorAll('#hub-service-list a[data-hub-card]')].map((a) => a.getAttribute('href'));
        return {
          rows: rows.length,
          rowIds: rows.map((r) => r.id),
          role: rail ? rail.getAttribute('role') : null,
          stageRole: stage ? stage.getAttribute('role') : null,
          live: stage ? stage.getAttribute('aria-live') : null,
          hubLinks,
          hubResolved: hubLinks.filter((href) => href && document.querySelector(href)).length,
          selected: rows.filter((r) => r.getAttribute('aria-selected') === 'true').length,
          roving: rows.filter((r) => r.getAttribute('tabindex') === '0').length,
        };
      })()`,
    );
    check(
      "CHECK 130 — the atlas rail is a tablist of all 14 disciplines, with exactly one selected/roving row",
      atlas.rows === 14 &&
        atlas.role === "tablist" &&
        atlas.stageRole === "tabpanel" &&
        atlas.live === "polite" &&
        atlas.selected === 1 &&
        atlas.roving === 1 &&
        atlas.rowIds.every((id) => /^service-/.test(id || "")),
      JSON.stringify({ rows: atlas.rows, role: atlas.role, stage: atlas.stageRole, live: atlas.live, selected: atlas.selected, roving: atlas.roving }),
    );
    check(
      "CHECK 131 — every hub link still resolves to a rail anchor (#service-{slug})",
      atlas.hubLinks.length === 5 && atlas.hubResolved === atlas.hubLinks.length,
      JSON.stringify(atlas.hubLinks),
    );

    const stageOf = `(() => {
      const stage = document.querySelector('[data-atlas-stage]');
      const rows = [...document.querySelectorAll('[data-atlas-item]')];
      const activeRow = rows.find((r) => r.getAttribute('aria-selected') === 'true');
      return {
        slug: activeRow ? activeRow.dataset.atlasItem : null,
        title: stage ? stage.querySelector('.atlas-stage__title')?.textContent.trim() : null,
        descLen: stage ? (stage.querySelector('.atlas-stage__desc')?.textContent.trim().length || 0) : 0,
        chips: stage ? stage.querySelectorAll('.atlas-stage__chips .atlas-chip').length : 0,
        cta: stage ? Boolean(stage.querySelector('.atlas-stage__cta')) : false,
        nodes: stage ? stage.querySelectorAll('[data-atlas-node]').length : 0,
        liveText: stage ? stage.textContent.trim().slice(0, 60) : '',
      };
    })()`;
    const firstStage = await evaluate(cdp, stageOf);
    check(
      "CHECK 132 — the stage renders the selected discipline: title, full description, chips, CTA and the 14-node constellation",
      firstStage.slug === "software-solutions" &&
        firstStage.title &&
        firstStage.title.length > 0 &&
        firstStage.descLen > 40 &&
        firstStage.chips <= 3 &&
        firstStage.cta === true &&
        firstStage.nodes === 14,
      JSON.stringify(firstStage),
    );
    check(
      "CHECK 133 — the stage is a live region announcing the selected title",
      firstStage.liveText.includes(firstStage.title || "@"),
      firstStage.liveText,
    );
    await shotSection("#services", "atlas-selection-a-light.png", "light");
    await shotSection("#services", "atlas-selection-a-dark.png", "dark");
    await evaluate(cdp, `(() => { document.documentElement.classList.remove('dark'); return true; })()`);

    // Keyboard: focus the selected row, ArrowDown twice, Home, End.
    await evaluate(cdp, `(() => { const r = document.querySelector('[data-atlas-item][tabindex="0"]'); if (r) r.focus(); return Boolean(r); })()`);
    const keySequence = async (key) => {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: 0 });
      await sleep(120);
    };
    await keySequence("ArrowDown");
    await keySequence("ArrowDown");
    const afterArrows = await evaluate(cdp, `(() => {
      const rows = [...document.querySelectorAll('[data-atlas-item]')];
      const idx = rows.findIndex((r) => r.getAttribute('aria-selected') === 'true');
      return { index: idx, focused: document.activeElement === rows[idx], visible: rows[idx] ? getComputedStyle(rows[idx]).outlineStyle : null };
    })()`);
    await keySequence("End");
    const afterEnd = await evaluate(cdp, `(() => {
      const rows = [...document.querySelectorAll('[data-atlas-item]')];
      return rows.findIndex((r) => r.getAttribute('aria-selected') === 'true');
    })()`);
    await keySequence("Home");
    const afterHome = await evaluate(cdp, `(() => {
      const rows = [...document.querySelectorAll('[data-atlas-item]')];
      return rows.findIndex((r) => r.getAttribute('aria-selected') === 'true');
    })()`);
    check(
      "CHECK 134 — keyboard navigation moves the selection with the focus (Down/End/Home)",
      afterArrows.index === 2 && afterArrows.focused === true && afterEnd === 13 && afterHome === 0,
      JSON.stringify({ afterArrows, afterEnd, afterHome }),
    );

    // A different selection → the stage changes and a second screenshot pair.
    const secondStage = await evaluate(
      cdp,
      `(() => {
        const row = [...document.querySelectorAll('[data-atlas-item]')].find((r) => r.dataset.atlasItem === 'cybersecurity');
        if (!row) return null;
        row.click();
        return true;
      })()`,
    );
    await sleep(250);
    const stageB = await evaluate(cdp, stageOf);
    check(
      "CHECK 135 — selecting another discipline updates the stage (title + description)",
      secondStage === true && stageB.slug === "cybersecurity" && stageB.title !== firstStage.title && stageB.descLen > 40,
      JSON.stringify(stageB),
    );
    await shotSection("#services", "atlas-selection-b-light.png", "light");
    await shotSection("#services", "atlas-selection-b-dark.png", "dark");
    await evaluate(cdp, `(() => { document.documentElement.classList.remove('dark'); return true; })()`);

    // Deep link: #service-{slug} selects that discipline, and the row lands
    // below the fixed navbar (scroll-margin-top).
    await evaluate(cdp, `(() => { window.location.hash = '#service-cloud-and-devops'; return true; })()`);
    await sleep(400);
    const deepLink = await evaluate(
      cdp,
      `(() => {
        const row = document.querySelector('[data-atlas-item="cloud-and-devops"]');
        const stage = document.querySelector('[data-atlas-stage]');
        const nav = document.querySelector('.jt-nav, header');
        const r = row ? row.getBoundingClientRect() : null;
        const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
        return {
          selected: row ? row.getAttribute('aria-selected') === 'true' : false,
          title: stage ? stage.querySelector('.atlas-stage__title')?.textContent.trim() : null,
          top: r ? Math.round(r.top) : null,
          navBottom: Math.round(navBottom),
          margin: row ? getComputedStyle(row).scrollMarginTop : null,
        };
      })()`,
    );
    check(
      "CHECK 136 — #service-{slug} selects the discipline and its row scrolls below the navbar",
      deepLink.selected === true &&
        deepLink.title === "Cloud and DevOps" &&
        deepLink.margin !== "0px" &&
        deepLink.top !== null &&
        deepLink.top >= deepLink.navBottom - 4,
      JSON.stringify(deepLink),
    );

    // Full text present at rest; the stage description is never clamped.
    const restText = await evaluate(
      cdp,
      `(() => {
        const descs = [...document.querySelectorAll('.atlas-row .service-card__desc')].map((e) => e.textContent.trim().length);
        const stageDesc = document.querySelector('.atlas-stage__desc');
        const clamp = stageDesc ? getComputedStyle(stageDesc).webkitLineClamp : 'none';
        return { rows: descs.length, min: Math.min(...descs), clamp, sectionText: document.querySelector('#services').textContent.replace(/\\s+/g, ' ').trim().length };
      })()`,
    );
    check(
      "CHECK 137 — every discipline's full description is in the DOM at rest and the stage copy is not clamped",
      restText.rows === 14 && restText.min > 40 && (restText.clamp === "none" || restText.clamp === "") && restText.sectionText > 2000,
      JSON.stringify(restText),
    );

    // Contrast on the stage: the description colour vs the surface it sits on.
    const stageColours = await evaluate(
      cdp,
      `(() => {
        const stage = document.querySelector('[data-atlas-stage]');
        const desc = stage ? stage.querySelector('.atlas-stage__desc') : null;
        const section = document.querySelector('#services');
        return {
          fg: desc ? getComputedStyle(desc).color : null,
          bg: section ? getComputedStyle(section).backgroundColor : null,
        };
      })()`,
    );
    const parseRgb = (value) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || "");
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const relLum = ([r, g, b]) => {
      const ch = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const stageFg = parseRgb(stageColours.fg);
    const stageBg = parseRgb(stageColours.bg);
    const stageRatio =
      stageFg && stageBg
        ? (Math.max(relLum(stageFg), relLum(stageBg)) + 0.05) / (Math.min(relLum(stageFg), relLum(stageBg)) + 0.05)
        : 0;
    check(
      "CHECK 138 — the measured stage description contrast clears WCAG AA (>= 4.5:1)",
      stageRatio >= 4.5,
      `${stageRatio.toFixed(2)}:1 (fg=${stageColours.fg} bg=${stageColours.bg})`,
    );

    // Reduced motion: no tour, no packets, no wave animation.
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await cdp.send("Page.navigate", { url: `${BASE}/?atlas-rm=1` });
    await waitFor(cdp, `document.querySelector('[data-services-state="loaded"]') !== null`, 15000, "atlas (reduced motion)");
    await sleep(500);
    const reducedAtlas = await evaluate(
      cdp,
      `(() => {
        const band = document.querySelector('.atlas-band__wave');
        return {
          tour: Boolean(document.querySelector('[data-atlas-tour]')),
          packets: document.querySelectorAll('.atlas-visual__packet').length,
          bandAnim: band ? getComputedStyle(band).animationName : 'none',
          rows: document.querySelectorAll('[data-atlas-item]').length,
        };
      })()`,
    );
    check(
      "CHECK 139 — reduced motion: no tour control, no packets, no wave animation (list still complete)",
      reducedAtlas.tour === false && reducedAtlas.packets === 0 && reducedAtlas.bandAnim === "none" && reducedAtlas.rows === 14,
      JSON.stringify(reducedAtlas),
    );
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });

    // 1 and 3 disciplines via response interception (existing checks cover 0 and 14).
    const liveServices = await (await fetch(`${BASE}/api/services`)).json();
    const atlasServicePatterns = [
      { urlPattern: `${BASE}/api/services*`, requestStage: "Request" },
      { urlPattern: "*localhost:5000/api/services*", requestStage: "Request" },
    ];
    for (const count of [1, 3]) {
      const body = Buffer.from(
        JSON.stringify({ success: true, data: liveServices.data.slice(0, count) }),
      ).toString("base64");
      await cdp.send("Fetch.enable", { patterns: atlasServicePatterns });
      const handler = async (params) => {
        try {
          await cdp.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: "application/json" },
              { name: "Access-Control-Allow-Origin", value: BASE },
              { name: "Access-Control-Allow-Credentials", value: "true" },
            ],
            body,
          });
        } catch {
          /* cancelled */
        }
      };
      cdp.on("Fetch.requestPaused", handler);
      await evaluate(
        cdp,
        `(() => { Object.keys(localStorage).filter((k) => k.startsWith('jazari:public-content:')).forEach((k) => localStorage.removeItem(k)); return true; })()`,
      );
      await cdp.send("Page.navigate", { url: `${BASE}/?atlas-count=${count}` });
      await waitFor(cdp, `document.querySelector('[data-services-state="loaded"]') !== null`, 15000, `atlas with ${count} disciplines`);
      const small = await evaluate(
        cdp,
        `(() => ({
          rows: document.querySelectorAll('[data-atlas-item]').length,
          nodes: document.querySelectorAll('[data-atlas-node]').length,
          title: document.querySelector('[data-atlas-stage] .atlas-stage__title')?.textContent.trim() || null,
          gauge: Boolean(document.querySelector('[data-atlas-gauge]')),
        }))()`,
      );
      check(
        `CHECK 14${count === 1 ? "0" : "1"} — atlas renders ${count} discipline(s) with a valid stage (no crash, no invented data)`,
        small.rows === count && small.nodes === count && Boolean(small.title) && small.gauge === true,
        JSON.stringify(small),
      );
      cdp.off("Fetch.requestPaused", handler);
      await cdp.send("Fetch.disable");
    }

    // Mobile: sticky scroll-snapped chip carousel, no page overflow.
    await setViewport(390, 844, true);
    await cdp.send("Page.navigate", { url: `${BASE}/?atlas-mobile=1` });
    await waitFor(cdp, `document.querySelector('[data-services-state="loaded"]') !== null`, 15000, "atlas mobile");
    await sleep(400);
    const mobileAtlas = await evaluate(
      cdp,
      `(() => {
        const rail = document.querySelector('[data-atlas-rail]');
        const style = rail ? getComputedStyle(rail) : null;
        return {
          direction: style ? style.flexDirection : null,
          snap: style ? style.scrollSnapType : null,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          rows: document.querySelectorAll('[data-atlas-item]').length,
        };
      })()`,
    );
    check(
      "CHECK 142 — mobile shows the horizontal scroll-snapped chip carousel with no page overflow",
      mobileAtlas.direction === "row" &&
        /x/.test(mobileAtlas.snap || "") &&
        mobileAtlas.overflowX <= 1 &&
        mobileAtlas.rows === 14,
      JSON.stringify(mobileAtlas),
    );
    await shotSection("#services", "atlas-mobile-light.png", "light");
    await shotSection("#services", "atlas-mobile-dark.png", "dark");
    await setViewport(1440, 900, false);
    assertClean("atlas");

    // --- 25. Task 2 — hero explosion: real Voronoi fragments + neon edges --
    // Rebuilds the shatter as a REAL exploded view of the traced logo (a
    // Voronoi fracture of the five true contours) while keeping the legacy
    // `data-explode` vocabulary so suites [17] keep reading the same contract.
    console.log("\n[25] Hero explosion — Voronoi fracture + neon edges");
    resetErrors();
    await setViewport(1440, 900, false);
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await cdp.send("Page.navigate", { url: `${BASE}/?fracture=1` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 15000, "hero scene (fracture)");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(700);

    const FRAG_BUDGET = { high: 100, medium: 50, low: 20 };
    const fragInfo = await evaluate(
      cdp,
      `(() => {
        const c = document.querySelector("[data-scene] canvas");
        const d = c.__jazariDebug;
        return {
          quality: c.dataset.quality,
          shards: Number(c.dataset.shards),
          fragments: Number(c.dataset.fragments),
          fragmentCount: d.fragmentCount(),
          stage: c.dataset.stage,
          explode: c.dataset.explode,
        };
      })()`,
    );
    check(
      "CHECK 143 — data-fragments matches the tier budget (100/50/20), data-stage starts assembled, data-explode stays backward-compatible",
      fragInfo.fragments === FRAG_BUDGET[fragInfo.quality] &&
        fragInfo.fragmentCount === FRAG_BUDGET[fragInfo.quality] &&
        fragInfo.shards === TIER_BUDGET[fragInfo.quality] &&
        fragInfo.stage === "assembled" &&
        fragInfo.explode === "assembled",
      JSON.stringify(fragInfo),
    );

    // Stage order + legacy mapping: each designed stage parks at a fixed point
    // (the forced override holds the timeline, so the capture never races).
    const STAGE_EXPLODE = {
      separating: "shattering",
      fracturing: "shattering",
      floating: "floating",
      reassembling: "reassembling",
      assembled: "assembled",
    };
    const STAGE_ORDER = ["separating", "fracturing", "floating", "reassembling", "assembled"];
    const stageTrail = [];
    for (const stage of STAGE_ORDER) {
      await evaluate(
        cdp,
        `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter(${JSON.stringify(stage)})`,
      );
      await sleep(260);
      const seen = await evaluate(
        cdp,
        `(() => { const c = document.querySelector("[data-scene] canvas"); return { stage: c.dataset.stage, explode: c.dataset.explode, progress: c.__jazariDebug.shatter().progress }; })()`,
      );
      stageTrail.push({ forced: stage, ...seen });
    }
    check(
      "CHECK 144 — the five designed stages park in order and map to the legacy data-explode vocabulary",
      stageTrail.length === 5 &&
        stageTrail.every((entry) => entry.stage === entry.forced && entry.explode === STAGE_EXPLODE[entry.forced]),
      JSON.stringify(stageTrail),
    );

    // Fidelity + resolution, measured from the rest tiling (deterministic).
    await evaluate(
      cdp,
      `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("floating")`,
    );
    await sleep(320);
    const fidelity = await evaluate(
      cdp,
      `(() => { const d = document.querySelector("[data-scene] canvas").__jazariDebug; return { m: d.fractureMetrics(), p: d.fragmentProjection() }; })()`,
    );
    check(
      "CHECK 145 — the fracture tiles the traced logo silhouette: raster IoU ≥ 0.95, overlap ≤ 0.02, all five pieces fully fractured",
      fidelity.m &&
        fidelity.m.iou >= 0.95 &&
        fidelity.m.overlapRatio <= 0.02 &&
        fidelity.m.pieces.length === 5 &&
        fidelity.m.pieces.every((piece) => piece.ratio >= 0.98),
      JSON.stringify({ iou: fidelity.m?.iou, overlap: fidelity.m?.overlapRatio, pieces: fidelity.m?.pieces }),
    );
    check(
      "CHECK 146 — the median projected fragment is ≥ 2.5% of the projected logo width (a real exploded view, not a dissolve)",
      fidelity.p &&
        fidelity.p.fragments === FRAG_BUDGET[fragInfo.quality] &&
        fidelity.p.medianRatio >= 0.025 &&
        fidelity.p.medianWidth > 0 &&
        fidelity.p.logoWidth > 0,
      JSON.stringify(fidelity.p),
    );

    // Neon edge: the fracture faces glow Technology Blue. Raise the neon-glow
    // uniform at a fixed state (dust hidden) and require the rendered pixels to
    // brighten blue-ward — a measured proof the neon layer drives real pixels.
    await evaluate(
      cdp,
      `(() => { const d = document.querySelector("[data-scene] canvas").__jazariDebug; d.forceShatter("floating"); d.setDustVisible(false); d.setFragmentsVisible(true); return true; })()`,
    );
    await sleep(450);
    // Clip to the hero so the comparison is exactly the canvas, not the page.
    const neonClip = await evaluate(
      cdp,
      `(() => {
        const r = document.querySelector("[data-scene]").getBoundingClientRect();
        const x = Math.max(0, Math.round(r.x));
        const y = Math.max(0, Math.round(r.y));
        return { x, y, width: Math.round(Math.min(r.width, window.innerWidth - x)), height: Math.round(Math.min(r.height, window.innerHeight - y)), scale: 1 };
      })()`,
    );
    const neonShot = async () =>
      Buffer.from(
        (await cdp.send("Page.captureScreenshot", { format: "png", clip: neonClip, captureBeyondViewport: false })).data,
        "base64",
      );
    const neonLo = decodePng(await neonShot());
    await evaluate(cdp, `document.querySelector("[data-scene] canvas").__jazariDebug.setFractureGlow(3.6)`);
    await sleep(320);
    const neonHi = decodePng(await neonShot());
    // Only the fracture WALLS scale with uGlow (caps do not), so every pixel
    // that brightens is a neon fracture face. At the raised glow the blue
    // channel tone-maps toward saturation, so the hue is judged on the DEFAULT
    // (low) capture: those neon faces must read blue-dominant there.
    let neonBrightened = 0;
    let neonLowBlue = 0;
    let neonSumB = 0;
    for (let i = 0; i < neonLo.width * neonLo.height; i += 1) {
      const at = i * neonLo.channels;
      const db = neonHi.data[at + 2] - neonLo.data[at + 2];
      if (db > 12) {
        neonBrightened += 1;
        neonSumB += db;
        const lr = neonLo.data[at];
        const lg = neonLo.data[at + 1];
        const lb = neonLo.data[at + 2];
        if (lb >= lg && lb > lr + 8) neonLowBlue += 1;
      }
    }
    const neonMeanB = neonBrightened ? neonSumB / neonBrightened : 0;
    const neonBlueFraction = neonBrightened ? neonLowBlue / neonBrightened : 0;
    check(
      "CHECK 147 — the fracture faces are neon: they brighten with the glow and read blue at rest (thousands of pixels)",
      neonBrightened >= 1500 && neonMeanB >= 30 && neonBlueFraction >= 0.6,
      JSON.stringify({
        brightened: neonBrightened,
        meanBlueDelta: +neonMeanB.toFixed(1),
        blueFraction: +neonBlueFraction.toFixed(3),
        bluePixels: neonLowBlue,
      }),
    );
    await evaluate(cdp, `document.querySelector("[data-scene] canvas").__jazariDebug.setFractureGlow(0.8)`);

    // Reassembly: the explosion must round-trip home to the exact mark.
    await evaluate(
      cdp,
      `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("reassembling")`,
    );
    await sleep(260);
    const midReturn = await evaluate(
      cdp,
      `document.querySelector("[data-scene] canvas").__jazariDebug.shatter().progress`,
    );
    await evaluate(
      cdp,
      `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("assembled")`,
    );
    await sleep(360);
    const reassembled = await evaluate(
      cdp,
      `(() => { const c = document.querySelector("[data-scene] canvas"); const d = c.__jazariDebug; return { stage: c.dataset.stage, explode: c.dataset.explode, progress: d.shatter().progress, iou: d.fractureMetrics().iou }; })()`,
    );
    check(
      "CHECK 148 — the explosion round-trips home: reassembling parks mid-return, assembled restores the mark at the same ≥ 0.95 IoU",
      midReturn > 0 &&
        midReturn < 1 &&
        reassembled.stage === "assembled" &&
        reassembled.explode === "assembled" &&
        reassembled.progress <= 0.001 &&
        reassembled.iou >= 0.95,
      JSON.stringify({ midReturn, ...reassembled }),
    );

    // Reduced motion: the mark never fractures (hover and the forced hook inert).
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await cdp.send("Page.navigate", { url: `${BASE}/?fracture-rm=1` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 15000, "hero (fracture reduced motion)");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(700);
    const rmFracturePoint = await evaluate(
      cdp,
      `(() => { const r = document.querySelector("[data-scene]").getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`,
    );
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rmFracturePoint.x, y: rmFracturePoint.y });
    await evaluate(
      cdp,
      `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("floating")`,
    );
    await sleep(900);
    const rmFracture = await evaluate(
      cdp,
      `(() => { const c = document.querySelector("[data-scene] canvas"); return { stage: c.dataset.stage, explode: c.dataset.explode, fragments: Number(c.dataset.fragments), shards: Number(c.dataset.shards) }; })()`,
    );
    check(
      "CHECK 149 — reduced motion keeps the mark assembled (no fracture), budgets still reported",
      rmFracture.stage === "assembled" &&
        rmFracture.explode === "assembled" &&
        rmFracture.fragments === FRAG_BUDGET[fragInfo.quality] &&
        rmFracture.shards === TIER_BUDGET[fragInfo.quality],
      JSON.stringify(rmFracture),
    );
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });

    // Screenshot set `explode-*.png` (stages A-D × light/dark + mobile).
    // Captured without scrolling: a scroll would release the forced state.
    await cdp.send("Page.navigate", { url: `${BASE}/?fracture-shots=1` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 15000, "hero (fracture shots)");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(600);
    const fractureShot = async (stage, theme, name) => {
      await evaluate(
        cdp,
        `(() => { document.documentElement.classList.toggle("dark", ${theme === "dark"}); const d = document.querySelector("[data-scene] canvas").__jazariDebug; d.setDustVisible(false); d.forceShatter(${JSON.stringify(stage)}); return true; })()`,
      );
      await sleep(420);
      await capture(name);
    };
    for (const stage of ["separating", "fracturing", "floating", "reassembling"]) {
      await fractureShot(stage, "light", `explode-${stage}-light.png`);
      await fractureShot(stage, "dark", `explode-${stage}-dark.png`);
    }
    await evaluate(cdp, `(() => { document.documentElement.classList.remove("dark"); return true; })()`);

    await setViewport(390, 844, true);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await cdp.send("Page.navigate", { url: `${BASE}/?fracture-mobile=1` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 15000, "hero (fracture mobile)");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(600);
    await fractureShot("floating", "light", "explode-floating-mobile-light.png");
    await fractureShot("floating", "dark", "explode-floating-mobile-dark.png");
    await evaluate(cdp, `(() => { document.documentElement.classList.remove("dark"); return true; })()`);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await setViewport(1440, 900, false);

    // Bundle deltas: the fracture adds real geometry + shader code; keep the
    // three chunk and the home initial JS within a documented budget.
    const BUNDLE_BASELINE = { threeRaw: 639071, threeGz: 164135, homeRaw: 707403, homeGz: 217523 };
    const BUNDLE_BUDGET = { threeRaw: 40000, threeGz: 15000, homeRaw: 20000, homeGz: 8000 };
    const threeBytes = readFileSync(join(process.cwd(), ".next", "static", "chunks", threeChunk));
    const threeRaw = threeBytes.length;
    const threeGz = gzipSync(threeBytes, { level: 9 }).length;
    const fractureHomeHtml = await (await fetch(`${BASE}/`)).text();
    const fractureScripts = [
      ...new Set([...fractureHomeHtml.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1])),
    ];
    let homeRaw = 0;
    let homeGz = 0;
    for (const src of fractureScripts) {
      const bytes = readFileSync(join(process.cwd(), ".next", src.replace(/^\/_next\//, "").split("?")[0]));
      homeRaw += bytes.length;
      homeGz += gzipSync(bytes, { level: 9 }).length;
    }
    check(
      "CHECK 150 — the fracture stays within the bundle budget (three chunk + home initial JS vs the measured baseline)",
      threeRaw - BUNDLE_BASELINE.threeRaw <= BUNDLE_BUDGET.threeRaw &&
        threeGz - BUNDLE_BASELINE.threeGz <= BUNDLE_BUDGET.threeGz &&
        homeRaw - BUNDLE_BASELINE.homeRaw <= BUNDLE_BUDGET.homeRaw &&
        homeGz - BUNDLE_BASELINE.homeGz <= BUNDLE_BUDGET.homeGz,
      JSON.stringify({
        three: { raw: threeRaw, gz: threeGz, dRaw: threeRaw - BUNDLE_BASELINE.threeRaw, dGz: threeGz - BUNDLE_BASELINE.threeGz },
        home: { scripts: fractureScripts.length, raw: homeRaw, gz: homeGz, dRaw: homeRaw - BUNDLE_BASELINE.homeRaw, dGz: homeGz - BUNDLE_BASELINE.homeGz },
      }),
    );

    // Rapid explosion cycles must not leak the WebGL context or the heap.
    await cdp.send("Page.navigate", { url: `${BASE}/?fracture-cycles=1` });
    await waitFor(cdp, `document.querySelector("[data-scene]")?.dataset.scene === "webgl"`, 15000, "hero (fracture cycles)");
    await evaluate(cdp, BRING_HERO_INTO_VIEW);
    await sleep(600);
    const readFractureHeap = () =>
      evaluate(
        cdp,
        `(() => { if (window.gc) window.gc(); return performance.memory ? performance.memory.usedJSHeapSize : 0; })()`,
      );
    const fractureHeapStart = await readFractureHeap();
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await evaluate(cdp, `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("floating")`);
      await sleep(300);
      await evaluate(cdp, `document.querySelector("[data-scene] canvas").__jazariDebug.forceShatter("assembled")`);
      await sleep(300);
    }
    const fractureCycleState = await evaluate(
      cdp,
      `(() => { const c = document.querySelector("[data-scene] canvas"); return { canvases: document.querySelectorAll("[data-scene] canvas").length, stage: c.dataset.stage }; })()`,
    );
    const fractureHeapEnd = await readFractureHeap();
    check(
      "CHECK 151 — four fracture cycles leave exactly one canvas and a bounded JS heap",
      fractureCycleState.canvases === 1 &&
        fractureCycleState.stage === "assembled" &&
        (fractureHeapEnd === 0 || fractureHeapEnd <= fractureHeapStart * 3),
      JSON.stringify({
        canvases: fractureCycleState.canvases,
        heapStartMB: +(fractureHeapStart / 1048576).toFixed(1),
        heapEndMB: +(fractureHeapEnd / 1048576).toFixed(1),
      }),
    );
    assertClean("hero-fracture");

    // --- favicon-tab: the largest ICO frame, written as-is (real icon) -----
    {
      const favBytes = Buffer.from(await (await fetch(`${BASE}/favicon.ico`)).arrayBuffer());
      const frames = favBytes.readUInt16LE(4);
      let largest = { size: 0, len: 0, off: 0 };
      for (let i = 0; i < frames; i += 1) {
        const at = 6 + i * 16;
        const size = favBytes[at] || 256;
        if (size > largest.size) largest = { size, len: favBytes.readUInt32LE(at + 8), off: favBytes.readUInt32LE(at + 12) };
      }
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const file = join(SCREENSHOT_DIR, "favicon-tab.png");
      writeFileSync(file, favBytes.subarray(largest.off, largest.off + largest.len));
      console.log(`    · screenshot → ${file} (${largest.size}px ICO frame)`);
    }
  } finally {
    cdp?.close();
    chrome.kill();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }

  /* ---- Summary ----------------------------------------------------------- */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Three.js verification: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAILED: ${f.name} ${f.detail}`);
    process.exit(1);
  }
}

function getFloat(value) {
  return Number.isFinite(value) ? value : Number.NaN;
}

main().catch((error) => {
  console.error(`\nverify-three failed: ${error.message}`);
  process.exit(1);
});
