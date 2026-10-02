#!/usr/bin/env node
/**
 * Captures the "Our Products" logo showcase at multiple viewports/themes.
 *
 * Usage: node scripts/capture-products.mjs <prefix> [baseUrl]
 *   e.g. node scripts/capture-products.mjs before
 *        node scripts/capture-products.mjs after
 *
 * Writes PNGs to frontend/test-output/screenshots/ (gitignored). Uses the same
 * built-in-WebSocket CDP approach as verify-three.mjs — no new dependencies.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PREFIX = process.argv[2] ?? "products";
const BASE = process.argv[3] ?? "http://localhost:3001";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = 9344;
const OUT = join(process.cwd(), "test-output", "screenshots");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
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
  if (exceptionDetails) throw new Error(exceptionDetails.text ?? "evaluate failed");
  return result.value;
}

const profile = mkdtempSync(join(tmpdir(), "jazari-shot-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cdp;
try {
  let target = null;
  for (let i = 0; i < 50 && !target; i += 1) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      target = list.find((e) => e.type === "page");
    } catch {
      /* not up yet */
    }
  }
  if (!target) throw new Error("Chrome DevTools endpoint never appeared");
  cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")]);
  mkdirSync(OUT, { recursive: true });

  const setViewport = (width, height, mobile) =>
    cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

  const capture = async (name) => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = join(OUT, `${PREFIX}-${name}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`  · ${file}`);
  };

  const scenarios = [
    { name: "light-desktop-1366x768", w: 1366, h: 768, theme: "light" },
    { name: "dark-desktop-1366x768", w: 1366, h: 768, theme: "dark" },
    { name: "light-mobile-390x844", w: 390, h: 844, theme: "light", mobile: true },
    { name: "dark-mobile-390x844", w: 390, h: 844, theme: "dark", mobile: true },
  ];

  for (const s of scenarios) {
    await setViewport(s.w, s.h, Boolean(s.mobile));
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: Boolean(s.mobile) });
    await cdp.send("Page.navigate", { url: `${BASE}/` });
    await sleep(1200);
    await evaluate(cdp, `localStorage.setItem("jazari-theme", ${JSON.stringify(s.theme)}); true`);
    await cdp.send("Page.reload", { ignoreCache: false });
    await sleep(2600);
    // Bring the showcase into view (engine/marquee both need it on-screen).
    await evaluate(
      cdp,
      `(() => { const el = document.getElementById("products"); if (el) el.scrollIntoView({ block: "center", behavior: "instant" }); return true; })()`,
    );
    await sleep(1400);
    await capture(s.name);
  }

  await cdp.send("Emulation.clearDeviceMetricsOverride");
} finally {
  cdp?.close();
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
