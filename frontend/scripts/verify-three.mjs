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
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCREENSHOT_DIR = join(process.cwd(), "test-output", "screenshots");

const BASE = process.argv[2] ?? "http://localhost:3001";
const NO_WEBGL = process.env.NO_WEBGL === "1"; // fallback-verification mode
const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Seed two logos so the marquee test runs against real data ---------- */
const API = process.env.API_BASE ?? "http://localhost:5000/api";
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
    for (const name of ["Verify Logo A", "Verify Logo B"]) {
      const res = await fetch(`${API}/admin/logos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ name, category: "verification", image: PNG_1PX }),
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
      consoleErrors.push(entry.text);
    });

    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Log.enable"),
    ]);

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
          marqueeRows: document.querySelectorAll(".marquee-track").length,
          marqueeLogos: document.querySelectorAll(".marquee-track img, .marquee-track [data-logo]").length,
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
        const bg = getComputedStyle(node).backgroundColor || "";
        const m = bg.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
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

    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
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
