/**
 * splitTemplate.js — the THREE-OWNER split: template validation and money.
 *
 * The whole order amount is divided among the company's owners. The shares are
 * configured ONCE in a Split Template (FinanceSettings.splitTemplate), editable
 * by a super admin only, and expressed as INTEGER basis points (10000 = 100%):
 *
 *   template = [ { ownerId, name, role, bp }, … ]  +  companyReserveBp
 *   Σ owners bp + companyReserveBp === 10000      ← validated server AND client
 *
 * `companyReserveBp` is the OPTIONAL "Company reserve %" (default 0). It lives
 * INSIDE the same 100% total, so with the default 0 the three owners alone
 * total exactly 100%.
 *
 * ── ROUNDING RULE (explicit, shown to the user) ─────────────────────────────
 *   amount_i = floor(total × bp_i / 10000)
 *   the rounding remainder (total − Σ amounts) is handed out ONE minor unit at
 *   a time to the owners with the largest fractional part, ties broken by the
 *   template order. Σ amounts therefore equals the order total EXACTLY.
 *
 *   Optional `roundTo100` (default OFF): each share is rounded to the nearest
 *   Rs 100 (the owner's WhatsApp hisaab rounds like that) and the leftover is
 *   given to the LAST owner, so the sum still equals the total exactly.
 *
 * Pure module: no database, no network — unit-checkable directly (see the
 * `orders` smoke suite and the 200-case property test).
 */
import { ApiError } from "./errors.js";

/** Basis points in a whole (100%). */
export const BP = 10000;

/** Maximum participants in one template (three owners + reserve + headroom). */
export const MAX_SPLIT_ENTRIES = 6;

/** "Round to nearest 100" means 100 RUPEES = 100 × 100 paisa. */
export const ROUND_TO_100_MINOR = 100 * 100;

/** Fixed label of the optional reserve line (shown on the bill when > 0). */
export const RESERVE_LABEL = "Company reserve";

const int = (value) => (Number.isInteger(value) ? value : Math.trunc(Number(value)));

function assertMinor(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw ApiError.badRequest(`${label} must be a whole number of paisa.`, {
      total: "Invalid amount.",
    });
  }
}

function bpError(field, message) {
  throw ApiError.badRequest(message, { [field]: message });
}

/**
 * validateSplitInput(entries, companyReserveBp, field)
 *
 * Normalises a split request and enforces the ONLY hard rule: the shares add
 * up to EXACTLY 100% (10000 bp), reserve included. Returns plain objects ready
 * for the maths below; throws ApiError 400 with a FIELD error otherwise.
 *
 * @param {Array<{ownerId?: string|null, name?: string, role?: string, bp?: number, isReserve?: boolean}>} entries
 * @param {number} companyReserveBp
 * @param {string} field   the field name the client-side error should point at
 */
export function validateSplitInput(entries, companyReserveBp = 0, field = "splitTemplate") {
  if (!Array.isArray(entries) || entries.length === 0) {
    bpError(field, "Add at least one owner to the split.");
  }
  if (entries.length > MAX_SPLIT_ENTRIES) {
    bpError(field, `A split can have at most ${MAX_SPLIT_ENTRIES} entries.`);
  }

  const seen = new Set();
  const normalised = entries.map((entry, index) => {
    const bp = int(entry?.bp);
    if (!Number.isInteger(bp) || bp < 0 || bp > BP) {
      bpError(field, `Share ${index + 1} must be between 0% and 100%.`);
    }
    const ownerId = String(entry?.ownerId ?? "").trim();
    const name = String(entry?.name ?? "").trim().slice(0, 60);
    const role = String(entry?.role ?? "").trim().slice(0, 60);
    if (!ownerId && !entry?.isReserve) {
      bpError(field, `Share ${index + 1} needs an owner.`);
    }
    if (ownerId && seen.has(ownerId)) {
      bpError(field, "The same owner appears twice in the split.");
    }
    if (ownerId) seen.add(ownerId);
    return { ownerId: ownerId || null, name, role, bp, isReserve: entry?.isReserve === true };
  });

  const reserveBp = int(companyReserveBp);
  if (!Number.isInteger(reserveBp) || reserveBp < 0 || reserveBp > BP) {
    bpError(field, "The company reserve must be between 0% and 100%.");
  }

  const totalBp = normalised.reduce((sum, entry) => sum + entry.bp, 0) + reserveBp;
  if (totalBp !== BP) {
    const shown = (totalBp / 100).toFixed(2).replace(/\.00$/, "");
    bpError(field, `Shares must add up to exactly 100% — they currently total ${shown}%.`);
  }

  return { entries: normalised, companyReserveBp: reserveBp };
}

/**
 * computeOwnerSplit(totalMinor, entries, options) → entries with `amountMinor`.
 *
 * The rounding rule from the top of this file, in full:
 *   1. floor each share;
 *   2. hand the remainder out one unit at a time, largest fraction first,
 *      ties by template order;
 *   3. when `roundTo100` is on, round each share to the nearest Rs 100 and
 *      give the leftover to the LAST owner (borrowing from the largest share
 *      in the pathological case where rounding would exceed the total).
 *
 * INVARIANT: Σ entry.amountMinor === totalMinor, always, for any integer total
 * and any shares summing to 10000 bp — asserted over 200 randomised cases.
 *
 * @param {number} totalMinor
 * @param {Array<{ownerId?: string|null, name?: string, role?: string, bp: number, isReserve?: boolean}>} entries
 * @param {{roundTo100?: boolean}} [options]
 */
export function computeOwnerSplit(totalMinor, entries, options = {}) {
  assertMinor(totalMinor, "Order total");
  if (!Array.isArray(entries) || entries.length === 0) {
    throw ApiError.badRequest("A split needs at least one owner.", { split: "Add an owner." });
  }

  const bpList = entries.map((entry) => {
    const bp = int(entry?.bp);
    if (!Number.isInteger(bp) || bp < 0 || bp > BP) {
      throw ApiError.badRequest("Shares must be between 0% and 100%.", {
        split: "Shares must be between 0% and 100%.",
      });
    }
    return bp;
  });
  const bpSum = bpList.reduce((sum, bp) => sum + bp, 0);
  if (bpSum !== BP) {
    throw ApiError.badRequest("Shares must add up to exactly 100%.", {
      split: "Shares must add up to exactly 100%.",
    });
  }

  /* 1. floor(total × bp / 10000) for every entry. `total × bp` stays inside
     the safe-integer range for any realistic order (≤ 1e11 paisa × 10000), so
        the division is exact where the quotient is an integer. */
  const amounts = bpList.map((bp) => Math.floor((totalMinor * bp) / BP));
  const shortfall = totalMinor - amounts.reduce((sum, value) => sum + value, 0);

  /* 2. remainder by largest fractional part, ties by template order. */
  const order = bpList
    .map((bp, index) => {
      const exact = (totalMinor * bp) / BP;
      return { index, fraction: exact - Math.floor(exact) };
    })
    .sort((a, b) => (b.fraction - a.fraction) || (a.index - b.index));

  if (shortfall > 0) {
    for (let step = 0; step < shortfall && step < order.length; step += 1) {
      amounts[order[step].index] += 1;
    }
  } else if (shortfall < 0) {
    // Defensive: float error can never overshoot with the bounds above, but if
    // it ever did, take the units back from the SMALLEST fractions first.
    for (let step = order.length - 1, given = 0; step >= 0 && given < -shortfall; step -= 1) {
      const { index } = order[step];
      if (amounts[index] > 0) {
        amounts[index] -= 1;
        given += 1;
      }
    }
  }

  /* 3. optional round-to-nearest-Rs-100, leftover to the LAST owner. */
  if (options.roundTo100 === true && totalMinor > 0) {
    const rounded = amounts.map((value) => Math.round(value / ROUND_TO_100_MINOR) * ROUND_TO_100_MINOR);
    let othersSum = 0;
    for (let index = 0; index < rounded.length - 1; index += 1) othersSum += rounded[index];
    let last = totalMinor - othersSum;
    if (last < 0) {
      // Pathological case: rounding up pushed the others over the total.
      // Borrow from the largest shares (template order breaks ties) until the
      // last owner is non-negative again — the sum stays exactly the total.
      const lenders = rounded
        .slice(0, -1)
        .map((value, index) => ({ index, value }))
        .sort((a, b) => b.value - a.value || a.index - b.index);
      let deficit = -last;
      for (const lender of lenders) {
        if (deficit <= 0) break;
        const take = Math.min(deficit, rounded[lender.index]);
        rounded[lender.index] -= take;
        deficit -= take;
      }
      last = totalMinor - rounded.slice(0, -1).reduce((sum, value) => sum + value, 0);
    }
    rounded[rounded.length - 1] = last;
    for (let index = 0; index < entries.length; index += 1) amounts[index] = rounded[index];
  }

  return entries.map((entry, index) => ({
    ownerId: entry.ownerId ?? null,
    name: entry.name ?? "",
    role: entry.role ?? "",
    bp: bpList[index],
    isReserve: entry.isReserve === true,
    amountMinor: amounts[index],
  }));
}

/**
 * settingsEntries(settings) → the template as a runnable entry list, with the
 * optional reserve appended as a pseudo-entry. Returns [] when the owner has
 * not configured a template yet (orders then keep the legacy behaviour).
 */
export function settingsEntries(settings) {
  const template = settings?.splitTemplate;
  const raw = Array.isArray(template?.entries) ? template.entries : [];
  if (raw.length === 0) return [];

  const entries = raw.map((entry) => ({
    ownerId: entry?.ownerId ? String(entry.ownerId) : null,
    name: String(entry?.name ?? "").trim(),
    role: String(entry?.role ?? "").trim(),
    bp: int(entry?.bp),
    isReserve: false,
  }));
  const reserveBp = int(template?.companyReserveBp);
  if (reserveBp > 0) {
    entries.push({ ownerId: null, name: RESERVE_LABEL, role: "", bp: reserveBp, isReserve: true });
  }
  return entries;
}

export default computeOwnerSplit;
