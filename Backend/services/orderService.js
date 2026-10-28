import Counter from "../models/Counter.js";
import Order from "../models/Order.js";
import Payee from "../models/Payee.js";
import { ApiError } from "../utils/errors.js";
import { ensureFinanceDefaults } from "./financeDefaults.js";
import { FINANCE_SPLIT_SUPER_ONLY } from "../config/finance.js";
import { BP, MAX_WORKERS, computeSplit, computeTotals, derivePaymentStatus, balanceMinor } from "../utils/orderMath.js";

/** Pakistan is UTC+6 year-round (no DST), so the offset clock is exact. */
export const KARACHI_OFFSET_MS = 6 * 60 * 60 * 1000;

/** The invoice year follows Asia/Karachi, not the server's timezone. */
export function karachiYear(date = new Date()) {
  return new Date(date.getTime() + KARACHI_OFFSET_MS).getUTCFullYear();
}

/** The finance singleton, bootstrapped on first use. */
export async function financeSettings() {
  const { settings } = await ensureFinanceDefaults();
  return settings;
}

/** Is this request allowed to see/assign the money split? */
export function canAssignSplit(req) {
  return !FINANCE_SPLIT_SUPER_ONLY || req.admin?.role === "super_admin";
}

export function isSuperAdmin(req) {
  return req.admin?.role === "super_admin";
}

/**
 * Reserve the next invoice number: `JZ-YYYY-NNNN`, one atomic `$inc` per year.
 *
 * The read-back exists only to survive the (unlikely) case of a restored
 * database whose Counter is behind existing orders — it never races, because
 * the sequence itself is incremented atomically inside MongoDB.
 */
export async function nextInvoiceNumber(date = new Date()) {
  const year = karachiYear(date);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const seq = await Counter.next(`order:${year}`);
    const invoiceNumber = `JZ-${year}-${String(seq).padStart(4, "0")}`;
    if (!(await Order.exists({ invoiceNumber }))) return invoiceNumber;
  }
  throw new ApiError(500, "INVOICE_SEQUENCE", "Could not allocate an invoice number. Please try again.");
}

/**
 * Read the split portion of a request body, resolving payee names SERVER-SIDE
 * (a client-supplied name is never trusted) and dropping unknown payee ids.
 */
export async function readSplitInput(body) {
  const raw = body?.split;
  if (!raw || typeof raw !== "object") return { referrer: null, workers: [] };

  const wanted = [];
  if (raw.referrer?.payeeId) wanted.push(raw.referrer.payeeId);
  for (const worker of Array.isArray(raw.workers) ? raw.workers : []) {
    if (worker?.payeeId) wanted.push(worker.payeeId);
  }
  const payees = wanted.length
    ? await Payee.find({ _id: { $in: wanted }, isActive: true })
        .select("_id name")
        .lean()
    : [];
  const byId = new Map(payees.map((payee) => [String(payee._id), payee.name]));

  const bpOf = (value) => (Number.isInteger(value) ? value : undefined);

  let referrer = null;
  if (raw.referrer && typeof raw.referrer === "object") {
    const payeeId = raw.referrer.payeeId || null;
    const name = payeeId ? byId.get(String(payeeId)) ?? "" : String(raw.referrer.name ?? "").trim();
    if (payeeId || name) referrer = { payeeId, name, bp: bpOf(raw.referrer.bp) };
  }

  const workers = (Array.isArray(raw.workers) ? raw.workers : [])
    .filter((worker) => worker && typeof worker === "object")
    .map((worker) => {
      const payeeId = worker.payeeId || null;
      const name = payeeId ? byId.get(String(payeeId)) ?? "" : String(worker.name ?? "").trim();
      return { payeeId, name, bp: bpOf(worker.bp) };
    })
    .filter((worker) => worker.payeeId || worker.name)
    .slice(0, MAX_WORKERS);

  return { referrer, workers };
}

/**
 * Compute the snapshot that is stored on the order. A plain admin's request
 * never carries split data when FINANCE_SPLIT_SUPER_ONLY is on: the defaults
 * are used with nobody assigned, so the company box keeps the whole share until
 * a super admin picks people.
 */
export async function buildSplit(totalMinor, body, req) {
  const settings = await financeSettings();
  const defaults = { referrerBp: settings.referrerBp, workerBp: settings.workerBp };
  const input = canAssignSplit(req) ? await readSplitInput(body) : { referrer: null, workers: [] };
  const split = computeSplit(totalMinor, defaults, input.referrer, input.workers);
  return {
    referrerBp: split.referrerBp,
    workerBp: split.workerBp,
    referrer: split.referrer,
    workers: split.workers,
    companyMinor: split.companyMinor,
    computedAt: new Date(),
  };
}

/** True when anybody has already been paid their share (locks the split). */
export function hasPaidOut(split) {
  if (!split) return false;
  if (split.referrer?.paidOutAt) return true;
  return Array.isArray(split.workers) && split.workers.some((worker) => worker.paidOutAt);
}

/** Recompute money fields from a candidate item list (server-side only). */
export function recomputeOrderMoney(items, discountMinor) {
  const { lineTotals, subtotalMinor, discountMinor: discount, totalMinor } = computeTotals(items, discountMinor);
  const nextItems = items.map((item, index) => ({
    catalogItemId: item.catalogItemId ?? null,
    name: String(item.name ?? "").trim(),
    unitLabel: String(item.unitLabel ?? "item").trim() || "item",
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    lineTotalMinor: lineTotals[index],
  }));
  return { items: nextItems, subtotalMinor, discountMinor: discount, totalMinor };
}

export { computeSplit, computeTotals, derivePaymentStatus, balanceMinor, BP, MAX_WORKERS };
