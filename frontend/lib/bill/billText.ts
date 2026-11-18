/**
 * BILL TEXT — "Copy summary as text": the clean WhatsApp-style hisaab the
 * owner sends to people, built from the SAME BillData as the invoice.
 *
 * Pure TypeScript (no DOM), so the browser copies it through the clipboard API
 * and `verify:bill` can assert the exact format in Node.
 *
 * Format rules:
 *  · one bullet per line item — `2 × Video Ad Making — Rs 1,000`
 *  · money as `Rs 1,234` (the `.00` is dropped only when it IS zero)
 *  · subtotal / discount / TOTAL / paid / balance, then the owner distribution
 *    when the order has one, then a one-line sign-off.
 */
import { formatMinorCompact } from "./money.ts";
import type { BillData } from "./billSvg.ts";

const rs = (minor: number): string => formatMinorCompact(minor);

/** Integer basis points → "30%" / "33.33%" / "33.5%". */
function pct(bp: number): string {
  const major = Math.trunc(bp / 100);
  const minor = bp % 100;
  if (minor === 0) return `${major}%`;
  return `${major}.${String(minor).padStart(2, "0").replace(/0$/, "")}%`;
}

/** The copyable, WhatsApp-ready summary of an invoice. */
export function billSummaryText(data: BillData): string {
  const rows: string[] = [];
  const business = data.business.businessName || "Jazari Tech";

  rows.push(`${business} — Invoice ${data.invoiceNumber}`);
  rows.push(`Billed to: ${[data.client.name, data.client.company].filter(Boolean).join(", ")}`);
  rows.push("");

  for (const item of data.items) {
    rows.push(`• ${item.quantity} × ${item.name} — ${rs(item.lineTotalMinor)}`);
  }

  rows.push("");
  rows.push(`Subtotal: ${rs(data.subtotalMinor)}`);
  if (data.discountMinor > 0) rows.push(`Discount: − ${rs(data.discountMinor)}`);
  rows.push(`TOTAL: ${rs(data.totalMinor)}`);
  rows.push(`Paid: ${rs(data.paidMinor)}`);
  rows.push(`Balance due: ${rs(data.balanceMinor)}`);

  const distribution = (data.distribution ?? []).filter((entry) => entry && entry.bp !== undefined);
  if (distribution.length > 0) {
    rows.push("");
    rows.push("Distribution among owners:");
    for (const entry of distribution) {
      const label = entry.isReserve ? "Reserve" : entry.name;
      rows.push(`• ${label} (${pct(entry.bp)}): ${rs(entry.amountMinor)}`);
    }
    rows.push(`Total: ${rs(distribution.reduce((sum, entry) => sum + entry.amountMinor, 0))}`);
    if (data.roundTo100) rows.push("(shares rounded to the nearest Rs 100)");
    else rows.push("(rounded to whole rupees; remainder by largest fraction)");
  }

  rows.push("");
  rows.push(data.business.billFooterNote?.trim() || "Thank you for choosing Jazari Tech.");
  return rows.join("\n");
}

export default billSummaryText;
