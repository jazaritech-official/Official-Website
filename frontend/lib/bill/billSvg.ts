/**
 * BILL SVG — builds ONE self-contained, vector-crisp invoice as an SVG string.
 *
 * Pure TypeScript, no React, no DOM and no dependencies, so the exact same
 * function runs in the browser (inline preview + PNG export) and in Node
 * (`node --experimental-strip-types` for `npm run verify:bill`).
 *
 * ── WHY IT IS A SQUARE 2000×2000 ───────────────────────────────────────────
 * The output is vector: it is identical at 512 px and at 7680 px (8K). The PNG
 * exporter rasterises this string at whatever square size the device allows.
 *
 * ── WHY HEX LITERS LIVE HERE ───────────────────────────────────────────────
 * An exported PNG is rasterised outside the page: the browser cannot read this
 * app's CSS custom properties when it draws an <img> of an SVG string, so the
 * brand palette is repeated as literals (mirroring the tokens in
 * app/globals.css: Deep Navy / Technology Blue / Official Slate / Growth
 * Green). Growth Green appears ONLY as a 14 px status dot.
 *
 * ── WHAT NEVER APPEARS ─────────────────────────────────────────────────────
 * The bill is client-facing. The internal split (referrer, workers, company
 * box, treasury) is not rendered and cannot be: this module has no field for
 * it. `verify:bill` asserts that none of those words or numbers leak.
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

function money(minor: number): string {
  const parts = minorToParts(minor);
  return `${parts.whole}.${parts.fraction}`;
}

function lines(...values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && String(value).trim()));
}

/** One <text> node with the shared font stack and escape rules. */
function text(
  x: number,
  y: number,
  content: string,
  options: { size: number; weight?: number; fill?: string; anchor?: "start" | "middle" | "end"; mono?: boolean; opacity?: number } ,
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

/** The real traced artwork, scaled from the 4096 source space into a 190 px box. */
function logoMarkup(x: number, y: number, size: number): string {
  const scale = size / 4096;
  const defs = LOGO_PIECES.map(
    (piece) =>
      `<linearGradient id="bill-grad-${piece.id}" gradientUnits="userSpaceOnUse"` +
      ` x1="${piece.gradient.x1}" y1="${piece.gradient.y1}" x2="${piece.gradient.x2}" y2="${piece.gradient.y2}">` +
      piece.gradient.stops
        .map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`)
        .join("") +
      `</linearGradient>`,
  ).join("");
  const paths = LOGO_PIECES.map(
    (piece) => `<path d="${piece.d}" fill="url(#bill-grad-${piece.id})"/>`,
  ).join("");
  return (
    `<g transform="translate(${x} ${y}) scale(${scale})">` +
    `<defs>${defs}</defs>${paths}</g>`
  );
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
  /** Optional client-facing note. Internal order notes are never passed here. */
  notes?: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/* ---------------------------------------------------------------- layout */

const STATUS_LABEL: Record<BillData["status"], string> = {
  paid: "PAID",
  partial: "PARTIAL",
  unpaid: "UNPAID",
};

/**
 * buildBillSvg(data) → a complete `<svg …>` string, 2000×2000, self-contained.
 * Deterministic: the same data always produces byte-identical output.
 */
export function buildBillSvg(data: BillData): string {
  const business = data.business;
  const out: string[] = [];

  // Background + thin brand hairline frame (blueprint signature).
  out.push(`<rect width="${SIZE}" height="${SIZE}" fill="${BILL_PALETTE.white}"/>`);
  out.push(
    `<rect x="40" y="40" width="${SIZE - 80}" height="${SIZE - 80}" fill="none"` +
      ` stroke="${BILL_PALETTE.navy}" stroke-width="3"/>`,
  );
  out.push(
    `<rect x="52" y="52" width="${SIZE - 104}" height="${SIZE - 104}" fill="none"` +
      ` stroke="${BILL_PALETTE.hairline}" stroke-width="1"/>`,
  );

  /* ------------------------------------------------------------ top band */
  out.push(logoMarkup(MARGIN + 8, 110, 180));

  const headX = MARGIN + 220;
  out.push(text(headX, 178, fit(business.businessName || "Jazari Tech", 640, 56, true), { size: 56, weight: 700, fill: BILL_PALETTE.navy }));
  const businessLines = lines(business.address, business.phone, business.email, business.website);
  businessLines.slice(0, 4).forEach((value, index) => {
    out.push(text(headX, 232 + index * 38, fit(value, 660, 28), { size: 28, fill: BILL_PALETTE.muted }));
  });

  // Right: INVOICE + identifiers.
  const right = SIZE - MARGIN;
  out.push(text(right, 178, "INVOICE", { size: 68, weight: 700, fill: BILL_PALETTE.navy, anchor: "end" }));
  out.push(text(right, 226, data.invoiceNumber, { size: 34, weight: 600, fill: BILL_PALETTE.ink, anchor: "end", mono: true }));
  out.push(text(right, 268, `Issued ${formatDate(data.issuedAt)}`, { size: 28, fill: BILL_PALETTE.muted, anchor: "end" }));
  if (data.deliveryDate) {
    out.push(text(right, 306, `Delivery ${formatDate(data.deliveryDate)}`, { size: 28, fill: BILL_PALETTE.muted, anchor: "end" }));
  }

  // Status stamp — outline only, never a big colour fill.
  const stampLabel = STATUS_LABEL[data.status] ?? "UNPAID";
  const stampW = 250;
  const stampH = 74;
  const stampX = right - stampW;
  const stampY = data.deliveryDate ? 336 : 300;
  out.push(
    `<rect x="${stampX}" y="${stampY}" width="${stampW}" height="${stampH}" rx="8"` +
      ` fill="none" stroke="${BILL_PALETTE.navy}" stroke-width="3"/>`,
  );
  out.push(text(stampX + stampW / 2, stampY + 50, stampLabel, { size: 38, weight: 700, fill: BILL_PALETTE.navy, anchor: "middle" }));
  if (data.status === "paid") {
    // Growth Green exists here as ONE tiny dot — never a fill, never text.
    out.push(`<circle cx="${stampX + 22}" cy="${stampY + 37}" r="7" fill="${BILL_PALETTE.green}"/>`);
  }

  out.push(line(MARGIN, 452, SIZE - MARGIN, 452, BILL_PALETTE.navy, 2));

  /* ---------------------------------------------------------- billed to */
  out.push(text(MARGIN, 512, "BILLED TO", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }));
  out.push(text(MARGIN, 566, fit(data.client.name, 900, 42, true), { size: 42, weight: 700, fill: BILL_PALETTE.ink }));
  const clientLines = lines(data.client.company, data.client.phone, data.client.email, data.client.address);
  clientLines.slice(0, 3).forEach((value, index) => {
    out.push(text(MARGIN, 612 + index * 38, fit(value, 900, 28), { size: 28, fill: BILL_PALETTE.muted }));
  });

  /* -------------------------------------------------------- items table */
  const tableTop = 760;
  const headerH = 56;
  const col = { desc: MARGIN, qty: 1180, unit: 1440, amount: SIZE - MARGIN };
  const maxRows = Math.max(1, Math.min(14, data.items.length));
  const areaBottom = 1560;
  const rowH = Math.min(104, Math.max(54, Math.floor((areaBottom - tableTop - headerH) / maxRows)));
  const rowFont = rowH >= 78 ? 30 : rowH >= 62 ? 28 : 26;

  out.push(`<rect x="${MARGIN}" y="${tableTop}" width="${SIZE - MARGIN * 2}" height="${headerH}" fill="${BILL_PALETTE.surface}"/>`);
  out.push(line(MARGIN, tableTop + headerH, SIZE - MARGIN, tableTop + headerH, BILL_PALETTE.blue, 2));
  const headerY = tableTop + headerH / 2 + 9;
  out.push(text(MARGIN + 16, headerY, "DESCRIPTION", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }));
  out.push(text(col.qty, headerY, "QTY", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true, anchor: "end" }));
  out.push(text(col.unit, headerY, "UNIT PRICE", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true, anchor: "end" }));
  out.push(text(col.amount, headerY, "AMOUNT", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true, anchor: "end" }));

  let cursor = tableTop + headerH;
  data.items.slice(0, 14).forEach((item, index) => {
    if (index % 2 === 1) {
      out.push(
        `<rect x="${MARGIN}" y="${cursor}" width="${SIZE - MARGIN * 2}" height="${rowH}" fill="${BILL_PALETTE.surface}" opacity="0.55"/>`,
      );
    }
    const baseline = cursor + rowH / 2 + rowFont * 0.36;
    const description = fit(item.name, col.qty - MARGIN - 40, rowFont);
    out.push(text(MARGIN + 16, baseline, description, { size: rowFont, fill: BILL_PALETTE.ink }));
    out.push(text(col.qty - 16, baseline, String(item.quantity), { size: rowFont, fill: BILL_PALETTE.muted, anchor: "end" }));
    out.push(text(col.unit - 16, baseline, money(item.unitPriceMinor), { size: rowFont, fill: BILL_PALETTE.muted, anchor: "end" }));
    out.push(text(col.amount, baseline, money(item.lineTotalMinor), { size: rowFont, weight: 600, fill: BILL_PALETTE.ink, anchor: "end" }));
    cursor += rowH;
    out.push(line(MARGIN, cursor, SIZE - MARGIN, cursor, BILL_PALETTE.line, 1));
  });
  out.push(line(MARGIN, tableTop, SIZE - MARGIN, tableTop, BILL_PALETTE.hairline, 1));

  const tableBottom = cursor;

  /* ---------------------------------------------------- payments (left) */
  const left = tableBottom + 56;
  out.push(text(MARGIN, left, "PAYMENTS RECEIVED", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }));
  const shown = data.payments.slice(-4).reverse();
  const earlier = Math.max(0, data.payments.length - shown.length);
  shown.forEach((payment, index) => {
    const y = left + 46 + index * 40;
    const label = `${formatDate(payment.receivedAt)}  ·  ${payment.method}${payment.reference ? `  ·  ${payment.reference}` : ""}`;
    out.push(text(MARGIN, y, fit(label, 760, 26), { size: 26, fill: BILL_PALETTE.muted }));
    out.push(text(MARGIN + 980, y, money(payment.amountMinor), { size: 26, weight: 600, fill: BILL_PALETTE.ink, anchor: "end" }));
  });
  if (data.payments.length === 0) {
    out.push(text(MARGIN, left + 46, "No payments recorded yet.", { size: 26, fill: BILL_PALETTE.muted }));
  } else if (earlier > 0) {
    out.push(text(MARGIN, left + 46 + shown.length * 40, `+${earlier} earlier`, { size: 24, fill: BILL_PALETTE.muted }));
  }

  const instructions = (business.paymentInstructions || "").trim();
  if (instructions) {
    const iy = left + 46 + Math.max(1, shown.length) * 40 + 40;
    out.push(text(MARGIN, iy, "HOW TO PAY", { size: 24, weight: 700, fill: BILL_PALETTE.muted, mono: true }));
    instructions
      .split("\n")
      .slice(0, 5)
      .forEach((value, index) => {
        out.push(text(MARGIN, iy + 40 + index * 36, fit(value.trim(), 980, 26), { size: 26, fill: BILL_PALETTE.ink }));
      });
  }

  /* ------------------------------------------------------- totals (right) */
  const totalsX = SIZE - MARGIN;
  let ty = tableBottom + 56;
  const totalRow = (label: string, value: string, options: { strong?: boolean; size?: number; colour?: string } = {}) => {
    const size = options.size ?? 30;
    out.push(text(totalsX - 520, ty, label, { size, weight: options.strong ? 700 : 400, fill: options.strong ? BILL_PALETTE.ink : BILL_PALETTE.muted }));
    out.push(text(totalsX, ty, value, { size, weight: options.strong ? 700 : 600, fill: options.colour ?? BILL_PALETTE.ink, anchor: "end" }));
    ty += size + 22;
  };

  totalRow("Subtotal", money(data.subtotalMinor));
  if (data.discountMinor > 0) totalRow("Discount", `− ${money(data.discountMinor)}`);
  ty += 6;
  out.push(line(totalsX - 560, ty - 26, totalsX, ty - 26, BILL_PALETTE.navy, 2));
  totalRow("TOTAL", money(data.totalMinor), { strong: true, size: 40 });
  totalRow("Paid", money(data.paidMinor));
  totalRow("BALANCE DUE", money(data.balanceMinor), { strong: true, size: 34, colour: data.balanceMinor > 0 ? BILL_PALETTE.navy : BILL_PALETTE.muted });

  /* ------------------------------------------------------------- footer */
  out.push(line(MARGIN, 1848, SIZE - MARGIN, 1848, BILL_PALETTE.hairline, 1));
  if (data.notes && data.notes.trim()) {
    out.push(text(MARGIN, 1892, fit(data.notes.trim(), 1300, 24), { size: 24, fill: BILL_PALETTE.muted }));
  }
  const footer = business.billFooterNote?.trim() || "Thank you for choosing Jazari Tech.";
  out.push(text(SIZE - MARGIN, 1892, fit(footer, 760, 26), { size: 26, fill: BILL_PALETTE.navy, anchor: "end" }));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}"` +
    ` role="img" aria-label="Invoice ${escapeXml(data.invoiceNumber)}">` +
    `<title>Invoice ${escapeXml(data.invoiceNumber)}</title>` +
    out.join("") +
    `</svg>`
  );
}

export default buildBillSvg;

/** Kept for the harness: the artwork really is the traced logo, in source space. */
export const BILL_LOGO_VIEWBOX = LOGO_VIEWBOX;
