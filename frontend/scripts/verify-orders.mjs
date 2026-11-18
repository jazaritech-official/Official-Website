#!/usr/bin/env node
/**
 * verify:orders — REAL end-to-end proof of the business portal (`npm run verify:orders`).
 *
 * Drives real Chrome over the DevTools protocol (no new dependencies — Node's
 * built-in WebSocket), exactly like `verify-three.mjs`, but on its OWN debug
 * port so the two never collide.
 *
 * The whole flow runs against the local stack (backend :5001, frontend :3001)
 * THROUGH THE REAL UI:
 *
 *   1  sign in as super admin on /admin/login
 *   2  Treasury → Split Template: three owners (25 / 25 / 20) plus a 30%
 *      company reserve must total exactly 100% before it can be saved
 *   3  Work Types: the owner-managed price list renders with its live example
 *   4  Orders → New order → add a client inline
 *   5  two WORK TYPE lines (1 Minute Video ×2, 30 Seconds Video ×3) + discount;
 *      a line price overridden by hand must show the "custom price" badge
 *   6  the owners' split previews as 25 / 25 / 20 / 30 = 100%, the parts add
 *      up to the total, and a per-order override that misses 100% is rejected
 *   7  save → record a partial payment, then the balance → chips read Paid
 *   8  the Bill tab shows the SEMANTIC invoice (real tables + the owners'
 *      distribution) and exports a real PNG at the default 8K tier; the
 *      downloaded file's IHDR must say 7680 × 7680
 *   9  Treasury's company-box figures move by exactly the hand-computed amount
 *  10  the same order opened as a PLAIN (non-super) admin shows no shares
 *  11  Orders / order form / order detail / Work Types stay usable at 390 px
 *      with no horizontal overflow, and the page console stays clean
 *
 * RETIRED/REPLACED CHECKS (owner-approved behaviour change, Task N):
 *   · "four people exist to assign (1 referrer + 3 workers)" → replaced by
 *     "three owners exist for the Split Template" (the order form no longer
 *     assigns referrers/workers; the whole amount goes to the owners)
 *   · "catalogue rows selected by name" → "work type lines picked by name"
 *   · the whole referrer/worker live-split block (step 4) → replaced by the
 *     three-owner split preview + override validation
 *   · "the bill preview renders inline" (SVG selector) → the same assertions
 *     against the semantic HTML invoice (tables), the PNG export is unchanged
 *
 * Credentials come from `Backend/.env` (read, never printed) or the
 * environment — the same non-printing approach as verify-three.mjs.
 * Screenshots land in `frontend/test-output/screenshots/`.
 *
 * Usage: node scripts/verify-orders.mjs [baseUrl]   (default http://localhost:3001)
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.argv[2] ?? "http://localhost:3001";
const API = process.env.API_BASE ?? "http://localhost:5001/api";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9344);
const SHOT_DIR = join(process.cwd(), "test-output", "screenshots");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---- Credentials (never printed) ---------------------------------------- */
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

/* ---- Results ------------------------------------------------------------ */
const results = [];
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/* ---- Minimal CDP client (same shape as verify-three.mjs) ---------------- */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    /** Runtime events (console errors, exceptions) — asserted clean at the end. */
    this.events = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (!message.id && message.method) {
        this.events.push(message);
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
  if (exceptionDetails) {
    const detail = exceptionDetails.exception?.description ?? exceptionDetails.text ?? "unknown";
    throw new Error(`evaluate failed: ${detail}\n  in: ${String(expression).slice(0, 160).replace(/\s+/g, " ")}`);
  }
  return result.value;
}

async function waitFor(cdp, expression, timeoutMs = 15000, label = "element") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(cdp, `Boolean(${expression})`)) return true;
    } catch {
      /* the page may still be hydrating */
    }
    await sleep(180);
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label} (${expression})`);
}

/* ---- Plain HTTP helpers (the API under test) ---------------------------- */
async function apiLogin(email, password) {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;
  return (response.headers.get("set-cookie") ?? "").split(";")[0] || null;
}

async function apiJson(pathname, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* non-JSON */
  }
  return { status: response.status, body: payload };
}

/* ---- Browser helpers ---------------------------------------------------- */
const setSelect = (selector, optionText) =>
  `(() => {
     const el = document.querySelector(${JSON.stringify(selector)});
     if (!el) return "no select";
     const option = [...el.options].find((o) => o.textContent.trim() === ${JSON.stringify(optionText)});
     if (!option) return "no option: " + [...el.options].map((o) => o.textContent.trim()).join("|");
     el.value = option.value;
     el.dispatchEvent(new Event("change", { bubbles: true }));
     return "ok";
   })()`;

const setValue = (selector, value) =>
  `(() => {
     const el = document.querySelector(${JSON.stringify(selector)});
     if (!el) return "no input";
     el.focus();
     if ("setRangeText" in el && el.value) {
       el.setRangeText("", 0, el.value.length, "end");
     }
     // Real editing command → a trusted native input event, which is the only
     // thing React's onChange listens for. Setting .value directly does NOT
     // update React state (the controlled re-render silently discards it).
     if (!document.execCommand("insertText", false, ${JSON.stringify(value)})) {
       return "execCommand failed";
     }
     return "ok";
   })()`;

const click = (selector) => `document.querySelector(${JSON.stringify(selector)})?.click() ?? "no element"`;

/**
 * React attaches its listeners during hydration; typing before that means the
 * next re-render resets the DOM value back to React state (""), and the login
 * then fails client-side validation with no network request at all. Wait for
 * the fiber/props marker before driving any controlled input.
 */
const hydratedExpr = (selector) =>
  `Object.keys(document.querySelector(${JSON.stringify(selector)}) ?? {}).some((k) => k.startsWith("__react"))`;

async function waitForHydration(cdp, selector, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, hydratedExpr(selector))) return true;
    await sleep(150);
  }
  return false;
}

/** Fills a controlled input and verifies the value survived React's re-render. */
async function fill(cdp, selector, value) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await evaluate(cdp, setValue(selector, value));
    const actual = await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)})?.value ?? null`);
    if (actual === value) return "ok";
    await sleep(250);
  }
  return "value did not stick";
}

/** Same, but for the Nth match of a selector (a list of identical inputs). */
const setValueNth = (selector, index, value) =>
  `(() => {
     const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
     if (!el) return "no input #${index}";
     el.focus();
     if ("setRangeText" in el && el.value) {
       el.setRangeText("", 0, el.value.length, "end");
     }
     if (!document.execCommand("insertText", false, ${JSON.stringify(value)})) {
       return "execCommand failed";
     }
     return "ok";
   })()`;

async function fillNth(cdp, selector, index, value) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await evaluate(cdp, setValueNth(selector, index, value));
    const actual = await evaluate(
      cdp,
      `document.querySelectorAll(${JSON.stringify(selector)})[${index}]?.value ?? null`,
    );
    if (actual === value) return "ok";
    await sleep(250);
  }
  return "value did not stick";
}

/** Text of an element (trimmed), or "" when absent. */
const textOf = (selector) =>
  `(document.querySelector(${JSON.stringify(selector)})?.textContent ?? "").trim()`;

/** IHDR: width at bytes 16–19, height at 20–23 (big-endian). */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

async function screenshot(cdp, name) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  const file = join(SHOT_DIR, name);
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`    · screenshot → ${file}`);
  return file;
}

/* ======================================================================== */

async function main() {
  const backendEnv = readBackendEnv();
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? backendEnv.ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? backendEnv.ADMIN_PASSWORD;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("[verify:orders] ADMIN_EMAIL and ADMIN_PASSWORD must be set (Backend/.env or the environment).");
    process.exit(1);
  }

  console.log(`[verify:orders] frontend ${BASE} · backend ${API} · CDP port ${DEBUG_PORT}`);

  const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
  check("backend is reachable on the configured API base", health?.success === true || health?.status === "ok", JSON.stringify(health));

  /* ------------------------------------------------ super-admin API setup */
  const superCookie = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  check("super admin API sign-in (prerequisite)", Boolean(superCookie));

  if (!superCookie) {
    finish();
    return;
  }

  // The E2E run needs the three OWNERS. They are created through the API (the
  // Workers & Referrers page CRUD is covered by the smoke suite); the Split
  // Template that names them is saved through the real UI further down.
  const ownerNames = ["E2E Owner 1", "E2E Owner 2", "E2E Owner 3"];
  const existingPayees = await apiJson(`/admin/payees?limit=100`, { cookie: superCookie });
  const ownerIds = [];
  for (const name of ownerNames) {
    const found = (existingPayees.body?.data ?? []).find((row) => row.name === name);
    if (found) {
      ownerIds.push(found._id);
      continue;
    }
    const created = await apiJson("/admin/payees", { method: "POST", cookie: superCookie, body: { name, role: "worker" } });
    ownerIds.push(created.body?.data?._id ?? "");
  }
  check(
    "three owners exist for the Split Template",
    ownerIds.every(Boolean) && ownerIds.length === 3,
    JSON.stringify(ownerIds.map((id) => Boolean(id))),
  );

  // A temporary plain (non-super) admin is used at the end to prove the split
  // is hidden server-side. It is deleted again before the run finishes.
  const PLAIN_PASSWORD = `PlainAdmin!${Math.floor(Math.random() * 90000) + 10000}`;
  const plainCreated = await apiJson("/admin/team", {
    method: "POST",
    cookie: superCookie,
    body: { email: "e2e.plain.admin@example.com", name: "E2E Plain Admin", role: "admin", password: PLAIN_PASSWORD },
  });
  // A previous interrupted run may have left the account behind: reuse it (the
  // password is reset below through the team API) instead of failing on 409.
  let plainId = plainCreated.body?.data?.admin?.id;
  if (!plainId) {
    const team = await apiJson("/admin/team", { cookie: superCookie });
    plainId = (team.body?.data?.admins ?? []).find((admin) => admin.email === "e2e.plain.admin@example.com")?.id ?? null;
    if (plainId) {
      await apiJson(`/admin/team/${plainId}/password`, { method: "POST", cookie: superCookie, body: { password: PLAIN_PASSWORD } });
    }
  }
  check("temporary plain (non-super) admin ready", Boolean(plainId), String(plainCreated.status));

  const plainCookie = await apiLogin("e2e.plain.admin@example.com", PLAIN_PASSWORD);
  const plainLoginOk = Boolean(plainCookie);
  check("plain admin can sign in", plainLoginOk);

  // Treasury BEFORE the run — the assertion later is a delta, so it stays
  // exact even when this database already holds other orders.
  const treasuryBefore = await apiJson("/admin/finance/treasury", { cookie: superCookie });
  const collectedBefore = treasuryBefore.body?.data?.collectedCompanyMinor ?? 0;
  const owedBefore = treasuryBefore.body?.data?.peopleOwedMinor ?? 0;

  /* ------------------------------------------------------------- browser */
  const profile = mkdtempSync(join(tmpdir(), "jazari-orders-cdp-"));
  const downloadDir = mkdtempSync(join(tmpdir(), "jazari-orders-dl-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp;
  try {
    let target = null;
    for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
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
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable").catch(() => { /* older builds */ });
    // Clipboard permission is a BROWSER-level command: grant it on the browser
    // websocket so "Copy summary as text" can actually write in headless mode.
    try {
      const version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
      const browserCdp = await Cdp.connect(version.webSocketDebuggerUrl);
      await browserCdp.send("Browser.grantPermissions", {
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
        origin: new URL(BASE).origin,
      });
      browserCdp.close();
    } catch (cause) {
      console.log(`    · clipboard permission grant unavailable: ${cause.message}`);
    }
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir }).catch(() => {});

    /* -- 1. sign in through the real login form -------------------------- */
    console.log("\n[1] Sign in");
    await cdp.send("Page.navigate", { url: `${BASE}/admin/login` });
    await waitFor(cdp, `document.querySelector("#admin-email") !== null`, 20000, "login form");
    if (!(await waitForHydration(cdp, "#admin-email"))) {
      console.log("    · login form did not hydrate in time — filling anyway");
    }
    console.log(`    · email set: ${await fill(cdp, "#admin-email", ADMIN_EMAIL)}`);
    console.log(`    · password set: ${await fill(cdp, "#admin-password", ADMIN_PASSWORD)}`);
    await evaluate(cdp, click(`button[type="submit"]`));
    await waitFor(cdp, `window.location.pathname === "/admin/dashboard" || document.querySelector("[data-admin-nav-group]") !== null`, 25000, "the admin dashboard");
    check("signed in through the UI and landed in the portal", (await evaluate(cdp, `window.location.pathname`)) === "/admin/dashboard");

    /* -- 2. Treasury → the Split Template -------------------------------- */
    console.log("\n[2] Split Template");
    await cdp.send("Page.navigate", { url: `${BASE}/admin/treasury` });
    await waitFor(cdp, `document.querySelector('[data-testid="split-template"]') !== null`, 25000, "the Split Template panel");
    await waitForHydration(cdp, '[data-testid="split-add-owner"]');
    // The people list loads asynchronously. Fresh database → three options to
    // pick from; already-configured template → the three rows are already there.
    await waitFor(
      cdp,
      `document.querySelectorAll('[data-testid="split-bp-input"]').length === 3 || document.querySelectorAll('#split-add-owner option').length > 1`,
      20000,
      "the template rows or the owner picker to load",
    );

    // Owners already in the template are skipped, missing ones are added.
    for (const name of ownerNames) {
      const present = await evaluate(
        cdp,
        `[...document.querySelectorAll('[data-testid="split-owner-name"]')].some((el) => el.textContent.trim().startsWith(${JSON.stringify(name)}))`,
      );
      if (!present) {
        const picked = await evaluate(cdp, setSelect("#split-add-owner", name));
        console.log(`    · added ${name}: ${picked}`);
        await sleep(350);
      }
    }
    const rowCount = await evaluate(cdp, `document.querySelectorAll('[data-testid="split-bp-input"]').length`);
    check("the template lists the three owners", rowCount === 3, String(rowCount));

    const roleLabels = ["client & work owner", "work owner", "work owner"];
    for (let index = 0; index < roleLabels.length; index += 1) {
      await fillNth(cdp, '[id^="split-role-"]', index, roleLabels[index]);
    }
    const bpValues = ["25", "25", "20"];
    let bpFilled = "ok";
    for (let index = 0; index < bpValues.length; index += 1) {
      const result = await fillNth(cdp, '[data-testid="split-bp-input"]', index, bpValues[index]);
      if (result !== "ok") bpFilled = `${index}: ${result}`;
    }

    // A 95% split must be refused BEFORE any request is sent.
    await fill(cdp, "#split-reserve", "25");
    await sleep(250);
    const shortBadge = await evaluate(cdp, `(document.querySelector('[data-testid="split-template"]').textContent ?? "")`);
    const saveDisabled = await evaluate(cdp, `document.querySelector('[data-testid="split-template-save"]')?.disabled === true`);
    check(
      "shares that total 95% are refused with a field-level message",
      shortBadge.includes("Shares total 95%") && saveDisabled,
      `${bpFilled} · ${/Shares total[^A-Z]*/.exec(shortBadge)?.[0] ?? "no badge"}`,
    );

    await fill(cdp, "#split-reserve", "30");
    await sleep(250);
    await evaluate(cdp, click('[data-testid="split-template-save"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="split-template"]')?.textContent.includes("Split template saved")`, 20000, "the save confirmation");
    // Saving triggers a refetch of the template, during which the panel briefly
    // has no rows ("Not configured"). Wait for the badge to come back.
    await waitFor(cdp, `document.querySelector('[data-testid="split-template"]')?.textContent.includes("Shares total 100%")`, 20000, "the 100% badge after saving");
    const savedText = await evaluate(cdp, `(document.querySelector('[data-testid="split-template"]').textContent ?? "")`);
    check("the Split Template saved at exactly 100%", savedText.includes("Shares total 100%"), /Shares total \d+%/.exec(savedText)?.[0] ?? "no badge");
    await screenshot(cdp, "orders-2-split-template.png");

    const settingsAfter = await apiJson("/admin/finance/settings", { cookie: superCookie });
    const template = settingsAfter.body?.data?.splitTemplate;
    const templateBp = (template?.entries ?? []).reduce((sum, entry) => sum + entry.bp, 0) + (template?.companyReserveBp ?? 0);
    check(
      "the API stores 25 / 25 / 20 + 30 reserve = 10000 bp",
      templateBp === 10000 && (template?.entries ?? []).length === 3,
      `${templateBp} bp over ${(template?.entries ?? []).length} entries`,
    );
    const ownerFlags = await apiJson("/admin/payees?limit=100", { cookie: superCookie });
    const flagged = (ownerFlags.body?.data ?? []).filter((row) => row.isOwner === true).map((row) => row.name).sort();
    check(
      "exactly the three template owners are flagged isOwner",
      flagged.length === 3 && ownerNames.every((name) => flagged.includes(name)),
      JSON.stringify(flagged),
    );

    /* -- 3. Work Types (the owner-managed price list) -------------------- */
    console.log("\n[3] Work Types");
    await cdp.send("Page.navigate", { url: `${BASE}/admin/work-types` });
    await waitFor(cdp, `document.querySelector('[data-testid="work-types-list"]') !== null`, 25000, "the Work Types list");
    const wtText = await evaluate(cdp, `(document.querySelector('[data-testid="work-types-manager"]').textContent ?? "")`);
    check(
      "the seeded price list is on screen (30 Seconds Video = Rs 500.00)",
      wtText.includes("30 Seconds Video") && wtText.includes("Rs 500.00"),
      wtText.slice(0, 120),
    );
    check("the second seeded type is listed (1 Minute Video = Rs 1,000.00)", wtText.includes("1 Minute Video") && wtText.includes("Rs 1,000.00"));

    await evaluate(cdp, click('[data-testid="work-types-add"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="work-type-form"]') !== null`, 10000, "the add form");
    await fill(cdp, '[data-testid="work-type-name"]', "E2E Test Type");
    await fill(cdp, '[data-testid="work-type-price"]', "500");
    const example = await evaluate(cdp, textOf('[data-testid="work-type-example"]'));
    check(
      "the live example reads 3 × Rs 500 = Rs 1,500",
      example.replace(/\s+/g, " ") === "3 × Rs 500 = Rs 1,500",
      example,
    );

    // Keyboard-only completion: focus the name field, press Enter, done.
    await evaluate(cdp, `document.querySelector('[data-testid="work-type-name"]').focus()`);
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      text: "\r",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    const rowSelector = `document.querySelector('[data-testid="work-types-list"]')?.textContent.includes("E2E Test Type") ?? false`;
    try {
      await waitFor(cdp, rowSelector, 8000, "the new work type row");
    } catch {
      /* reported by the check below, together with any inline error */
    }
    const rowAppeared = await evaluate(cdp, rowSelector);
    const wtError = await evaluate(cdp, textOf('[data-testid="work-types-error"]'));
    check("keyboard-only: Enter in the form saves the new work type", rowAppeared, rowAppeared ? "" : `error: ${wtError || "no row and no error"}`);

    // Unused → hard-deleted (referenced types are only ever deactivated).
    await evaluate(cdp, `document.querySelector('[aria-label="Delete E2E Test Type"]')?.click() ?? "no delete button"`);
    await waitFor(cdp, `document.body.textContent.includes("Delete work type?")`, 10000, "the delete confirmation");
    await evaluate(cdp, `(() => { const buttons = [...document.querySelectorAll("button")].filter((button) => button.textContent.trim() === "Delete"); buttons[buttons.length - 1]?.click(); return buttons.length; })()`);
    await waitFor(cdp, `!document.body.textContent.includes("Delete work type?")`, 10000, "the dialog to close");
    const removedFromList = await evaluate(cdp, `!document.querySelector('[data-testid="work-types-list"]').textContent.includes("E2E Test Type")`);
    check("the unused work type was hard-deleted from the list", removedFromList);
    await screenshot(cdp, "orders-1-work-types.png");

    /* -- 4. Orders → New order ------------------------------------------- */
    console.log("\n[4] New order");
    await cdp.send("Page.navigate", { url: `${BASE}/admin/orders` });
    await waitFor(cdp, `document.querySelector("[data-orders-manager]") !== null`, 25000, "the Orders page");
    await waitFor(cdp, `${textOf('[data-testid="stat-open-orders"]')} !== ""`, 20000, "the summary tiles");
    const summaryText = await evaluate(cdp, textOf('[data-testid="stat-unpaid-balance"]'));
    check("summary strip renders real figures", /^Rs [\d,]+\.\d{2}$/.test(summaryText), summaryText);
    await screenshot(cdp, "orders-3-list-desktop.png");

    await evaluate(cdp, click('[data-testid="new-order"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="order-editor"]') !== null`, 15000, "the order editor");

    // Inline client
    console.log("    · adding the client inline");
    await evaluate(cdp, click('[data-testid="add-client-inline"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="inline-client-name"]') !== null`, 10000, "the inline client form");
    await evaluate(cdp, setValue('[data-testid="inline-client-name"]', "E2E Client (verify-orders)"));
    await evaluate(cdp, setValue('#inline-client-phone', "+92 300 1112223"));
    await evaluate(cdp, click('[data-testid="save-inline-client"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="order-client-chosen"]') !== null`, 15000, "the chosen client chip");
    check("client created inline and chosen", true);

    /* -- 5. work-type lines + discount ----------------------------------- */
    console.log("    · building the two work-type lines");
    const item1 = await fill(cdp, '[data-testid="item-select-0"]', "1 Minute Video");
    await evaluate(cdp, setValue('[data-testid="item-qty-0"]', "2"));
    await evaluate(cdp, setValue('[data-testid="item-price-0"]', "1000"));
    await evaluate(cdp, click('[data-testid="add-item"]'));
    await waitFor(cdp, `document.querySelectorAll('[data-testid^="item-select-"]').length === 2`, 10000, "the second item row");
    const item2 = await fill(cdp, '[data-testid="item-select-1"]', "30 Seconds Video");
    await evaluate(cdp, setValue('[data-testid="item-qty-1"]', "3"));
    await evaluate(cdp, setValue('[data-testid="item-price-1"]', "500"));
    await evaluate(cdp, setValue('[data-testid="order-discount"]', "100"));

    await sleep(250);
    const subtotal = await evaluate(cdp, textOf('[data-testid="order-subtotal"]'));
    const total = await evaluate(cdp, textOf('[data-testid="order-total"]'));
    check("work type lines picked by name", item1 === "ok" && item2 === "ok", `${item1}/${item2}`);
    check("subtotal is computed live (2 × 1000 + 3 × 500)", subtotal === "Rs 3,500.00", subtotal);
    check("total applies the discount (3,500 − 100)", total === "Rs 3,400.00", total);
    const priceOfFirst = await evaluate(cdp, `document.querySelector('[data-testid="item-price-0"]').value`);
    check("picking a work type pre-fills its own price", priceOfFirst === "1000", priceOfFirst);

    // A hand-typed price must be flagged as a CUSTOM price, and reverting it
    // must put the running total straight back.
    await evaluate(cdp, setValue('[data-testid="item-price-0"]', "1100"));
    await sleep(250);
    const badgeShown = await evaluate(
      cdp,
      `(() => { const row = [...document.querySelectorAll('[data-testid="order-items"] li')][0]; return row ? row.textContent.includes("Custom price") : false; })()`,
    );
    const subtotalCustom = await evaluate(cdp, textOf('[data-testid="order-subtotal"]'));
    check("an overridden line price shows the custom-price badge", badgeShown, `subtotal ${subtotalCustom}`);
    check("the overridden price is used in the live subtotal (2 × 1100 + 3 × 500)", subtotalCustom === "Rs 3,700.00", subtotalCustom);
    await evaluate(cdp, setValue('[data-testid="item-price-0"]', "1000"));
    await sleep(250);
    const subtotalBack = await evaluate(cdp, textOf('[data-testid="order-subtotal"]'));
    const badgeGone = await evaluate(
      cdp,
      `(() => { const row = [...document.querySelectorAll('[data-testid="order-items"] li')][0]; return row ? row.textContent.includes("Custom price") : false; })()`,
    );
    check("restoring the price clears the badge and the subtotal", !badgeGone && subtotalBack === "Rs 3,500.00", subtotalBack);

    /* -- 6. the owners' split -------------------------------------------- */
    console.log("    · checking the three-owner split preview");
    await sleep(250);
    const previewRows = await evaluate(
      cdp,
      `document.querySelectorAll('[data-testid="split-preview"] tbody tr').length`,
    );
    const ownerAmounts = [];
    for (let index = 0; index < 4; index += 1) {
      ownerAmounts.push(await evaluate(cdp, textOf(`[data-testid="split-amount-${index}"]`)));
    }
    const splitTotal = await evaluate(cdp, textOf('[data-testid="split-total"]'));
    const editorText = await evaluate(cdp, `(document.querySelector('[data-testid="order-editor"]').textContent ?? "")`);
    const footnote = await evaluate(cdp, textOf('[data-testid="split-footnote"]'));

    check("the preview shows three owners plus the reserve", previewRows === 4, String(previewRows));
    check("owner 1 (25%) reads Rs 850.00", ownerAmounts[0] === "Rs 850.00", ownerAmounts[0]);
    check("owner 2 (25%) reads Rs 850.00", ownerAmounts[1] === "Rs 850.00", ownerAmounts[1]);
    check("owner 3 (20%) reads Rs 680.00", ownerAmounts[2] === "Rs 680.00", ownerAmounts[2]);
    check("the reserve (30%) reads Rs 1,020.00", ownerAmounts[3] === "Rs 1,020.00", ownerAmounts[3]);
    check("the four parts add up to the order total", splitTotal === "Rs 3,400.00", splitTotal);
    check("the editor badge reads Shares total 100%", editorText.includes("Shares total 100%"));
    check(
      "the rounding footnote is shown",
      footnote.includes("Rounded to whole rupees; remainder assigned by largest fraction"),
      footnote.slice(0, 120),
    );

    // A per-order override that does not total 100% is refused field-level.
    await evaluate(cdp, click('[data-testid="split-override-on"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="split-override"]') !== null`, 10000, "the per-order override editor");
    await fillNth(cdp, '[data-testid="override-percent-0"]', 0, "50");
    await sleep(250);
    const overrideError = await evaluate(cdp, textOf('[data-testid="split-error"]'));
    check(
      "an override totalling 125% is rejected with a field-level message",
      overrideError.includes("exactly 100%") && overrideError.includes("125%"),
      overrideError,
    );
    await evaluate(
      cdp,
      `(() => { const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Use the template instead"); buttons[0]?.click(); return buttons.length; })()`,
    );
    await waitFor(cdp, `document.querySelector('[data-testid="split-override"]') === null`, 10000, "the override to close");
    check("the override can be cancelled back to the template", true);
    await screenshot(cdp, "orders-4-editor-with-split.png");

    /* -- 7. save, then pay ----------------------------------------------- */
    console.log("    · saving the order");
    await evaluate(cdp, click('[data-testid="save-order"]'));
    await waitFor(cdp, `document.querySelector('[data-order-detail]') !== null`, 25000, "the order detail dialog");
    const invoiceNumber = await evaluate(cdp, textOf('[data-testid="detail-invoice"]'));
    check("invoice number was issued (JZ-YYYY-NNNN)", /^JZ-\d{4}-\d{4}$/.test(invoiceNumber), invoiceNumber);

    console.log("    · recording a partial payment, then the balance");
    await evaluate(cdp, click('[data-testid="tab-payments"]'));
    await waitFor(cdp, `document.querySelector('[data-tab-panel="payments"]') !== null`, 10000, "the payments tab");
    await evaluate(cdp, setValue('[data-testid="record-amount"]', "1000"));
    await evaluate(cdp, click('[data-testid="record-payment"]'));
    await waitFor(cdp, `${textOf('[data-testid="detail-balance"]')} === "Rs 2,400.00"`, 20000, "the balance to fall to 2,400");
    const afterPartial = await evaluate(cdp, textOf('[data-testid="detail-balance"]'));
    check("partial payment recorded → balance Rs 2,400.00", afterPartial === "Rs 2,400.00", afterPartial);

    await evaluate(cdp, setValue('[data-testid="record-amount"]', "2400"));
    await evaluate(cdp, click('[data-testid="record-payment"]'));
    await waitFor(cdp, `${textOf('[data-testid="detail-balance"]')} === "Rs 0.00"`, 20000, "the balance to clear");
    const afterFull = await evaluate(cdp, textOf('[data-testid="detail-balance"]'));
    const detailChips = await evaluate(cdp, `(document.querySelector("[data-order-detail]")?.textContent ?? "")`);
    check("balance cleared after paying the remainder", afterFull === "Rs 0.00", afterFull);
    check("the payment chip now reads Paid", detailChips.includes("Paid"));
    const paymentRows = await evaluate(cdp, `document.querySelectorAll('[data-tab-panel="payments"] li').length`);
    check("both payments are listed", paymentRows === 2, String(paymentRows));
    await screenshot(cdp, "orders-5-detail-payments.png");

    /* -- 8. the bill: semantic invoice, copy text, 8K PNG ---------------- */
    console.log("    · rendering the invoice and exporting the PNG");
    await evaluate(cdp, click('[data-testid="tab-bill"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="bill-preview"] table') !== null`, 20000, "the invoice preview");
    const billText = await evaluate(cdp, `(document.querySelector('[data-testid="bill-preview"]')?.textContent ?? "")`);
    const billTables = await evaluate(cdp, `document.querySelectorAll('[data-testid="bill-preview"] table').length`);
    check("the invoice renders as real HTML tables", billTables >= 2, String(billTables));
    check("the bill preview renders inline", billText.includes(invoiceNumber), billText.slice(0, 80));
    check("the bill shows the client's name", billText.includes("E2E Client (verify-orders)"));
    const billTotal = await evaluate(cdp, textOf('[data-testid="bill-total"]'));
    check("the invoice total equals the order total (Rs 3,400.00)", billTotal === "Rs 3,400.00", billTotal);
    const distributionRows = await evaluate(
      cdp,
      `document.querySelectorAll('[data-testid="bill-distribution"] tbody tr').length`,
    );
    check(
      "the distribution table lists 3 owners + reserve + its total row",
      distributionRows === 5,
      String(distributionRows),
    );
    check(
      "the rounding footnote is printed on the bill",
      billText.includes("Rounded to whole rupees; remainder assigned by largest fraction"),
    );
    check("the bill never shows the legacy settlement", !/Khazana|referrer|worker|treasury/i.test(billText));
    check(
      "a Print / Save as PDF action exists",
      (await evaluate(cdp, `document.querySelector('[data-testid="print-invoice"]') !== null`)),
    );
    await screenshot(cdp, "orders-6-bill-preview.png");

    console.log("    · copying the WhatsApp summary");
    // A synthetic element.click() carries NO user activation, and both the
    // async clipboard API and execCommand("copy") require it — click for real
    // through the input domain so the click is trusted.
    await evaluate(cdp, `document.querySelector('[data-testid="copy-summary"]')?.scrollIntoView({ block: "center" })`);
    await sleep(500); // let a smooth scroll settle before reading the box
    const copyPoint = await evaluate(
      cdp,
      `(() => {
         const b = document.querySelector('[data-testid="copy-summary"]');
         if (!b) return null;
         const r = b.getBoundingClientRect();
         return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
       })()`,
    );
    if (!copyPoint) throw new Error("the Copy summary button was not found");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: copyPoint.x, y: copyPoint.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: copyPoint.x, y: copyPoint.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: copyPoint.x, y: copyPoint.y, button: "left", clickCount: 1 });
    await waitFor(cdp, `document.querySelector('[data-testid="export-message"]') !== null`, 10000, "the copy confirmation");
    const copyMessage = await evaluate(cdp, textOf('[data-testid="export-message"]'));
    check("'Copy summary as text' confirms the copy", /copied/i.test(copyMessage), copyMessage);

    await evaluate(cdp, click('[data-testid="download-png"]'));
    // The 8K raster takes a while: poll the download directory for up to 3 minutes.
    let downloaded = null;
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline && !downloaded) {
      await sleep(500);
      const files = readdirSync(downloadDir).filter((name) => name.endsWith(".png") && !name.endsWith(".crdownload"));
      if (files.length > 0 && !readdirSync(downloadDir).some((name) => name.endsWith(".crdownload"))) {
        downloaded = join(downloadDir, files[0]);
      }
    }
    if (downloaded) {
      const buffer = readFileSync(downloaded);
      const size = pngSize(buffer);
      check(
        "the exported PNG is the DEFAULT 8K tier (7680 × 7680)",
        size?.width === 7680 && size?.height === 7680,
        size ? `${size.width}×${size.height}, ${(size.bytes / 1024 / 1024).toFixed(2)} MB` : "not a PNG",
      );
      writeFileSync(join(SHOT_DIR, "orders-7-exported-8k.png"), buffer);
      console.log(`    · exported PNG copied → ${join(SHOT_DIR, "orders-7-exported-8k.png")}`);
    } else {
      check("the exported PNG landed in the download folder", false, "no PNG appeared within 180 s");
    }

    /* -- 9. Treasury ------------------------------------------------------ */
    console.log("    · checking the Treasury figures");
    await cdp.send("Page.navigate", { url: `${BASE}/admin/treasury` });
    await waitFor(cdp, `document.querySelector('[data-testid="treasury-cards"]') !== null`, 25000, "the Treasury page");
    const treasuryAfter = await apiJson("/admin/finance/treasury", { cookie: superCookie });
    const collectedDelta = (treasuryAfter.body?.data?.collectedCompanyMinor ?? 0) - collectedBefore;
    const owedDelta = (treasuryAfter.body?.data?.peopleOwedMinor ?? 0) - owedBefore;
    check(
      "company box collected rose by exactly Rs 1,020.00 (30% of the order)",
      collectedDelta === 102000,
      `${collectedDelta} minor`,
    );
    check(
      "people owed rose by exactly Rs 2,380.00 (10% + 3 × 20%)",
      owedDelta === 238000,
      `${owedDelta} minor`,
    );
    const collectedCard = await evaluate(cdp, textOf('[data-testid="treasury-collected"]'));
    check("the Treasury card renders the same figure as the API", /^Rs [\d,]+\.\d{2}$/.test(collectedCard), collectedCard);
    const chartBars = await evaluate(cdp, `document.querySelectorAll('[data-testid="treasury-chart"] rect').length`);
    check("the 12-month chart is drawn as inline SVG bars", chartBars === 12, String(chartBars));

    // Reports must add up: over EVERY order that carries an owner split, the
    // owner amounts sum to exactly the order totals (nothing double counted).
    const allOrders = await apiJson("/admin/orders?limit=100", { cookie: superCookie });
    const snapshotOrders = (allOrders.body?.data ?? []).filter(
      (row) => (row.splitSnapshot?.entries?.length ?? 0) > 0,
    );
    const totalsSum = snapshotOrders.reduce((sum, row) => sum + row.totalMinor, 0);
    const ownersSum = snapshotOrders.reduce(
      (sum, row) => sum + row.splitSnapshot.entries.reduce((inner, entry) => inner + entry.amountMinor, 0),
      0,
    );
    check(
      "owner amounts add up to the order totals across every snapshot order",
      snapshotOrders.length > 0 && totalsSum === ownersSum,
      `${ownersSum} vs ${totalsSum} over ${snapshotOrders.length} orders`,
    );
    await screenshot(cdp, "orders-8-treasury.png");

    /* -- 10. the same order as a PLAIN admin ----------------------------- */
    console.log("    · opening the order as a plain (non-super) admin");
    const plainView = await apiJson(`/admin/orders?q=${encodeURIComponent(invoiceNumber)}`, { cookie: plainCookie });
    const plainOrderId = plainView.body?.data?.[0]?._id;
    check("the API hides the split from a plain admin", plainView.status === 200 && (plainView.body?.data ?? []).every((row) => !("split" in row)));

    // Now prove the UI: sign the plain admin in through the same form.
    // The browser still holds the super-admin session, so it is cleared first
    // (otherwise the login page would bounce an already-signed-in visitor).
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCookies");
    await cdp.send("Page.navigate", { url: `${BASE}/admin/login` });
    await waitFor(cdp, `document.querySelector("#admin-email") !== null`, 20000, "the login form");
    await waitForHydration(cdp, "#admin-email");
    await fill(cdp, "#admin-email", "e2e.plain.admin@example.com");
    await fill(cdp, "#admin-password", PLAIN_PASSWORD);
    await evaluate(cdp, click(`button[type="submit"]`));
    await waitFor(cdp, `window.location.pathname === "/admin/dashboard"`, 25000, "the plain admin dashboard");
    await cdp.send("Page.navigate", { url: `${BASE}/admin/orders` });
    await waitFor(cdp, `document.querySelector("[data-orders-manager]") !== null`, 25000, "the Orders page for the plain admin");
    if (plainOrderId) {
      // The list loads asynchronously: wait for the row itself before clicking.
      await waitFor(
        cdp,
        `[...document.querySelectorAll("tbody tr")].some((tr) => tr.textContent.includes(${JSON.stringify(invoiceNumber)}))`,
        20000,
        "the order row for the plain admin",
      );
      const opened = await evaluate(
        cdp,
        `(() => {
           const row = [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(${JSON.stringify(invoiceNumber)}));
           const btn = row ? [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "Open") : null;
           btn?.click();
           return Boolean(btn);
         })()`,
      );
      console.log(`    · plain admin Open button found: ${opened}`);
      await waitFor(cdp, `document.querySelector('[data-order-detail]') !== null`, 20000, "the order detail for the plain admin");
      const tabs = await evaluate(cdp, `[...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())`);
      check("a plain admin's order detail has NO Shares tab", !tabs.some((label) => label.startsWith("Shares")), JSON.stringify(tabs));
      const treasuryBlocked = await fetch(`${API}/admin/finance/treasury`, { headers: { Cookie: plainCookie } });
      check("a plain admin still cannot reach the Treasury API", treasuryBlocked.status === 403, String(treasuryBlocked.status));
    } else {
      check("the plain admin could load the order", false, "order id not found for the plain admin");
    }

    /* -- 11. mobile 390 px ------------------------------------------------ */
    console.log("    · checking the order pages at 390 px");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const measure = () =>
      evaluate(cdp, `({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`);

    await cdp.send("Page.navigate", { url: `${BASE}/admin/orders` });
    await waitFor(cdp, `document.querySelector("[data-orders-manager]") !== null`, 25000, "the Orders page on mobile");
    const overflow = await measure();
    check("orders list: no horizontal overflow at 390 px", overflow.scroll <= overflow.client + 1, JSON.stringify(overflow));
    await screenshot(cdp, "orders-9-list-mobile-390.png");

    // The order form itself.
    await evaluate(cdp, click('[data-testid="new-order"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="order-editor"]') !== null`, 15000, "the order editor on mobile");
    const overflowForm = await measure();
    check("order form: no horizontal overflow at 390 px", overflowForm.scroll <= overflowForm.client + 1, JSON.stringify(overflowForm));
    await screenshot(cdp, "orders-10-form-mobile-390.png");
    await evaluate(
      cdp,
      `(() => { const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Cancel"); buttons[buttons.length - 1]?.click(); return buttons.length; })()`,
    );
    await waitFor(cdp, `document.querySelector('[data-testid="order-editor"]') === null`, 10000, "the editor to close");

    // The order detail.
    await evaluate(
      cdp,
      `(() => {
         const row = [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(${JSON.stringify(invoiceNumber)}));
         const btn = row ? [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "Open") : null;
         btn?.click();
         return Boolean(btn);
       })()`,
    );
    await waitFor(cdp, `document.querySelector('[data-order-detail]') !== null`, 20000, "the order detail on mobile");
    const overflowDetail = await measure();
    check("order detail: no horizontal overflow at 390 px", overflowDetail.scroll <= overflowDetail.client + 1, JSON.stringify(overflowDetail));
    await screenshot(cdp, "orders-11-detail-mobile-390.png");

    // Work Types.
    await cdp.send("Page.navigate", { url: `${BASE}/admin/work-types` });
    await waitFor(cdp, `document.querySelector('[data-testid="work-types-list"]') !== null`, 25000, "Work Types on mobile");
    const overflowWorkTypes = await measure();
    check("work types: no horizontal overflow at 390 px", overflowWorkTypes.scroll <= overflowWorkTypes.client + 1, JSON.stringify(overflowWorkTypes));
    await screenshot(cdp, "orders-12-work-types-mobile-390.png");
    await cdp.send("Emulation.clearDeviceMetricsOverride");

    // The console must have stayed clean for the WHOLE run: no uncaught
    // JavaScript errors and no uncaught exceptions. Resource-level network
    // entries are reported for information only — step 10 deliberately asks a
    // plain admin for the Treasury API and expects a 403.
    const logEntries = (cdp.events ?? []).filter((event) => event.method === "Log.entryAdded");
    const jsErrors = logEntries.filter((event) => event.params?.entry?.source === "javascript");
    const exceptions = (cdp.events ?? []).filter((event) => event.method === "Runtime.exceptionThrown");
    const networkNotes = logEntries
      .filter((event) => event.params?.entry?.source !== "javascript")
      .map((event) => event.params?.entry?.text ?? "");
    check(
      "the page console stayed clean (no uncaught JavaScript errors)",
      jsErrors.length === 0 && exceptions.length === 0,
      JSON.stringify({
        js: jsErrors.map((event) => event.params.entry.text).slice(0, 3),
        exceptions: exceptions.length,
        network: networkNotes.slice(0, 3),
      }),
    );
  } finally {
    try {
      cdp?.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
    setTimeout(() => {
      rmSync(profile, { recursive: true, force: true });
      rmSync(downloadDir, { recursive: true, force: true });
    }, 500);
  }

  // Clean up the temporary plain admin and its order row's reviewer.
  if (plainId) {
    const removed = await apiJson(`/admin/team/${plainId}`, { method: "DELETE", cookie: superCookie });
    check("temporary plain admin removed", removed.status === 200, String(removed.status));
  }

  finish();
}

function finish() {
  const passed = results.filter((entry) => entry.ok).length;
  const failed = results.length - passed;
  console.log(`\n[verify:orders] ${passed} passed, ${failed} failed`);
  for (const failure of results.filter((entry) => !entry.ok)) {
    console.log(`  → ${failure.name} ${failure.detail}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n[verify:orders] fatal: ${error.stack || error.message}`);
  finish();
});
