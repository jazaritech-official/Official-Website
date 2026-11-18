import Counter from "../models/Counter.js";
import Order from "../models/Order.js";
import Payee from "../models/Payee.js";
import WorkType from "../models/WorkType.js";
import { ApiError } from "../utils/errors.js";
import { ensureFinanceDefaults } from "./financeDefaults.js";
import { FINANCE_SPLIT_SUPER_ONLY } from "../config/finance.js";
import { BP, MAX_WORKERS, computeSplit, computeTotals, derivePaymentStatus, balanceMinor } from "../utils/orderMath.js";
import { computeOwnerSplit, settingsEntries, validateSplitInput } from "../utils/splitTemplate.js";

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

/** True when an owner share of the NEW split has been paid out (locks too). */
export function hasOwnerPaidOut(splitSnapshot) {
  const entries = splitSnapshot?.entries;
  return Array.isArray(entries) && entries.some((entry) => entry?.paidOutAt);
}

/** An order is money-locked once ANY share — legacy or owner split — is paid. */
export function orderLocked(order) {
  return hasPaidOut(order?.split) || hasOwnerPaidOut(order?.splitSnapshot);
}

/** Does this order carry an owner split (the three-owner model)? */
export function hasOwnerSplit(order) {
  return Array.isArray(order?.splitSnapshot?.entries) && order.splitSnapshot.entries.length > 0;
}

/* ------------------------------------------------------- owner split (v2) */

/**
 * Read an optional PER-ORDER override of the split template. Super admins only
 * (a plain admin's override is silently ignored, exactly like the legacy
 * `split` body). Names and roles are ALWAYS resolved server-side from the
 * Payee collection — a client-supplied name is never trusted — and every
 * referenced person must be an active owner.
 *
 * @returns {null | {entries: Array, companyReserveBp: number}}
 */
export async function readSplitOverride(body, req) {
  const raw = body?.splitOverride;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.entries)) return null;
  if (!canAssignSplit(req)) return null;
  if (raw.entries.length === 0) return null;

  const ids = raw.entries
    .map((entry) => String(entry?.ownerId ?? ""))
    .filter((id) => /^[a-f0-9]{24}$/i.test(id));
  const payees = ids.length
    ? await Payee.find({ _id: { $in: ids }, isActive: true, isOwner: true })
        .select("_id name role")
        .lean()
    : [];
  const byId = new Map(payees.map((payee) => [String(payee._id), payee]));

  const entries = raw.entries.map((entry) => {
    const payee = byId.get(String(entry?.ownerId ?? ""));
    if (!payee) {
      throw ApiError.badRequest("Every share must name one of the company owners.", {
        splitOverride: "Choose owners from the owner list.",
      });
    }
    return {
      ownerId: String(payee._id),
      name: payee.name,
      role: String(entry?.role ?? "").trim().slice(0, 60),
      bp: Number(entry?.bp),
      isReserve: false,
    };
  });

  const { companyReserveBp } = validateSplitInput(entries, Number(raw.companyReserveBp) || 0, "splitOverride");
  return { entries, companyReserveBp };
}

/** Resolve a stored template to fresh entries (server-side names) + reserve. */
async function readTemplateEntries(settings) {
  const stored = settingsEntries(settings);
  if (stored.length === 0) return null;

  const ids = stored.filter((entry) => entry.ownerId).map((entry) => entry.ownerId);
  const payees = ids.length
    ? await Payee.find({ _id: { $in: ids } }).select("_id name role").lean()
    : [];
  const byId = new Map(payees.map((payee) => [String(payee._id), payee]));

  const entries = stored.map((entry) => {
    if (entry.isReserve) return entry;
    const payee = byId.get(String(entry.ownerId));
    return {
      ...entry,
      name: payee?.name ?? entry.name,
      role: entry.role || "",
      ownerId: entry.ownerId ? String(entry.ownerId) : null,
    };
  });
  // Defensive: a template saved before this code existed (or edited straight
  // in the database) still has to obey the 100% rule before any money moves.
  validateSplitInput(
    entries.filter((entry) => !entry.isReserve),
    entries.find((entry) => entry.isReserve)?.bp ?? 0,
    "splitTemplate",
  );
  return entries;
}

/**
 * buildSplitSnapshot(totalMinor, body, req) — THE three-owner split.
 *
 * Returns `null` while no Split Template has been configured, so existing
 * deployments keep their legacy behaviour untouched (backward compatibility).
 * With a template — or an explicit super-admin override — the order gets an
 * immutable snapshot: per owner { ownerId, name, role, bp, amountMinor } and
 * the rounding rule of Backend/utils/splitTemplate.js guarantees the amounts
 * sum to EXACTLY the order total.
 */
export async function buildSplitSnapshot(totalMinor, body, req) {
  const settings = await financeSettings();
  const override = await readSplitOverride(body, req);
  const templateEntries = override ? null : await readTemplateEntries(settings);
  const entries = override?.entries ?? templateEntries;
  if (!entries) return null;

  const companyReserveBp = override
    ? override.companyReserveBp
    : entries.find((entry) => entry.isReserve)?.bp ?? 0;
  const owners = entries.filter((entry) => !entry.isReserve);
  validateSplitInput(owners, companyReserveBp, override ? "splitOverride" : "splitTemplate");

  const roundTo100 = settings?.splitTemplate?.roundTo100 === true;

  const computed = computeOwnerSplit(totalMinor, entries, { roundTo100 });
  return {
    entries: computed.map((entry) => ({
      ownerId: entry.ownerId ?? null,
      name: entry.name,
      role: entry.role ?? "",
      bp: entry.bp,
      isReserve: entry.isReserve === true,
      amountMinor: entry.amountMinor,
      paidOutAt: null,
    })),
    roundTo100,
    source: override ? "override" : "template",
    computedAt: new Date(),
  };
}

/**
 * Re-derive the AMOUNTS of an existing snapshot after the total changed.
 * The shares themselves (owner, bp, paid-out state) are kept exactly as they
 * are: history never rewrites itself. `source: "template"` orders can only be
 * re-pointed at the current template through the explicit super-admin
 * "Recalculate split" action.
 */
export function recomputeSnapshotAmounts(snapshot, totalMinor) {
  if (!Array.isArray(snapshot?.entries) || snapshot.entries.length === 0) return snapshot ?? null;
  const computed = computeOwnerSplit(totalMinor, snapshot.entries, {
    roundTo100: snapshot.roundTo100 === true,
  });
  return {
    ...snapshot,
    entries: computed.map((entry, index) => ({
      ...entry,
      paidOutAt: snapshot.entries[index]?.paidOutAt ?? null,
    })),
    computedAt: new Date(),
  };
}

/**
 * Recompute money fields from a candidate item list (server-side only).
 *
 * Each line may reference a WORK TYPE. When it does, the type's name fills in
 * a missing description and `customPrice` is derived by comparing the stored
 * snapshot price with the work type's CURRENT price — so a price change on the
 * Work Types page can never touch an order that already exists (the snapshot
 * wins; only the badge appears).
 *
 * Async because the referenced work types are read from the database in ONE
 * query (never per line).
 */
export async function recomputeOrderMoney(items, discountMinor) {
  const { lineTotals, subtotalMinor, discountMinor: discount, totalMinor } = computeTotals(items, discountMinor);

  const ids = (Array.isArray(items) ? items : [])
    .map((item) => String(item?.workTypeId ?? ""))
    .filter((id) => /^[a-f0-9]{24}$/i.test(id));
  const workTypes = ids.length
    ? await WorkType.find({ _id: { $in: ids } }).select("_id name unitPrice").lean()
    : [];
  const byId = new Map(workTypes.map((workType) => [String(workType._id), workType]));

  const nextItems = items.map((item, index) => {
    const workTypeId = String(item?.workTypeId ?? "");
    const workType = /^[a-f0-9]{24}$/i.test(workTypeId) ? byId.get(workTypeId) : null;
    if (/^[a-f0-9]{24}$/i.test(workTypeId) && !workType) {
      throw ApiError.badRequest("That work type no longer exists.", {
        [`items.${index}.workTypeId`]: "Choose a work type from the list.",
      });
    }
    const name = String(item.name ?? "").trim() || workType?.name || "";
    if (!name) {
      throw ApiError.badRequest("Every item needs a name.", { [`items.${index}.name`]: "Give this line a name." });
    }
    return {
      catalogItemId: item.catalogItemId ?? null,
      workTypeId: workType ? workType._id : null,
      name,
      unitLabel: String(item.unitLabel ?? "item").trim() || "item",
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: lineTotals[index],
      // Derived, never trusted: does this line differ from today's price list?
      customPrice: workType ? item.unitPriceMinor !== workType.unitPrice : false,
    };
  });
  return { items: nextItems, subtotalMinor, discountMinor: discount, totalMinor };
}

export { computeSplit, computeTotals, derivePaymentStatus, balanceMinor, BP, MAX_WORKERS };
