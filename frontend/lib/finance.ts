/**
 * FINANCE UI SHARED CODE — the ONE module that knows how an order status, a
 * payment status and a basis-point percentage are spelled, shaped and coloured.
 *
 * Every status chip in the Orders, Clients, Workers and Treasury pages imports
 * from here, so a label or a tone can never drift between screens. Colours are
 * carried as Badge tones (tokens from globals.css) and are never the only
 * signal: every chip also shows its text and a shape marker.
 */
import type { BadgeTone } from "@/components/ui/Badge";
import type { OrderStatus, PaymentStatus } from "@/types/api";

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
  /** One-line plain-language meaning, shown as a tooltip / hint. */
  meaning: string;
}

/** The six order statuses, in the order the workflow moves through them. */
export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "new",
  "in_progress",
  "review",
  "delivered",
  "completed",
  "cancelled",
];

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  new: { label: "New", tone: "info", meaning: "Booked, work not started yet." },
  in_progress: { label: "In progress", tone: "info", meaning: "Work is under way." },
  review: { label: "In review", tone: "warning", meaning: "Waiting for a check or client feedback." },
  delivered: { label: "Delivered", tone: "success", meaning: "Handed over to the client." },
  completed: { label: "Completed", tone: "success", meaning: "Closed out — normally after full payment." },
  cancelled: { label: "Cancelled", tone: "danger", meaning: "Stopped. Any money received is a refund." },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  unpaid: { label: "Unpaid", tone: "danger", meaning: "Nothing has been received yet." },
  partial: { label: "Partial", tone: "warning", meaning: "Some money received, a balance remains." },
  paid: { label: "Paid", tone: "success", meaning: "The full total has been received." },
};

export function orderStatusMeta(status: OrderStatus | string): StatusMeta {
  return ORDER_STATUS[status as OrderStatus] ?? { label: String(status), tone: "neutral", meaning: "" };
}

export function paymentStatusMeta(status: PaymentStatus | string): StatusMeta {
  return PAYMENT_STATUS[status as PaymentStatus] ?? { label: String(status), tone: "neutral", meaning: "" };
}

/* ---------------------------------------------------------------- percentages */

/** Basis points → a display percentage ("1000" → "10%", "1250" → "12.5%"). */
export function bpToPercent(bp: number): string {
  const value = Number.isFinite(bp) ? Math.round(bp) : 0;
  const major = Math.trunc(value / 100);
  const minor = value % 100;
  if (minor === 0) return `${major}%`;
  return `${major}.${String(minor).padStart(2, "0").replace(/0$/, "")}%`;
}

/** "12.5" / "12.5%" / "12" → basis points (1250). Returns null when invalid. */
export function percentToBp(input: string): number | null {
  const cleaned = String(input ?? "").trim().replace(/%$/, "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const bp = Number.parseInt(whole, 10) * 100 + Number.parseInt(`${fraction}00`.slice(0, 2), 10);
  return bp <= 10000 ? bp : null;
}

/** Basis points → a plain number for the input field ("1000" → "10"). */
export function bpToInput(bp: number): string {
  const value = Number.isFinite(bp) ? Math.round(bp) : 0;
  const major = Math.trunc(value / 100);
  const minor = value % 100;
  return minor === 0 ? String(major) : `${major}.${String(minor).padStart(2, "0")}`;
}

/** The company's own share of an order (100% minus everything assigned). */
export function companyPercent(companyBp: number | undefined, totalBp: number): string {
  if (typeof companyBp === "number") return bpToPercent(companyBp);
  return bpToPercent(Math.max(0, 10000 - totalBp));
}

/* ------------------------------------------------------------------ misc */

/** Human date: "12 Oct 2026" (no time) or "—" when absent. */
export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Human date + time: "12 Oct 2026, 14:35". */
export function formatMoment(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDay(date)}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
