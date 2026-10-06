#!/usr/bin/env node
/**
 * Before/after screenshot capture for the homepage.
 *
 * Captures the same three scroll anchors (hero, services hub, footer) at
 * desktop + mobile in light + dark, so two runs against two builds produce a
 * directly comparable A/B set:
 *
 *   node scripts/capture-themes.mjs before http://localhost:3002   # older build
 *   node scripts/capture-themes.mjs after  http://localhost:3001   # current build
 *
 * Writes PNGs to `test-output/screenshots/<prefix>-<anchor>-<theme>-<viewport>.png`.
 * Uses the same dependency-free CDP approach as verify-three.mjs (Node's
 * built-in WebSocket); no new packages.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PREFIX = process.argv[2] ?? "capture";
const BASE = process.argv[3] ?? "http://localhost:3001";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = Number(process.env.CAPTURE_PORT ?? 9355);
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

/* Viewports x themes — the exact matrix the brief asks for. */
const VIEWPORTS = [
  { tag: "desktop-1366x768", w: 1366, h: 768, mobile: false },
  { tag: "mobile-390x844", w: 390, h: 844, mobile: true },
];

/** Scroll anchors, resolved in-page so they work on any build. */
const ANCHORS = [
  { tag: "hero", resolve: "window.scrollTo(0, 0)" },
  {
    tag: "hub",
    resolve:
      "(() => { const el = document.getElementById('hub'); if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' }); })()",
  },
  { tag: "footer", resolve: "(() => { window.scrollTo(0, document.body.scrollHeight); })()" },
];

const profile = mkdtempSync(join(tmpdir(), "jazari-themes-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling",
    "--hide-scrollbars",
    "--force-prefers-reduced-motion",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cdp;
let captured = 0;
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

  for (const view of VIEWPORTS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: view.w,
      height: view.h,
      deviceScaleFactor: 1,
      mobile: view.mobile,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: view.mobile });

    for (const theme of ["light", "dark"]) {
      await cdp.send("Page.navigate", { url: `${BASE}/` });
      await sleep(1000);
      await evaluate(cdp, `localStorage.setItem("jazari-theme", ${JSON.stringify(theme)}); true`);
      await cdp.send("Page.reload", { ignoreCache: false });
      await sleep(2800); // let the WebGL scene settle before shooting

      for (const anchor of ANCHORS) {
        await evaluate(cdp, `${anchor.resolve}; true`);
        await sleep(700);
        const { data } = await cdp.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        const file = join(OUT, `${PREFIX}-${anchor.tag}-${theme}-${view.tag}.png`);
        writeFileSync(file, Buffer.from(data, "base64"));
        captured += 1;
        console.log(`  · ${file}`);
      }
    }
  }

  await cdp.send("Emulation.clearDeviceMetricsOverride");
  console.log(`\n${captured} screenshots written (prefix "${PREFIX}")`);
} finally {
  cdp?.close();
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
