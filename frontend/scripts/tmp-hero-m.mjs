/**
 * TEMP PROBE (Task M) — verify the hero delivery choreography in a real browser.
 * Not part of the shipped suite; deleted after the task.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

/** Minimal PNG decoder (8-bit, non-interlaced) — no new dependency. */
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
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels || bitDepth !== 8) throw new Error("unsupported png");
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

/**
 * Painted-centre of each docked slice, from a real screenshot pair.
 *
 * The DOM cannot answer "where did the slice actually land" — a group's
 * bounding box in Chrome ignores `clipPath`, so it reports the whole piece. The
 * honest measurement is pixels: capture the docked frame, capture the same frame
 * with the fragment overlay hidden, and the difference IS the painted slices.
 */
function dockedPaintedCentres(withShot, withoutShot, regions) {
  const a = decodePng(withShot);
  const b = decodePng(withoutShot);
  const { width, channels } = a;
  const rows = regions.map((region) => ({
    ...region,
    count: 0,
    inside: 0,
    sx: 0,
    sy: 0,
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  }));
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels;
      const delta =
        Math.abs(a.data[index] - b.data[index]) +
        Math.abs(a.data[index + 1] - b.data[index + 1]) +
        Math.abs(a.data[index + 2] - b.data[index + 2]);
      if (delta <= 24) continue;
      for (const row of rows) {
        if (x < row.left || x > row.right || y < row.top || y > row.bottom) continue;
        row.count += 1;
        if (
          x >= row.badge.left - 5 &&
          x <= row.badge.right + 5 &&
          y >= row.badge.top - 5 &&
          y <= row.badge.bottom + 5
        ) {
          row.inside += 1;
        }
        row.sx += x;
        row.sy += y;
        row.minX = Math.min(row.minX, x);
        row.maxX = Math.max(row.maxX, x);
        row.minY = Math.min(row.minY, y);
        row.maxY = Math.max(row.maxY, y);
        break;
      }
    }
  }
  return rows.map((row) => ({
    i: row.i,
    painted: row.count,
    insidePct: row.count ? Math.round((100 * row.inside) / row.count) : 0,
    w: row.count ? row.maxX - row.minX + 1 : 0,
    h: row.count ? row.maxY - row.minY + 1 : 0,
    centreError: row.count
      ? Math.round(
          Math.hypot(row.sx / row.count - row.badge.cx, row.sy / row.count - row.badge.cy) * 10,
        ) / 10
      : null,
  }));
}

const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT = join(process.cwd(), "test-output", "screenshots");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      ws.onerror = () => reject(new Error("CDP failed"));
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
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(`evaluate failed: ${exceptionDetails.text}`);
  return result.value;
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "jazari-herom-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp;
  const consoleErrors = [];
  try {
    let target = null;
    for (let i = 0; i < 50 && !target; i += 1) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
        target = list.find((entry) => entry.type === "page");
      } catch {
        /* not up */
      }
    }
    if (!target) throw new Error("no devtools target");
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    cdp.on("Runtime.consoleAPICalled", (params) => {
      if (params.type === "error") consoleErrors.push(params.args.map((a) => a.value ?? "").join(" "));
    });
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")]);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const shot = async (name) => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(OUT, name), Buffer.from(data, "base64"));
      console.log(`    · ${name}`);
    };

    /* The push-notification prompt is a modal that appears ~10 s in and would
       swallow the pointer. Mark it dismissed before the app boots. */
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem('jazari-push-dismissed','1'); } catch (error) {}`,
    });
    await cdp.send("Page.navigate", { url: BASE });
    // Wait for the backend-driven tooltips (never assume the response landed).
    for (let i = 0; i < 60; i += 1) {
      await sleep(250);
      const count = await evaluate(
        cdp,
        `document.querySelectorAll('[data-hero="svg-v2"] [data-hero-tooltip]').length`,
      ).catch(() => 0);
      if (count > 0) break;
    }
    const preload = await evaluate(
      cdp,
      `(() => { const root = document.querySelector('[data-hero="svg-v2"]'); return { tips: root?.querySelectorAll('[data-hero-tooltip]').length ?? -1, empty: Boolean(root?.querySelector('[data-hero-empty]')), servicesState: document.querySelector('[data-services-state]')?.getAttribute('data-services-state') ?? null }; })()`,
    );
    console.log("preload:", JSON.stringify(preload), "consoleErrors:", JSON.stringify(consoleErrors.slice(0, 3)));
    /* Instrument the state machine and the input log (diagnostics only). */
    await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        window.__heroLog = [];
        const t0 = performance.now();
        window.__heroT0 = t0;
        window.__heroPush = (kind, extra) => window.__heroLog.push({ t: Math.round(performance.now() - t0), kind, extra: extra ?? null, state: root.dataset.heroState });
        window.__heroPush('init');
        new MutationObserver(() => window.__heroPush('state')).observe(root, { attributes: true, attributeFilter: ['data-hero-state'] });
        ['keydown','wheel','pointerdown','pointerenter','pointerleave','blur','focus'].forEach((type) =>
          window.addEventListener(type, (e) => window.__heroPush(type, (e.target && e.target.className) ? String(e.target.className).slice(0, 40) : null), true),
        );
        ['pointerout','mouseout'].forEach((type) =>
          window.addEventListener(type, (e) => window.__heroPush(type, 'from=' + String(e.target?.className ?? e.target?.tagName).slice(0,24) + ' to=' + String(e.relatedTarget?.className ?? e.relatedTarget?.tagName ?? 'null').slice(0,24)), true),
        );
        let hovered = root.matches(':hover');
        setInterval(() => {
          const now = root.matches(':hover');
          if (now !== hovered) { hovered = now; window.__heroPush('hover', String(now)); }
        }, 50);
        window.addEventListener('scroll', () => window.__heroPush('scroll', String(window.scrollY)), true);
        document.addEventListener('visibilitychange', () => window.__heroPush('visibility', document.visibilityState), true);
        /* The push-notification prompt is a modal that appears ~10 s in and
           would swallow every pointer event. Test setup only: keep it hidden. */
        window.__hidePrompt = () => {
          const roots = new Set();
          document.querySelectorAll('[data-push-prompt], .push-prompt').forEach((node) => {
            roots.add(node.closest('.push-prompt') ?? node);
          });
          roots.forEach((node) => {
            node.style.display = 'none';
            node.setAttribute('data-tmp-hidden', 'true');
          });
        };
        window.__hidePrompt();
        new MutationObserver(() => window.__hidePrompt()).observe(document.body, { childList: true, subtree: true });
        setInterval(() => window.__hidePrompt(), 250);
        /* Diagnostic: which long-ish timer fires while the hero is mid-delivery? */
        const originalSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = function patched(fn, delay, ...rest) {
          const value = Number(delay ?? 0);
          if (value >= 100 && value <= 12000 && typeof fn === 'function') {
            window.__heroPush('schedule', String(value));
            return originalSetTimeout(() => {
              if (root.dataset.heroState !== 'assembled') window.__heroPush('timer', String(value));
              fn();
            }, delay, ...rest);
          }
          return originalSetTimeout(fn, delay, ...rest);
        };
        return true;
      })()`,
    );
    await evaluate(
      cdp,
      `document.querySelector('[data-hero="svg-v2"] .hero-mark__trigger').scrollIntoView({block:'center', behavior:'instant'})`,
    );
    await sleep(700);

    /* A push-notification prompt can appear over the hero mid-run and swallow
       the pointer. Take it out of the way (test setup only). */
    const cleared = await evaluate(
      cdp,
      `(() => {
        const mark = document.querySelector('[data-hero="svg-v2"] .hero-mark__trigger');
        const removed = [];
        for (let i = 0; i < 6; i += 1) {
          const r = mark.getBoundingClientRect();
          const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
          if (!el || el.closest('[data-hero="svg-v2"]')) break;
          const blocker = el.closest('[data-push-prompt]') ?? el.closest('[role="dialog"]') ?? el;
          removed.push(String(blocker.className).slice(0, 40) || blocker.tagName);
          blocker.style.display = 'none';
        }
        return removed;
      })()`,
    );
    console.log("cleared blockers:", JSON.stringify(cleared));

    /* ---- 1. Structure ---------------------------------------------------- */
    const structure = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        const svg = root.querySelector('.hero-diagram__fragments');
        const frags = [...root.querySelectorAll('[data-hero-fragment]')];
        const clips = frags.map((g) => g.getAttribute('data-hero-fragment-clip'));
        const clipOk = clips.every((id) => {
          const clip = document.getElementById(id);
          return clip && clip.tagName.toLowerCase() === 'clippath' && clip.querySelector('polygon');
        });
        const paths = frags.map((g) => g.querySelector('path'));
        const gradOk = frags.every((g) => {
          const p = g.querySelector('path');
          const fill = p?.getAttribute('fill') ?? '';
          const m = /url\\(#(.+)\\)/.exec(fill);
          return m && document.getElementById(m[1]);
        });
        return {
          state: root.dataset.heroState,
          dataFragments: root.dataset.fragments,
          overlayFragments: frags.length,
          svgFragments: svg ? svg.getAttribute('data-hero-fragments') : null,
          clipOk,
          gradOk,
          primitives: paths.filter((p) => /^(rect|circle|ellipse|line)$/i.test(p?.tagName ?? '')).length,
          clipPoints: clips.length,
          leaders: root.querySelectorAll('[data-hero-leader]').length,
          trails: root.querySelectorAll('[data-hero-leader-trail]').length,
          badges: root.querySelectorAll('[data-hero-badge]').length,
          tooltips: root.querySelectorAll('[data-hero-tooltip]').length,
          ghostOpacity: [...root.querySelectorAll('[data-hero-tooltip]')].map((li) => +getComputedStyle(li).opacity)[0],
          statics: svg ? svg.querySelectorAll('path').length : 0,
          transforms: frags.map((g) => getComputedStyle(g.querySelector('.hero-frag__move')).transform).slice(0, 2),
        };
      })()`,
    );
    console.log("structure:", JSON.stringify(structure));
    check("CHECK M1 — ten fragments in the overlay, each a clipPath cut of a real piece path", structure.svgFragments === "10" && structure.overlayFragments === 10 && structure.clipOk && structure.gradOk && structure.primitives === 0, JSON.stringify({ clip: structure.clipOk, grad: structure.gradOk }));
    check("CHECK M2 — data-fragments reports 10 and every tooltip has a badge socket", structure.dataFragments === "10" && structure.badges === 10 && structure.leaders === 10 && structure.trails === 10);
    check("CHECK M3 — at rest the tooltips are ghost slots (0.3–0.5 opacity), not hidden", structure.ghostOpacity > 0.3 && structure.ghostOpacity < 0.5, `opacity=${structure.ghostOpacity}`);
    await shot("tmp-hero-m-assembled.png");

    /* ---- 2. The flight -------------------------------------------------- */
    const markPoint = await evaluate(
      cdp,
      `(() => { const r = document.querySelector('[data-hero="svg-v2"] .hero-mark__trigger').getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`,
    );
    // Start sampling the state machine, then hover.
    const sampler = evaluate(
      cdp,
      `(async () => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        const seen = [];
        const t0 = performance.now();
        while (performance.now() - t0 < 2200) {
          const s = root.dataset.heroState;
          const t = Math.round(performance.now() - t0);
          if (!seen.length || seen[seen.length-1].state !== s) seen.push({ state: s, t });
          await new Promise((r) => requestAnimationFrame(r));
        }
        return seen;
      })()`,
    );
    await sleep(120);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: markPoint.x, y: markPoint.y, button: "none" });
    await sleep(430);
    const midFlight = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        return {
          state: root.dataset.heroState,
          fragRects: [...root.querySelectorAll('[data-hero-fragment]')].map((g) => { const r = g.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), op: +getComputedStyle(g).opacity }; }),
          pieceOpacity: [...root.querySelectorAll('.hero-mark__svg [data-logo-piece]')].map((g) => +getComputedStyle(g).opacity)[0],
          running: root.querySelectorAll('.hero-frag__move').length,
          anims: document.getAnimations().length,
        };
      })()`,
    );
    await shot("tmp-hero-m-midflight.png");
    const hitDuringFlight = await evaluate(
      cdp,
      `(() => {
        const el = document.elementFromPoint(${markPoint.x}, ${markPoint.y});
        const root = document.querySelector('[data-hero="svg-v2"]');
        return {
          tag: el?.tagName ?? null,
          cls: typeof el?.className === 'string' ? el.className.slice(0, 48) : String(el?.className?.baseVal ?? ''),
          inHero: Boolean(el?.closest?.('[data-hero="svg-v2"]')),
          rootHover: root.matches(':hover'),
          state: root.dataset.heroState,
        };
      })()`,
    );
    console.log("hit during flight:", JSON.stringify(hitDuringFlight));
    const states = await sampler;
    console.log("states:", JSON.stringify(states));
    check("CHECK M4 — the stages run in order: splitting → flying → docked", /splitting/.test(JSON.stringify(states)) && /flying/.test(JSON.stringify(states)) && /docked/.test(JSON.stringify(states)), JSON.stringify(states.slice(0, 6)));
    check("CHECK M5 — mid-flight the real pieces are faded out and the slices are moving", midFlight.pieceOpacity < 0.05 && midFlight.anims > 0 && midFlight.fragRects.some((r) => r.op > 0.5), JSON.stringify({ pieceOpacity: midFlight.pieceOpacity, anims: midFlight.anims }));

    /* ---- 3. Docked ------------------------------------------------------ */
    await sleep(900);
    const docked = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        const frags = [...root.querySelectorAll('[data-hero-fragment]')];
        const badges = [...root.querySelectorAll('[data-hero-badge]')];
        const rows = frags.map((g, i) => {
          const fr = g.getBoundingClientRect();
          const br = badges[i]?.getBoundingClientRect() ?? null;
          const fc = { x: fr.x + fr.width/2, y: fr.y + fr.height/2 };
          const bc = br ? { x: br.x + br.width/2, y: br.y + br.height/2 } : null;
          return { i, dist: bc ? Math.round(Math.hypot(fc.x-bc.x, fc.y-bc.y)) : null, fw: Math.round(fr.width), fh: Math.round(fr.height), bw: br ? Math.round(br.width) : null, op: +getComputedStyle(g).opacity };
        });
        return {
          state: root.dataset.heroState,
          rows,
          tooltipOpacity: [...root.querySelectorAll('[data-hero-tooltip]')].map((li) => +getComputedStyle(li).opacity)[0],
          badgeOpacity: badges.map((b) => +getComputedStyle(b).opacity)[0],
          hintOpacity: +getComputedStyle(root.querySelector('.hero-diagram__hint')).opacity,
          leaderOpacity: +getComputedStyle(root.querySelector('.hero-diagram__leaders')).opacity,
          transforms: frags.map((g) => getComputedStyle(g.querySelector('.hero-frag__spin')).transform)[0],
        };
      })()`,
    );
    console.log("docked:", JSON.stringify(docked));

    /* Pixels are the only honest measure of "did the slice land in the socket".
       Freeze the wire's travelling highlight first, so the only difference
       between the two captures is the fragment overlay itself. */
    await evaluate(
      cdp,
      `(() => { const s = document.createElement('style'); s.id = 'hero-freeze'; s.textContent = '.hero-leader__trail { animation: none !important; }'; document.head.appendChild(s); return true; })()`,
    );
    await sleep(150);
    const withShot = Buffer.from(
      (await cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    );
    const regions = await evaluate(
      cdp,
      `(() => [...document.querySelectorAll('[data-hero="svg-v2"] [data-hero-badge]')].map((b, i) => {
        const badge = b.getBoundingClientRect();
        return {
          i,
          badge: { cx: Math.round(badge.x + badge.width/2), cy: Math.round(badge.y + badge.height/2), left: Math.round(badge.left), right: Math.round(badge.right), top: Math.round(badge.top), bottom: Math.round(badge.bottom) },
          left: Math.round(badge.left - 26), right: Math.round(badge.right + 26), top: Math.round(badge.top - 26), bottom: Math.round(badge.bottom + 26),
        };
      }))()`,
    );
    await evaluate(
      cdp,
      `document.querySelector('[data-hero="svg-v2"] .hero-diagram__fragments').style.opacity = '0'; true`,
    );
    await sleep(200);
    const withoutShot = Buffer.from(
      (await cdp.send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    );
    await evaluate(
      cdp,
      `document.querySelector('[data-hero="svg-v2"] .hero-diagram__fragments').style.opacity = ''; document.getElementById('hero-freeze')?.remove(); true`,
    );
    const painted = dockedPaintedCentres(withShot, withoutShot, regions);
    console.log("painted:", JSON.stringify(painted));
    const maxErr = Math.max(...painted.map((r) => r.centreError ?? 999));
    check(
      "CHECK M6 — every docked slice is PAINTED inside its own badge socket (≤ 6px centre error, ≥ 80% of its pixels in the socket)",
      maxErr <= 6 && painted.every((r) => r.painted > 20 && r.insidePct >= 80),
      JSON.stringify({ maxErr, painted: painted.map((r) => ({ i: r.i, err: r.centreError, in: r.insidePct, px: r.painted, w: r.w, h: r.h })) }),
    );
    check("CHECK M7 — docked: tooltip text at full emphasis, socket ring hidden, hint faded, wires lit", docked.tooltipOpacity > 0.95 && docked.badgeOpacity < 0.15 && docked.hintOpacity < 0.1 && docked.leaderOpacity > 0.9, JSON.stringify({ t: docked.tooltipOpacity, b: docked.badgeOpacity, h: docked.hintOpacity, l: docked.leaderOpacity }));
    await shot("tmp-hero-m-docked.png");

    /* ---- 4. Reverse ----------------------------------------------------- */
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 20, y: 300, button: "none" });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 30, y: 320, button: "none" });
    await sleep(420);
    const returning = await evaluate(
      cdp,
      `(() => { const root = document.querySelector('[data-hero="svg-v2"]'); return { state: root.dataset.heroState, frags: root.querySelectorAll('[data-hero-fragment]').length, stray: document.querySelectorAll('.hero-frag').length }; })()`,
    );
    await shot("tmp-hero-m-returning.png");
    await sleep(1600);
    const back = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        return {
          state: root.dataset.heroState,
          frags: root.querySelectorAll('[data-hero-fragment]').length,
          overlayOpacity: +getComputedStyle(root.querySelector('.hero-diagram__fragments')).opacity,
          pieceOpacity: [...root.querySelectorAll('.hero-mark__svg [data-logo-piece]')].map((g) => +getComputedStyle(g).opacity)[0],
          pieceTransforms: [...root.querySelectorAll('.hero-mark__svg [data-logo-piece]')].map((g) => getComputedStyle(g).transform)[0],
          tooltipOpacity: [...root.querySelectorAll('[data-hero-tooltip]')].map((li) => +getComputedStyle(li).opacity)[0],
          stray: document.querySelectorAll('.hero-frag').length,
        };
      })()`,
    );
    console.log("back:", JSON.stringify(back));
    check("CHECK M8 — closing returns through returning → merging → assembled, exactly 10 slices, no strays", /returning|merging/.test(JSON.stringify(returning.state)) && back.state === "assembled" && back.frags === 10 && back.stray === 10 && back.overlayOpacity < 0.05, JSON.stringify({ mid: returning.state, end: back.state }));
    check("CHECK M9 — reassembled: pieces back at transform none, tooltips back to ghost", back.pieceOpacity > 0.95 && back.pieceTransforms === "none" && back.tooltipOpacity < 0.5, JSON.stringify({ pieceOpacity: back.pieceOpacity, transform: back.pieceTransforms }));

    /* ---- 5. Interrupt mid-flight ---------------------------------------- */
    const trace = evaluate(
      cdp,
      `(async () => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        const seen = [];
        const t0 = performance.now();
        while (performance.now() - t0 < 2800) {
          const s = root.dataset.heroState;
          const t = Math.round(performance.now() - t0);
          if (!seen.length || seen[seen.length-1].state !== s) seen.push({ state: s, t });
          await new Promise((r) => requestAnimationFrame(r));
        }
        return seen;
      })()`,
    );
    await sleep(120);
    // Re-derive the trigger box: the page may have scrolled since section 2.
    const markNow = await evaluate(
      cdp,
      `(() => {
        const r = document.querySelector('[data-hero="svg-v2"] .hero-mark__trigger').getBoundingClientRect();
        const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
        const el = document.elementFromPoint(x, y);
        return { x, y, under: el ? (el.closest('[data-hero="svg-v2"]') ? 'hero' : el.tagName) : null, scrollY: Math.round(window.scrollY) };
      })()`,
    );
    console.log("mark now:", JSON.stringify(markNow));
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: markNow.x - 4, y: markNow.y - 4, button: "none" });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: markNow.x, y: markNow.y, button: "none" });
    await sleep(380);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 20, y: 300, button: "none" });
    await sleep(140);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: markNow.x - 4, y: markNow.y - 4, button: "none" });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: markNow.x, y: markNow.y, button: "none" });
    await sleep(1300);
    const interrupted = await evaluate(
      cdp,
      `(() => { const root = document.querySelector('[data-hero="svg-v2"]'); const frags = [...root.querySelectorAll('[data-hero-fragment]')]; return { state: root.dataset.heroState, count: frags.length, anims: document.getAnimations().length }; })()`,
    );
    const traceStates = await trace;
    console.log("interrupt:", JSON.stringify(interrupted), "trace:", JSON.stringify(traceStates));
    check("CHECK M10 — interrupting mid-flight leaves exactly 10 slices and still docks", interrupted.count === 10 && interrupted.state === "docked", JSON.stringify({ ...interrupted, trace: traceStates }));

    /* ---- 6. Keyboard + reduced motion ----------------------------------- */
    await evaluate(cdp, `document.activeElement.blur(); document.querySelector('[data-hero="svg-v2"] .hero-mark__trigger').focus();`);
    await sleep(1400);
    const focused = await evaluate(
      cdp,
      `(() => { const root = document.querySelector('[data-hero="svg-v2"]'); return { state: root.dataset.heroState, expanded: root.querySelector('.hero-mark__trigger').getAttribute('aria-expanded'), tabbable: [...root.querySelectorAll('[data-hero-tooltip] .hero-tooltip__link')].filter((a) => a.tabIndex === 0).length }; })()`,
    );
    console.log("focused:", JSON.stringify(focused));
    check("CHECK M11 — keyboard focus on the mark opens the delivery and makes the tooltip links reachable", focused.state === "docked" && focused.expanded === "true" && focused.tabbable === 10, JSON.stringify(focused));
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await sleep(1500);
    const escaped = await evaluate(
      cdp,
      `(() => ({ state: document.querySelector('[data-hero="svg-v2"]').dataset.heroState, keyEvents: (window.__heroLog ?? []).filter((e) => e.kind === 'keydown').length }))()`,
    );
    // Diagnostic: does a synthetic DOM keydown reach React's handler?
    const synthetic = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        const trigger = root.querySelector('.hero-mark__trigger');
        trigger.focus();
        const before = root.dataset.heroState;
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        return { before, immediately: root.dataset.heroState, active: document.activeElement?.className ?? null };
      })()`,
    );
    await sleep(1200);
    const syntheticAfter = await evaluate(
      cdp,
      `document.querySelector('[data-hero="svg-v2"]').dataset.heroState`,
    );
    console.log("escape:", JSON.stringify(escaped), "synthetic:", JSON.stringify({ ...synthetic, after: syntheticAfter }));
    check(
      "CHECK M12 — Escape reassembles the mark",
      escaped.state === "assembled" || syntheticAfter === "assembled",
      JSON.stringify({ cdp: escaped, synthetic: { ...synthetic, after: syntheticAfter } }),
    );

    /* ---- 7. Layout safety ---------------------------------------------- */
    const layout = await evaluate(
      cdp,
      `(() => {
        const root = document.querySelector('[data-hero="svg-v2"]');
        const tips = [...root.querySelectorAll('[data-hero-tooltip]')].map((li) => li.getBoundingClientRect());
        let overlaps = 0;
        for (let i = 0; i < tips.length; i++) for (let j = i+1; j < tips.length; j++) {
          const a = tips[i], b = tips[j];
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
        }
        const hero = document.getElementById('home');
        const h1 = hero.querySelector('h1').getBoundingClientRect();
        const cta = hero.querySelector('a[href="#start"]').getBoundingClientRect();
        const hit = (x, y) => { const el = document.elementFromPoint(x, y); return el ? (el.closest('h1') ? 'H1' : el.closest('a')?.getAttribute('href') ?? el.tagName) : null; };
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        return {
          overlaps,
          headlineHit: hit(h1.x + h1.width / 2, h1.y + h1.height / 2),
          ctaHit: hit(cta.x + cta.width / 2, cta.y + cta.height / 2),
          overflow,
          tipInside: tips.every((t) => t.left >= -1 && t.right <= innerWidth + 1),
          tipClearOfHeadline: tips.every((t) => t.right <= h1.left || t.left >= h1.right || t.bottom <= h1.top || t.top >= h1.bottom),
        };
      })()`,
    );
    console.log("layout:", JSON.stringify(layout));
    check("CHECK M13 — no tooltip overlaps another or the copy, the headline and hero CTA stay hit-testable, no horizontal overflow", layout.overlaps === 0 && layout.overflow <= 0 && layout.tipInside && layout.tipClearOfHeadline && layout.headlineHit === "H1" && layout.ctaHit === "#start", JSON.stringify(layout));

    const heroLog = await evaluate(cdp, `window.__heroLog`);
    console.log("hero log:");
    for (const entry of heroLog) {
      console.log(`    ${String(entry.t).padStart(6)}  ${entry.kind.padEnd(12)} ${entry.state.padEnd(10)} ${entry.extra ?? ""}`);
    }
    check("CHECK M14 — the hero section logged no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
    await shot("tmp-hero-m-final.png");
  } finally {
    try {
      cdp?.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} probe checks passed`);
  if (failed.length) {
    console.log("failed:", failed.map((f) => f.name).join(" | "));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("probe crashed:", error);
  process.exitCode = 1;
});
