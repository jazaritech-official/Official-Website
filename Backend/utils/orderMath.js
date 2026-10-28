/**
 * orderMath.js — THE money module for the finance system.
 *
 * Every rupia/Paisa figure in the order, split, treasury and bill flows comes
 * from this file. Nothing else in the codebase is allowed to duplicate this
 * arithmetic, and nothing here touches the database or the network, so it can
 * be unit-checked directly (see the `orders` smoke suite).
 *
 * ── INVARIANTS ──────────────────────────────────────────────────────────────
 *  · All money is INTEGER minor units (paisa). Floating point never touches
 *    a rupee value — `parseMoney` on the frontend is the only string→number
 *    bridge and it returns an integer too.
 *  · Percentages are INTEGER basis points (bp). 10000 bp = 100%, 1000 bp = 10%,
 *    1250 bp = 12.5%. The owner's defaults are referrer 1000 bp and 2000 bp
 *    per worker.
 *  · A person's share = floor(total × bp / 10000) — always rounds DOWN so the
 *    company can never be short-changed.
 *  · The company share is the REMAINDER (total − Σ people), so the four shares
 *    always sum to exactly the order total: no paisa is created or lost.
 *  · Unassigned percentages are NOT redistributed: with no referrer the 10%
 *    simply stays in the company share (spec 2.0d).
 */
import { ApiError } from "./errors.js";

/** Basis points in a whole (100%). */
export const BP = 10000;

/** Maximum workers per order (spec 2.1 — N ≤ 6). */
export const MAX_WORKERS = 6;

/** Default percentages, mirrored by FinanceSettings.referrerBp / workerBp. */
export const DEFAULT_REFERRER_BP = 1000;
export const DEFAULT_WORKER_BP = 2000;

const int = (value) => Number.isInteger(value) ? value : Math.trunc(Number(value));

function assertMinor(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw ApiError.badRequest(`${label} must be a whole number of paisa.`, {
      [label.toLowerCase().replace(/\s+/g, "")]: "Invalid amount.",
    });
  }
}

/**
 * computeTotals(items, discountMinor)
 *
 * Line totals are always recomputed here — a `lineTotalMinor` sent by a client
 * is ignored (asserted by the smoke suite with a forged value).
 *
 * @param {Array<{quantity: number, unitPriceMinor: number}>} items
 * @param {number} discountMinor
 * @returns {{lineTotals: number[], subtotalMinor: number, discountMinor: number, totalMinor: number}}
 */
export function computeTotals(items, discountMinor = 0) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest("An order needs at least one item.", { items: "Add at least one item." });
  }
  if (items.length > 14) {
    throw ApiError.badRequest("An order can have at most 14 items.", { items: "Maximum 14 items per order." });
  }

  const lineTotals = items.map((item, index) => {
    const quantity = int(item?.quantity);
    const unitPriceMinor = int(item?.unitPriceMinor);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      throw ApiError.badRequest("Quantity must be between 1 and 100000.", {
        [`items.${index}.quantity`]: "Enter a quantity between 1 and 100000.",
      });
    }
    if (!Number.isInteger(unitPriceMinor) || unitPriceMinor < 0) {
      throw ApiError.badRequest("Unit price must be zero or more.", {
        [`items.${index}.unitPriceMinor`]: "Enter a valid price.",
      });
    }
    return quantity * unitPriceMinor;
  });

  const subtotalMinor = lineTotals.reduce((sum, value) => sum + value, 0);
  const discount = int(discountMinor ?? 0);
  if (!Number.isInteger(discount) || discount < 0) {
    throw ApiError.badRequest("Discount cannot be negative.", { discount: "Discount cannot be negative." });
  }
  if (discount > subtotalMinor) {
    throw ApiError.badRequest("Discount cannot be more than the subtotal.", {
      discount: "Discount cannot exceed the subtotal.",
    });
  }

  return { lineTotals, subtotalMinor, discountMinor: discount, totalMinor: subtotalMinor - discount };
}

function normaliseBp(bp, fallback, label) {
  const value = bp === undefined || bp === null || bp === "" ? fallback : int(bp);
  if (!Number.isInteger(value) || value < 0 || value > BP) {
    throw ApiError.badRequest(`${label} must be between 0% and 100%.`, {
      split: "Percentages must be between 0 and 100%.",
    });
  }
  return value;
}

/**
 * computeSplit(totalMinor, defaults, referrer, workers)
 *
 * The heart of the business rule:
 *   referrer 10% + 3 workers × 20% = 70% to people, 30% to the company box.
 * Anyone the admin leaves out simply does not get paid their share — it stays
 * with the company. Shares are floor()'d; the company takes the remainder, so
 * the parts always add back up to the total exactly.
 *
 * @param {number} totalMinor                      order NET total (after discount)
 * @param {{referrerBp?: number, workerBp: number}} defaults  settings snapshot
 * @param {null | {payeeId?: string, name?: string, bp?: number}} referrer
 * @param {Array<{payeeId?: string, name?: string, bp?: number}>} workers
 * @returns {{referrerBp:number, workerBp:number, referrer: object|null,
 *           workers: object[], companyMinor:number, companyBp:number, peopleBp:number}}
 */
export function computeSplit(totalMinor, defaults, referrer, workers = []) {
  assertMinor(totalMinor, "Order total");
  if (!Array.isArray(workers) || workers.length > MAX_WORKERS) {
    throw ApiError.badRequest(`An order can have at most ${MAX_WORKERS} workers.`, {
      workers: `Choose at most ${MAX_WORKERS} workers.`,
    });
  }

  const defaultReferrerBp = normaliseBp(defaults?.referrerBp, DEFAULT_REFERRER_BP, "Referrer percentage");
  const defaultWorkerBp = normaliseBp(defaults?.workerBp, DEFAULT_WORKER_BP, "Worker percentage");

  const referrerShare = referrer
    ? {
        payeeId: referrer.payeeId ?? null,
        name: referrer.name ?? "",
        bp: normaliseBp(referrer.bp, defaultReferrerBp, "Referrer percentage"),
        amountMinor: 0,
        paidOutAt: null,
      }
    : null;

  const workerShares = workers.map((worker, index) => ({
    payeeId: worker?.payeeId ?? null,
    name: worker?.name ?? "",
    bp: normaliseBp(worker?.bp, defaultWorkerBp, `Worker ${index + 1} percentage`),
    amountMinor: 0,
    paidOutAt: null,
  }));

  const peopleBp =
    (referrerShare ? referrerShare.bp : 0) + workerShares.reduce((sum, worker) => sum + worker.bp, 0);

  if (peopleBp > BP) {
    throw ApiError.badRequest("Shares cannot add up to more than 100% of the order.", {
      split: "Referrer and workers together must be 100% or less.",
    });
  }

  // Floor each person's share; the company keeps the remainder (≥ 0 by the check
  // above), so Σ people + company === totalMinor exactly, for any integer total.
  if (referrerShare) referrerShare.amountMinor = Math.floor((totalMinor * referrerShare.bp) / BP);
  for (const worker of workerShares) worker.amountMinor = Math.floor((totalMinor * worker.bp) / BP);

  const paidOut = workerShares.reduce((sum, worker) => sum + worker.amountMinor, 0) +
    (referrerShare ? referrerShare.amountMinor : 0);
  const companyMinor = totalMinor - paidOut;

  return {
    referrerBp: defaultReferrerBp,
    workerBp: defaultWorkerBp,
    referrer: referrerShare,
    workers: workerShares,
    peopleBp,
    companyBp: BP - peopleBp,
    companyMinor,
  };
}

/**
 * derivePaymentStatus(paidMinor, totalMinor)
 *
 * The ONLY place a payment status is decided (spec 2.1 — never inferred in the
 * UI, never stored from a client payload).
 *
 *   totalMinor === 0 → "paid"   (a zero-value order is fully settled; there is
 *                                nothing left to collect and `paidMinor` can
 *                                never be negative)
 *   paid  === 0      → "unpaid"
 *   paid  <  total   → "partial"
 *   paid  >= total   → "paid"
 *
 * @returns {"unpaid" | "partial" | "paid"}
 */
export function derivePaymentStatus(paidMinor, totalMinor) {
  const paid = int(paidMinor ?? 0);
  const total = int(totalMinor ?? 0);
  if (total <= 0) return "paid";
  if (paid <= 0) return "unpaid";
  if (paid < total) return "partial";
  return "paid";
}

/** Balance still due, as a non-negative integer (never below zero). */
export function balanceMinor(paidMinor, totalMinor) {
  const paid = int(paidMinor ?? 0);
  const total = int(totalMinor ?? 0);
  return Math.max(0, total - paid);
}
