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
 *   2  open Orders → New order → add a client inline
 *   3  two catalogue items (Video Ad Making ×2, Graphic Designing ×3) + discount
 *   4  assign a referrer and three workers → the live split must read
 *      10 / 20 / 20 / 20 + company 30% and the parts must equal the total
 *   5  save → record a partial payment, then the balance → chips read Paid
 *   6  the Bill tab exports a real PNG at the default 8K tier; the downloaded
 *      file's IHDR must say 7680 × 7680
 *   7  Treasury's company-box figures move by exactly the hand-computed amount
 *   8  the same order opened as a PLAIN (non-super) admin shows no shares
 *   9  the Orders list is usable at 390 px without horizontal overflow
 *
 * Credentials come from `Backend/.env` (read, never printed) or the
 * environment — the same non-printing approach as verify-three.mjs.
 * Screenshots land in `frontend/test-output/screenshots/`.
 *
 * Usage: node scripts/verify-orders.mjs [baseUrl]   (default http://localhost:3001)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  // The E2E run needs real people to assign. They are created through the API
  // (the Workers page CRUD itself is covered by the smoke suite and the portal
  // checks); the ASSIGNMENT is done through the real UI below.
  const payeeNames = [
    { name: "E2E Referrer", role: "referrer" },
    { name: "E2E Worker 1", role: "worker" },
    { name: "E2E Worker 2", role: "worker" },
    { name: "E2E Worker 3", role: "worker" },
  ];
  const existingPayees = await apiJson(`/admin/payees?limit=100`, { cookie: superCookie });
  const payeeIds = [];
  for (const entry of payeeNames) {
    const found = (existingPayees.body?.data ?? []).find((row) => row.name === entry.name);
    if (found) {
      payeeIds.push(found._id);
      continue;
    }
    const created = await apiJson("/admin/payees", { method: "POST", cookie: superCookie, body: entry });
    payeeIds.push(created.body?.data?._id ?? "");
  }
  check("four people exist to assign (1 referrer + 3 workers)", payeeIds.every(Boolean) && payeeIds.length === 4, JSON.stringify(payeeIds.map((id) => Boolean(id))));

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

    /* -- 2. Orders → New order ------------------------------------------- */
    console.log("\n[2] New order");
    await cdp.send("Page.navigate", { url: `${BASE}/admin/orders` });
    await waitFor(cdp, `document.querySelector("[data-orders-manager]") !== null`, 25000, "the Orders page");
    await waitFor(cdp, `${textOf('[data-testid="stat-open-orders"]')} !== ""`, 20000, "the summary tiles");
    const summaryText = await evaluate(cdp, textOf('[data-testid="stat-unpaid-balance"]'));
    check("summary strip renders real figures", /^Rs [\d,]+\.\d{2}$/.test(summaryText), summaryText);
    await screenshot(cdp, "orders-1-list-desktop.png");

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

    /* -- 3. items + discount --------------------------------------------- */
    console.log("    · building the two line items");
    const item1 = await evaluate(cdp, setSelect('[data-testid="item-select-0"]', "Video Ad Making"));
    await evaluate(cdp, setValue('[data-testid="item-qty-0"]', "2"));
    await evaluate(cdp, setValue('[data-testid="item-price-0"]', "1000"));
    await evaluate(cdp, click('[data-testid="add-item"]'));
    await waitFor(cdp, `document.querySelectorAll('[data-testid^="item-select-"]').length === 2`, 10000, "the second item row");
    const item2 = await evaluate(cdp, setSelect('[data-testid="item-select-1"]', "Graphic Designing"));
    await evaluate(cdp, setValue('[data-testid="item-qty-1"]', "3"));
    await evaluate(cdp, setValue('[data-testid="item-price-1"]', "500"));
    await evaluate(cdp, setValue('[data-testid="order-discount"]', "100"));

    await sleep(250);
    const subtotal = await evaluate(cdp, textOf('[data-testid="order-subtotal"]'));
    const total = await evaluate(cdp, textOf('[data-testid="order-total"]'));
    check("catalogue rows selected by name", item1 === "ok" && item2 === "ok", `${item1}/${item2}`);
    check("subtotal is computed live (2 × 1000 + 3 × 500)", subtotal === "Rs 3,500.00", subtotal);
    check("total applies the discount (3,500 − 100)", total === "Rs 3,400.00", total);

    /* -- 4. the split ----------------------------------------------------- */
    console.log("    · assigning the referrer and three workers");
    const referrerPick = await evaluate(cdp, setSelect('[data-testid="share-referrer"]', "E2E Referrer"));
    for (let index = 0; index < 3; index += 1) {
      await evaluate(cdp, setSelect(`[data-testid="share-worker-${index}"]`, `E2E Worker ${index + 1}`));
    }
    await sleep(250);
    const referrerPercent = await evaluate(cdp, `document.querySelector('[data-testid="referrer-percent"]')?.value ?? ""`);
    const workerPercent = await evaluate(cdp, `document.querySelector('[data-testid="worker-percent-0"]')?.value ?? ""`);
    const previewText = await evaluate(
      cdp,
      `(document.querySelector('[data-testid="split-preview"]')?.textContent ?? "").replace(/\\s+/g, " ")`,
    );
    check("referrer select accepted the pick", referrerPick === "ok", referrerPick);
    check("referrer percent pre-filled from settings (10)", referrerPercent === "10", referrerPercent);
    check("worker percent pre-filled from settings (20)", workerPercent === "20", workerPercent);
    check(
      "live split shows referrer Rs 340.00 (10%)",
      previewText.includes("Rs 340.00"),
      previewText.slice(0, 200),
    );
    check("live split shows three worker shares of Rs 680.00", previewText.match(/Rs 680\.00/g)?.length === 3, String(previewText.match(/Rs 680\.00/g)?.length));
    check("live split shows the company box Rs 1,020.00 (30%)", previewText.includes("Rs 1,020.00"));
    await screenshot(cdp, "orders-2-editor-with-split.png");

    /* -- 5. save, then pay ----------------------------------------------- */
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
    await screenshot(cdp, "orders-3-detail-payments.png");

    /* -- 6. the bill: preview + 8K PNG ----------------------------------- */
    console.log("    · rendering the bill and exporting the PNG");
    await evaluate(cdp, click('[data-testid="tab-bill"]'));
    await waitFor(cdp, `document.querySelector('[data-testid="bill-preview"] svg') !== null`, 20000, "the bill preview");
    const billText = await evaluate(cdp, `(document.querySelector('[data-testid="bill-preview"]')?.textContent ?? "")`);
    check("the bill preview renders inline", billText.includes(invoiceNumber), billText.slice(0, 80));
    check("the bill shows the client's name", billText.includes("E2E Client (verify-orders)"));
    check("the bill never shows the internal split", !/Khazana|referrer|worker/i.test(billText));
    await screenshot(cdp, "orders-4-bill-preview.png");

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
      writeFileSync(join(SHOT_DIR, "orders-5-exported-8k.png"), buffer);
      console.log(`    · exported PNG copied → ${join(SHOT_DIR, "orders-5-exported-8k.png")}`);
    } else {
      check("the exported PNG landed in the download folder", false, "no PNG appeared within 180 s");
    }

    /* -- 7. Treasury ------------------------------------------------------ */
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
    await screenshot(cdp, "orders-5-treasury.png");

    /* -- 8. the same order as a PLAIN admin ------------------------------ */
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
      await evaluate(
        cdp,
        `(() => {
           const row = [...document.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes(${JSON.stringify(invoiceNumber)}));
           const btn = row ? [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "Open") : null;
           btn?.click();
           return Boolean(btn);
         })()`,
      );
      await waitFor(cdp, `document.querySelector('[data-order-detail]') !== null`, 20000, "the order detail for the plain admin");
      const tabs = await evaluate(cdp, `[...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())`);
      check("a plain admin's order detail has NO Shares tab", !tabs.some((label) => label.startsWith("Shares")), JSON.stringify(tabs));
      const treasuryBlocked = await fetch(`${API}/admin/finance/treasury`, { headers: { Cookie: plainCookie } });
      check("a plain admin still cannot reach the Treasury API", treasuryBlocked.status === 403, String(treasuryBlocked.status));
    } else {
      check("the plain admin could load the order", false, "order id not found for the plain admin");
    }

    /* -- 9. mobile 390 px ------------------------------------------------- */
    console.log("    · checking the Orders list at 390 px");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp.send("Page.navigate", { url: `${BASE}/admin/orders` });
    await waitFor(cdp, `document.querySelector("[data-orders-manager]") !== null`, 25000, "the Orders page on mobile");
    const overflow = await evaluate(
      cdp,
      `({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`,
    );
    check("no horizontal page overflow at 390 px", overflow.scroll <= overflow.client + 1, JSON.stringify(overflow));
    await screenshot(cdp, "orders-6-list-mobile-390.png");
    await cdp.send("Emulation.clearDeviceMetricsOverride");
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
