/**
 * BILL SVG — builds ONE self-contained, vector-crisp INVOICE as an SVG string.
 *
 * Pure TypeScript, no React, no DOM and no dependencies, so the exact same
 * function runs in the browser (PNG export) and in Node (`node
 * --experimental-strip-types` for `npm run verify:bill`).
 *
 * ── WHY IT IS A SQUARE 2000×2000 PER PAGE ───────────────────────────────────
 * The output is vector: it is identical at 512 px and at 7680 px (8K). One
 * page is always 2000 × 2000; orders with more than 12 lines stack a SECOND
 * 2000-tall page underneath (viewBox "0 0 2000 4000") and the header band is
 * repeated on it. The PNG exporter rasterises the whole string at whatever
 * width the device allows, so a 1-page bill is still exactly 7680 × 7680.
 *
 * ── WHY HEX LITERS LIVE HERE ───────────────────────────────────────────────
 * An exported PNG is rasterised outside the page: the browser cannot read this
 * app's CSS custom properties when it draws an <img> of an SVG string, so the
 * brand palette is repeated as literals (mirroring the tokens in
 * app/globals.css: Deep Navy / Technology Blue / Official Slate / Growth
 * Green). Growth Green appears ONLY as a tiny status dot.
 *
 * ── WHAT NEVER APPEARS ─────────────────────────────────────────────────────
 * The bill is client-facing. The legacy settlement vocabulary (referrer,
 * worker, treasury, khazana, payout, the word "split") is not rendered and
 * cannot be: this module has no field for it. The optional "Distribution among
 * owners" section only appears when the caller passes `distribution`, and the
 * optional company reserve is printed as the neutral word "Reserve".
 * `verify:bill` asserts that none of the banned words leak.
 */
import { LOGO_PIECES, LOGO_VIEWBOX } from "../../components/services/logoGeometry.ts";
import { minorToParts } from "./money.ts";

/** Brand palette — mirrors the globals.css tokens (see the note above). */
export const BILL_PALETTE = {
  navy: "#212C65",
  blue: "#3D76BB",
  slate: "#A7B3C8",
  green: "#95C93D",
  ink: "#1B2140",
  muted: "#55637D",
  hairline: "#C9D3E3",
  line: "#E4E9F2",
  surface: "#F5F8FC",
  white: "#FFFFFF",
} as const;

/**
 * System font stack — nothing is fetched, so the SVG is self-contained and
 * renders identically inside an <img>, a canvas and a fresh tab.
 */
const FONT = `"Segoe UI", "Helvetica Neue", Arial, "Noto Sans", "Noto Nastaliq Urdu", sans-serif`;
const MONO = `"Cascadia Mono", "Consolas", "SFMono-Regular", "Courier New", monospace`;

const SIZE = 2000;
const MARGIN = 96;

/* Layout grid (all values are in the 2000-unit page space). */
const HEADER_RULE_Y = 452; // navy rule under the header band
const TABLE1_TOP = 820; // page 1 table (the billed-to band sits above it)
const TABLEN_TOP = 560; // later pages
const HEADER_ROW_H = 56;
const ROW_MIN = 40;
const ROW_MAX = 56;
const PAGE1_CAP = 12; // lines per page before a second page is started
const PAGE_N_CAP = 14;
const LIMIT_P0_LAST = 1490; // table must end here on a single-page bill
const LIMIT_PN_LAST = 1500;
const LIMIT_NONLAST = 1720;
const FOOTER_RULE_Y = 1848;
const FOOTER_TEXT_Y = 1892;

/* --------------------------------------------------------------- helpers */

/** XML-escape every user-controlled string (text nodes and attributes). */
export function escapeXml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Right-to-left scripts (Urdu/Arabic…) need direction so they render properly. */
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

function bidi(text: string): string {
  return RTL_RE.test(text) ? ' direction="rtl" unicode-bidi="plaintext"' : "";
}

/**
 * Conservative width estimate (a fraction of the font size per character) so
 * long text is truncated BEFORE it can overflow its column.
 */
function estimatedWidth(text: string, fontSize: number, bold = false): number {
  return text.length * fontSize * (bold ? 0.62 : 0.56);
}

function fit(text: string, maxWidth: number, fontSize: number, bold = false): string {
  const clean = String(text ?? "");
  if (estimatedWidth(clean, fontSize, bold) <= maxWidth) return clean;
  let cut = clean;
  while (cut.length > 1 && estimatedWidth(`${cut}…`, fontSize, bold) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** "Rs 1,234.50" — thousands separators, always two decimals. */
function money(minor: number): string {
  const parts = minorToParts(minor);
  return `Rs ${parts.whole}.${parts.fraction}`;
}

/** Same digits without the label (for tight numeric columns). */
function amount(minor: number): string {
  const parts = minorToParts(minor);
  return `${parts.whole}.${parts.fraction}`;
}

/** "30%" / "33.33%" from integer basis points. */
function percent(bp: number): string {
  const value = Number.isFinite(bp) ? Math.round(bp) : 0;
  const major = Math.trunc(value / 100);
  const minor = value % 100;
  if (minor === 0) return `${major}%`;
  return `${major}.${String(minor).padStart(2, "0").replace(/0$/, "")}%`;
}

function lines(...values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && String(value).trim()));
}

/** One <text> node with the shared font stack and escape rules. */
function text(
  x: number,
  y: number,
  content: string,
  options: {
    size: number;
    weight?: number;
    fill?: string;
    anchor?: "start" | "middle" | "end";
    mono?: boolean;
    opacity?: number;
  },
): string {
  const { size, weight = 400, fill = BILL_PALETTE.ink, anchor = "start", mono = false, opacity } = options;
  const op = opacity === undefined ? "" : ` opacity="${opacity}"`;
  return (
    `<text x="${x}" y="${y}" font-family='${mono ? MONO : FONT}' font-size="${size}" font-weight="${weight}"` +
    ` fill="${fill}" text-anchor="${anchor}"${op}${bidi(content)}>${escapeXml(content)}</text>`
  );
}

const line = (x1: number, y1: number, x2: number, y2: number, stroke: string = BILL_PALETTE.line, width = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;

/* ------------------------------------------------------------------ logo */

/**
 * The real traced artwork, scaled from the 4096 source space into a box.
 * `uid` keeps the gradient ids unique when the header repeats on page 2+.
 */
function logoMarkup(x: number, y: number, size: number, uid: string): string {
  const scale = size / 4096;
  const defs = LOGO_PIECES.map(
    (piece) =>
      `<linearGradient id="bill-${uid}-grad-${piece.id}" gradientUnits="userSpaceOnUse"` +
      ` x1="${piece.gradient.x1}" y1="${piece.gradient.y1}" x2="${piece.gradient.x2}" y2="${piece.gradient.y2}">` +
      piece.gradient.stops
        .map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`)
        .join("") +
      `</linearGradient>`,
  ).join("");
  const paths = LOGO_PIECES.map((piece) => `<path d="${piece.d}" fill="url(#bill-${uid}-grad-${piece.id})"/>`).join("");
  return `<g transform="translate(${x} ${y}) scale(${scale})"><defs>${defs}</defs>${paths}</g>`;
}

/* ------------------------------------------------------------------ data */

export interface BillItem {
  name: string;
  unitLabel: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface BillPayment {
  amountMinor: number;
  method: string;
  receivedAt: string;
  reference?: string;
}

export interface BillBusiness {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  paymentInstructions: string;
  billFooterNote: string;
}

/** One owner line of the distribution table (the optional company reserve included). */
export interface BillOwnerShare {
  name: string;
  role?: string;
  bp: number;
  amountMinor: number;
  isReserve?: boolean;
}

export interface BillData {
  invoiceNumber: string;
  /** Issued (created) date — ISO string. */
  issuedAt: string;
  deliveryDate?: string | null;
  status: "unpaid" | "partial" | "paid";
  business: BillBusiness;
  client: { name: string; company?: string; phone?: string; email?: string; address?: string };
  items: BillItem[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  payments: BillPayment[];
  /**
   * "Distribution among owners" — omitted (or empty) for legacy bills, so an
   * old order exports exactly as it always did.
   */
  distribution?: BillOwnerShare[] | null;
  /** The optional "round shares to the nearest Rs 100" setting, shown when on. */
  roundTo100?: boolean;
  /** Optional client-facing note. Internal order notes are never passed here. */
  notes?: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Compact date for tight rows: "14 Oct 2026" (DD MMM YYYY). */
function formatDayShort(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ---------------------------------------------------------------- layout */

const STATUS_LABEL: Record<BillData["status"], string> = {
  paid: "PAID",
  partial: "PARTIAL",
  unpaid: "UNPAID",
};

/** Split the lines into pages: 12 on the first page, 14 on each later page. */
function chunkItems(items: BillItem[]): BillItem[][] {
  const chunks: BillItem[][] = [];
  let cursor = 0;
  let capacity = PAGE1_CAP;
  while (cursor < items.length) {
    chunks.push(items.slice(cursor, cursor + capacity));
    cursor += capacity;
    capacity = PAGE_N_CAP;
  }
  if (chunks.length === 0) chunks.push([]);
  return chunks;
}

/**
 * buildBillSvg(data) → a complete `<svg …>` string. One 2000 × 2000 page per
 * 12/14 lines, self-contained, deterministic: the same data always produces
 * byte-identical output.
 */
export function buildBillSvg(data: BillData): string {
  const business = data.business;
  const out: string[] = [];
  const chunks = chunkItems(data.items);
  const pageCount = chunks.length;

  chunks.forEach((chunk, pageIndex) => {
    const top = pageIndex * SIZE;
    const isLast = pageIndex === pageCount - 1;
    const pagePrefix = `p${pageIndex}`;

    /* ------------------------------------------- page background + frame */
    out.push(`<rect x="0" y="${top}" width="${SIZE}" height="${SIZE}" fill="${BILL_PALETTE.white}"/>`);
    out.push(
      `<rect x="40" y="${top + 40}" width="${SIZE - 80}" height="${SIZE - 80}" fill="none"` +
        ` stroke="${BILL_PALETTE.navy}" stroke-width="3"/>`,
    );
    out.push(
      `<rect x="52" y="${top + 52}" width="${SIZE - 104}" height="${SIZE - 104}" fill="none"` +
        ` stroke="${BILL_PALETTE.hairline}" stroke-width="1"/>`,
    );

    /* ------------------------------------------------ header band (every page) */
    out.push(logoMarkup(MARGIN + 8, top + 110, 180, pagePrefix));

    const headX = MARGIN + 220;
    out.push(
      text(headX, top + 178, fit(business.businessName || "Jazari Tech", 640, 56, true), {
        size: 56,
        weight: 700,
        fill: BILL_PALETTE.navy,
      }),
    );
    lines(business.address, business.phone, business.email, business.website)
      .slice(0, 4)
      .forEach((value, index) => {
        out.push(text(headX, top + 232 + index * 38, fit(value, 660, 28), { size: 28, fill: BILL_PALETTE.muted }));
      });

    const right = SIZE - MARGIN;
    out.push(text(right, top + 178, "INVOICE", { size: 68, weight: 700, fill: BILL_PALETTE.navy, anchor: "end" }));
    out.push(
      text(right, top + 226, data.invoiceNumber, {
        size: 34,
        weight: 600,
        fill: BILL_PALETTE.ink,
        anchor: "end",
        mono: true,
      }),
    );
    out.push(
      text(right, top + 268, `Issued ${formatDate(data.issuedAt)}`, {
        size: 28,
        fill: BILL_PALETTE.muted,
        anchor: "end",
      }),
    );
    if (data.deliveryDate) {
      out.push(
        text(right, top + 306, `Delivery ${formatDate(data.deliveryDate)}`, {
          size: 28,
          fill: BILL_PALETTE.muted,
          anchor: "end",
        }),
      );
    }

    // Status stamp — outline only, never a big colour fill.
    const stampLabel = STATUS_LABEL[data.status] ?? "UNPAID";
    const stampW = 250;
    const stampH = 74;
    const stampX = right - stampW;
    const stampY = top + (data.deliveryDate ? 336 : 300);
    out.push(
      `<rect x="${stampX}" y="${stampY}" width="${stampW}" height="${stampH}" rx="8"` +
        ` fill="none" stroke="${BILL_PALETTE.navy}" stroke-width="3"/>`,
    );
    out.push(
      text(stampX + stampW / 2, stampY + 50, stampLabel, {
        size: 38,
        weight: 700,
        fill: BILL_PALETTE.navy,
        anchor: "middle",
      }),
    );
    if (data.status === "paid") {
      // Growth Green exists here as ONE tiny dot — never a fill, never text.
      out.push(`<circle cx="${stampX + 22}" cy="${stampY + 37}" r="7" fill="${BILL_PALETTE.green}"/>`);
    }
    if (pageIndex > 0) {
      out.push(
        text(right, top + 396, `${data.invoiceNumber} · page ${pageIndex + 1} of ${pageCount}`, {
          size: 24,
          fill: BILL_PALETTE.muted,
          anchor: "end",
          mono: true,
        }),
      );
    }

    out.push(line(MARGIN, top + HEADER_RULE_Y, SIZE - MARGIN, top + HEADER_RULE_Y, BILL_PALETTE.navy, 2));

    /* -------------------------------------- page 1: billed to + payments */
    if (pageIndex === 0) {
      out.push(text(MARGIN, top + 512, "BILLED TO", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }));
      out.push(
        text(MARGIN, top + 566, fit(data.client.name, 900, 42, true), {
          size: 42,
          weight: 700,
          fill: BILL_PALETTE.ink,
        }),
      );
      lines(data.client.company, data.client.phone, data.client.email, data.client.address)
        .slice(0, 3)
        .forEach((value, index) => {
          out.push(text(MARGIN, top + 612 + index * 38, fit(value, 900, 28), { size: 28, fill: BILL_PALETTE.muted }));
        });

      // Right column: how much has been received, and how to pay.
      const payX = 1180;
      out.push(
        text(payX, top + 512, "PAYMENTS RECEIVED", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }),
      );
      const shown = data.payments.slice(-3).reverse();
      const earlier = Math.max(0, data.payments.length - shown.length);
      if (shown.length === 0) {
        out.push(text(payX, top + 552, "No payments recorded yet.", { size: 26, fill: BILL_PALETTE.muted }));
      }
      shown.forEach((payment, index) => {
        const y = top + 552 + index * 36;
        const label = `${formatDayShort(payment.receivedAt)} · ${payment.method}${
          payment.reference ? ` · ${payment.reference}` : ""
        }`;
        out.push(text(payX, y, fit(label, 560, 22), { size: 22, fill: BILL_PALETTE.muted }));
        out.push(text(right, y, amount(payment.amountMinor), { size: 24, weight: 600, fill: BILL_PALETTE.ink, anchor: "end", mono: true }));
      });
      let payCursor = top + 552 + Math.max(1, shown.length) * 36;
      if (earlier > 0) {
        out.push(text(payX, payCursor, `+${earlier} earlier`, { size: 24, fill: BILL_PALETTE.muted }));
        payCursor += 36;
      }

      const instructions = (business.paymentInstructions || "").trim();
      if (instructions) {
        out.push(text(payX, payCursor + 26, "HOW TO PAY", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }));
        instructions
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 3)
          .forEach((value, index) => {
            out.push(text(payX, payCursor + 62 + index * 32, fit(value, 700, 24), { size: 24, fill: BILL_PALETTE.ink }));
          });
      }
    }

    /* ------------------------------------------------------- items table */
    const tableTop = top + (pageIndex === 0 ? TABLE1_TOP : TABLEN_TOP);
    const limit =
      !isLast ? top + LIMIT_NONLAST : pageIndex === 0 ? top + LIMIT_P0_LAST : top + LIMIT_PN_LAST;
    const maxRows = Math.max(1, chunk.length);
    const rowH = Math.min(
      ROW_MAX,
      Math.max(ROW_MIN, Math.floor((limit - tableTop - HEADER_ROW_H) / maxRows)),
    );
    const rowFont = rowH >= 52 ? 28 : 26;

    const col = { desc: MARGIN, qty: 1180, unit: 1440, amount: SIZE - MARGIN };

    out.push(
      `<rect x="${MARGIN}" y="${tableTop}" width="${SIZE - MARGIN * 2}" height="${HEADER_ROW_H}" fill="${BILL_PALETTE.surface}"/>`,
    );
    out.push(line(MARGIN, tableTop + HEADER_ROW_H, SIZE - MARGIN, tableTop + HEADER_ROW_H, BILL_PALETTE.blue, 2));
    const headerY = tableTop + HEADER_ROW_H / 2 + 9;
    out.push(text(MARGIN + 16, headerY, "DESCRIPTION", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }));
    out.push(text(col.qty - 16, headerY, "QTY", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true, anchor: "end" }));
    out.push(text(col.unit - 16, headerY, "UNIT PRICE", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true, anchor: "end" }));
    out.push(text(col.amount, headerY, "AMOUNT", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true, anchor: "end" }));

    let cursor = tableTop + HEADER_ROW_H;
    chunk.forEach((item, index) => {
      if (index % 2 === 1) {
        out.push(
          `<rect x="${MARGIN}" y="${cursor}" width="${SIZE - MARGIN * 2}" height="${rowH}" fill="${BILL_PALETTE.surface}" opacity="0.55"/>`,
        );
      }
      const baseline = cursor + rowH / 2 + rowFont * 0.36;
      const description = fit(item.name, col.qty - MARGIN - 40, rowFont);
      out.push(text(MARGIN + 16, baseline, description, { size: rowFont, fill: BILL_PALETTE.ink }));
      out.push(text(col.qty - 16, baseline, String(item.quantity), { size: rowFont, fill: BILL_PALETTE.muted, anchor: "end", mono: true }));
      out.push(text(col.unit - 16, baseline, amount(item.unitPriceMinor), { size: rowFont, fill: BILL_PALETTE.muted, anchor: "end", mono: true }));
      out.push(text(col.amount, baseline, amount(item.lineTotalMinor), { size: rowFont, weight: 600, fill: BILL_PALETTE.ink, anchor: "end", mono: true }));
      cursor += rowH;
      out.push(line(MARGIN, cursor, SIZE - MARGIN, cursor, BILL_PALETTE.line, 1));
    });
    out.push(line(MARGIN, tableTop, SIZE - MARGIN, tableTop, BILL_PALETTE.hairline, 1));
    const tableBottom = cursor;

    if (!isLast) return;

    /* ------------------------------------- last page: distribution (left) */
    const distribution = (data.distribution ?? []).filter((entry) => entry && entry.bp !== undefined);
    const by = tableBottom + 56;
    if (distribution.length > 0) {
      out.push(
        text(MARGIN, by, "DISTRIBUTION AMONG OWNERS", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }),
      );
      const shareX = MARGIN + 700;
      const amountX = MARGIN + 1020;
      distribution.slice(0, 6).forEach((entry, index) => {
        const y = by + 44 + index * 40;
        const label = entry.isReserve ? "Reserve" : fit(entry.name, 560, 26, true);
        out.push(text(MARGIN, y, label, { size: 26, weight: entry.isReserve ? 600 : 400, fill: BILL_PALETTE.ink }));
        out.push(text(shareX, y, percent(entry.bp), { size: 26, fill: BILL_PALETTE.muted, anchor: "end", mono: true }));
        out.push(text(amountX, y, amount(entry.amountMinor), { size: 26, weight: 600, fill: BILL_PALETTE.ink, anchor: "end", mono: true }));
        out.push(line(MARGIN, y + 12, amountX, y + 12, BILL_PALETTE.line, 1));
      });
      const totalY = by + 44 + Math.min(distribution.length, 6) * 40;
      out.push(line(MARGIN, totalY - 26, amountX, totalY - 26, BILL_PALETTE.navy, 2));
      out.push(text(MARGIN, totalY + 6, "TOTAL", { size: 26, weight: 700, fill: BILL_PALETTE.navy, mono: true }));
      out.push(
        text(amountX, totalY + 6, amount(distribution.reduce((sum, entry) => sum + entry.amountMinor, 0)), {
          size: 26,
          weight: 700,
          fill: BILL_PALETTE.navy,
          anchor: "end",
          mono: true,
        }),
      );
      out.push(
        text(MARGIN, totalY + 44, `equals the invoice total · ${money(data.totalMinor)}`, {
          size: 22,
          fill: BILL_PALETTE.muted,
        }),
      );
      out.push(
        text(MARGIN, totalY + 76, "Rounded to whole rupees; remainder assigned by largest fraction.", {
          size: 22,
          fill: BILL_PALETTE.muted,
        }),
      );
      if (data.roundTo100) {
        out.push(
          text(MARGIN, totalY + 108, "Shares rounded to the nearest Rs 100 — the last owner takes the leftover.", {
            size: 22,
            fill: BILL_PALETTE.muted,
          }),
        );
      }
    }

    /* ------------------------------------------ last page: totals (right) */
    const totalsX = SIZE - MARGIN;
    let ty = tableBottom + 64;
    const totalRow = (
      label: string,
      value: string,
      options: { strong?: boolean; size?: number; colour?: string } = {},
    ) => {
      const size = options.size ?? 30;
      out.push(
        text(totalsX - 560, ty, label, {
          size,
          weight: options.strong ? 700 : 400,
          fill: options.strong ? BILL_PALETTE.ink : BILL_PALETTE.muted,
        }),
      );
      out.push(
        text(totalsX, ty, value, {
          size,
          weight: options.strong ? 700 : 600,
          fill: options.colour ?? BILL_PALETTE.ink,
          anchor: "end",
          mono: true,
        }),
      );
      ty += size + 22;
    };

    totalRow("Subtotal", money(data.subtotalMinor));
    if (data.discountMinor > 0) totalRow("Discount", `− ${money(data.discountMinor)}`);
    ty += 6;
    out.push(line(totalsX - 560, ty - 26, totalsX, ty - 26, BILL_PALETTE.navy, 2));
    totalRow("TOTAL", money(data.totalMinor), { strong: true, size: 40 });
    totalRow("Paid", money(data.paidMinor));
    totalRow(
      "BALANCE DUE",
      money(data.balanceMinor),
      {
        strong: true,
        size: 34,
        colour: data.balanceMinor > 0 ? BILL_PALETTE.navy : BILL_PALETTE.muted,
      },
    );

    /* ------------------------------------------------------------ footer */
    out.push(line(MARGIN, top + FOOTER_RULE_Y, SIZE - MARGIN, top + FOOTER_RULE_Y, BILL_PALETTE.hairline, 1));
    if (data.notes && data.notes.trim()) {
      out.push(text(MARGIN, top + FOOTER_TEXT_Y, fit(data.notes.trim(), 980, 24), { size: 24, fill: BILL_PALETTE.muted }));
    }
    const footer = business.billFooterNote?.trim() || "Thank you for choosing Jazari Tech.";
    out.push(
      text(SIZE - MARGIN, top + FOOTER_TEXT_Y, fit(footer, 700, 26), {
        size: 26,
        fill: BILL_PALETTE.navy,
        anchor: "end",
      }),
    );
  });

  const height = pageCount * SIZE;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${height}" width="${SIZE}" height="${height}"` +
    ` role="img" aria-label="Invoice ${escapeXml(data.invoiceNumber)}">` +
    `<title>Invoice ${escapeXml(data.invoiceNumber)}</title>` +
    out.join("") +
    `</svg>`
  );
}

export default buildBillSvg;

/** Kept for the harness: the artwork really is the traced logo, in source space. */
export const BILL_LOGO_VIEWBOX = LOGO_VIEWBOX;
