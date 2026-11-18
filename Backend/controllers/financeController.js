import FinanceSettings from "../models/FinanceSettings.js";
import Payee from "../models/Payee.js";
import Order from "../models/Order.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureFinanceDefaults } from "../services/financeDefaults.js";
import { validateSplitInput } from "../utils/splitTemplate.js";

/** Whole-number casting: the aggregation can return Mongo doubles. */
const int = (value) => Math.round(Number(value) || 0);

const str = (value, max) => String(value ?? "").trim().slice(0, max);

function serialiseSettings(settings) {
  const template = settings.splitTemplate;
  const entries = Array.isArray(template?.entries) ? template.entries : [];
  return {
    referrerBp: settings.referrerBp,
    workerBp: settings.workerBp,
    currency: settings.currency,
    paymentMethods: settings.paymentMethods,
    /** The three-owner Split Template (super admins may edit it). */
    splitTemplate: {
      entries: entries.map((entry) => ({
        ownerId: entry?.ownerId ? String(entry.ownerId) : null,
        name: entry?.name ?? "",
        role: entry?.role ?? "",
        bp: Number(entry?.bp) || 0,
      })),
      companyReserveBp: Number(template?.companyReserveBp) || 0,
      roundTo100: template?.roundTo100 === true,
      updatedAt: template?.updatedAt ?? null,
      updatedBy: template?.updatedBy ? String(template.updatedBy) : null,
    },
    business: {
      businessName: settings.business?.businessName ?? "",
      address: settings.business?.address ?? "",
      phone: settings.business?.phone ?? "",
      email: settings.business?.email ?? "",
      website: settings.business?.website ?? "",
      paymentInstructions: settings.business?.paymentInstructions ?? "",
      billFooterNote: settings.business?.billFooterNote ?? "",
    },
  };
}

/**
 * GET /api/admin/finance/settings
 * Open to any active admin: the order form and the bill both need the payment
 * methods, the business block and the default percentages. Bootstraps the
 * defaults on first call so production needs no seed.
 */
export const getFinanceSettings = asyncHandler(async (_req, res) => {
  const { settings } = await ensureFinanceDefaults();
  sendData(res, serialiseSettings(settings));
});

/** PUT /api/admin/finance/settings — super_admin only (enforced at the mount). */
export const updateFinanceSettings = asyncHandler(async (req, res) => {
  await ensureFinanceDefaults();
  const body = req.body || {};
  const update = {};

  if (body.referrerBp !== undefined) update.referrerBp = body.referrerBp;
  if (body.workerBp !== undefined) update.workerBp = body.workerBp;

  /* --- THE SPLIT TEMPLATE (super admin only, same gate as treasury) ------- */
  let ownerIds = null;
  if (body.splitTemplate !== undefined) {
    const raw = body.splitTemplate;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.entries) || raw.entries.length === 0) {
      throw ApiError.badRequest("Add at least one owner to the split.", {
        "splitTemplate": "Add at least one owner to the split.",
      });
    }

    const ids = raw.entries
      .map((entry) => String(entry?.ownerId ?? ""))
      .filter((id) => /^[a-f0-9]{24}$/i.test(id));
    if (ids.length !== raw.entries.length) {
      throw ApiError.badRequest("Every share must name one of the company owners.", {
        "splitTemplate": "Every share must name one of the company owners.",
      });
    }
    // Names + roles come from the database, never from the request body.
    const payees = await Payee.find({ _id: { $in: ids }, isActive: true })
      .select("_id name role")
      .lean();
    const byId = new Map(payees.map((payee) => [String(payee._id), payee]));

    const owners = raw.entries.map((entry, index) => {
      const ownerId = String(entry.ownerId);
      const payee = byId.get(ownerId);
      if (!payee) {
        throw ApiError.badRequest("Every share must name an active owner.", {
          [`splitTemplate.entries.${index}.ownerId`]: "Choose an active person.",
        });
      }
      return {
        ownerId,
        name: payee.name,
        role: String(entry?.role ?? "").trim().slice(0, 60),
        bp: Number(entry?.bp),
        isReserve: false,
      };
    });

    // The ONLY hard rule: shares add up to EXACTLY 100% (reserve included).
    const { entries, companyReserveBp } = validateSplitInput(
      owners,
      Number(raw.companyReserveBp) || 0,
      "splitTemplate",
    );

    update.splitTemplate = {
      entries: entries.map((entry) => ({
        ownerId: entry.ownerId,
        name: entry.name,
        role: entry.role,
        bp: entry.bp,
      })),
      companyReserveBp,
      roundTo100: raw.roundTo100 === true,
      updatedAt: new Date(),
      updatedBy: req.admin?.id ?? null,
    };
    ownerIds = ids;
  }

  if (body.currency !== undefined) update.currency = str(body.currency, 8).toUpperCase() || "PKR";
  if (Array.isArray(body.paymentMethods)) {
    const methods = body.paymentMethods.map((method) => str(method, 40)).filter(Boolean);
    if (methods.length === 0) {
      throw ApiError.badRequest("Keep at least one payment method.", {
        paymentMethods: "Add at least one payment method.",
      });
    }
    update.paymentMethods = methods;
  }
  if (body.business && typeof body.business === "object") {
    const business = body.business;
    update.business = {
      businessName: str(business.businessName, 120) || "Jazari Tech",
      address: str(business.address, 240),
      phone: str(business.phone, 40),
      email: str(business.email, 120),
      website: str(business.website, 160),
      paymentInstructions: str(business.paymentInstructions, 1200),
      billFooterNote: str(business.billFooterNote, 240),
    };
  }

  const settings = await FinanceSettings.findOneAndUpdate(
    { key: "default" },
    { $set: update },
    { new: true, runValidators: true, upsert: false },
  );
  if (!settings) throw ApiError.notFound("Finance settings not found.");

  // Saving the template KEEPS the owner flags in sync: exactly the people in
  // the template are marked isOwner (idempotent, two plain $set operations).
  if (ownerIds) {
    await Payee.updateMany({ isOwner: true, _id: { $nin: ownerIds } }, { $set: { isOwner: false } });
    if (ownerIds.length > 0) {
      await Payee.updateMany({ _id: { $in: ownerIds } }, { $set: { isOwner: true } });
    }
  }

  sendData(res, serialiseSettings(settings));
});

/**
 * GET /api/admin/finance/treasury — super_admin only (enforced at the mount).
 *
 * Everything is computed by ONE Mongo aggregation (no per-order loop in JS).
 * Each order contributes from exactly ONE split source, so nothing is ever
 * counted twice:
 *   · ORDERS WITH AN OWNER SPLIT (splitSnapshot) → the reserve line is the
 *     company's share; the owner lines are what people are owed.
 *   · LEGACY ORDERS → split.companyMinor / referrer / workers, exactly as
 *     before, so existing treasury figures never move (migration-tested).
 *   · expected  = Σ company share over non-cancelled orders
 *   · collected = Σ floor(share × paidMinor / totalMinor)
 *     — the company's share of the money actually received
 *   · people    = owed / pending / paid-out per payee (either split model)
 *   · months    = collected company share grouped by the Asia/Karachi month of
 *     each payment's receivedAt, for the last 12 months
 */
export const getTreasury = asyncHandler(async (_req, res) => {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 11);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const [result] = await Order.aggregate([
    { $match: { status: { $ne: "cancelled" } } },
    // One derived company-share figure per order (owner split vs legacy).
    { $addFields: { _entries: { $ifNull: ["$splitSnapshot.entries", []] } } },
    {
      $addFields: {
        _hasSnap: { $gt: [{ $size: "$_entries" }, 0] },
        _reserveMinor: {
          $sum: {
            $map: {
              input: {
                $filter: { input: "$_entries", as: "e", cond: { $eq: ["$$e.isReserve", true] } },
              },
              as: "e",
              in: "$$e.amountMinor",
            },
          },
        },
        _legacyCompany: { $ifNull: ["$split.companyMinor", 0] },
        _total: { $ifNull: ["$totalMinor", 0] },
        _paid: { $ifNull: ["$paidMinor", 0] },
      },
    },
    {
      $addFields: {
        _companyShare: { $cond: ["$_hasSnap", "$_reserveMinor", "$_legacyCompany"] },
      },
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              billedMinor: { $sum: "$totalMinor" },
              paidMinor: { $sum: "$paidMinor" },
              expectedCompanyMinor: { $sum: "$_companyShare" },
              collectedCompanyMinor: {
                $sum: {
                  $cond: [
                    { $gt: ["$_total", 0] },
                    { $floor: { $divide: [{ $multiply: ["$_companyShare", "$_paid"] }, "$_total"] } },
                    0,
                  ],
                },
              },
            },
          },
          { $project: { _id: 0 } },
        ],
        people: [
          {
            $project: {
              legacy: {
                $cond: [
                  "$_hasSnap",
                  [],
                  {
                    $concatArrays: [
                      { $cond: ["$split.referrer", [{ share: "$split.referrer" }], []] },
                      {
                        $map: {
                          input: { $ifNull: ["$split.workers", []] },
                          as: "w",
                          in: { share: "$$w" },
                        },
                      },
                    ],
                  },
                ],
              },
              owners: {
                $cond: [
                  "$_hasSnap",
                  {
                    $map: {
                      input: {
                        $filter: {
                          input: "$_entries",
                          as: "e",
                          cond: { $ne: [{ $ifNull: ["$$e.isReserve", false] }, true] },
                        },
                      },
                      as: "e",
                      in: {
                        share: {
                          payeeId: "$$e.ownerId",
                          name: "$$e.name",
                          amountMinor: { $ifNull: ["$$e.amountMinor", 0] },
                          paidOutAt: { $ifNull: ["$$e.paidOutAt", null] },
                        },
                      },
                    },
                  },
                  [],
                ],
              },
            },
          },
          { $project: { shares: { $concatArrays: ["$legacy", "$owners"] } } },
          { $unwind: "$shares" },
          {
            $group: {
              _id: { payeeId: "$shares.share.payeeId", name: "$shares.share.name" },
              owedMinor: { $sum: "$shares.share.amountMinor" },
              paidOutMinor: {
                $sum: { $cond: ["$shares.share.paidOutAt", "$shares.share.amountMinor", 0] },
              },
              orders: { $sum: 1 },
            },
          },
          { $sort: { owedMinor: -1 } },
          { $limit: 500 },
        ],
        months: [
          { $match: { "payments.0": { $exists: true } } },
          { $unwind: "$payments" },
          { $match: { "payments.receivedAt": { $gte: start } } },
          {
            $addFields: {
              monthKey: {
                $dateToString: { date: "$payments.receivedAt", format: "%Y-%m", timezone: "Asia/Karachi" },
              },
              shareOfPayment: {
                $cond: [
                  { $gt: ["$_total", 0] },
                  {
                    $floor: {
                      $divide: [{ $multiply: ["$_companyShare", "$payments.amountMinor"] }, "$_total"],
                    },
                  },
                  0,
                ],
              },
            },
          },
          {
            $group: {
              _id: "$monthKey",
              collectedMinor: { $sum: "$shareOfPayment" },
              payments: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const totals = result?.totals?.[0] ?? {};
  const expected = int(totals.expectedCompanyMinor);
  const collected = int(totals.collectedCompanyMinor);

  const people = (result?.people ?? []).map((row) => {
    const owed = int(row.owedMinor);
    const paidOut = int(row.paidOutMinor);
    return {
      payeeId: row._id.payeeId ? String(row._id.payeeId) : null,
      name: row._id.name || "—",
      owedMinor: owed,
      paidOutMinor: paidOut,
      pendingMinor: Math.max(0, owed - paidOut),
      orderCount: int(row.orders),
    };
  });

  sendData(res, {
    expectedCompanyMinor: expected,
    collectedCompanyMinor: collected,
    stillToCollectMinor: Math.max(0, expected - collected),
    peopleOwedMinor: people.reduce((sum, person) => sum + person.pendingMinor, 0),
    peoplePaidOutMinor: people.reduce((sum, person) => sum + person.paidOutMinor, 0),
    orders: {
      count: int(totals.orders),
      billedMinor: int(totals.billedMinor),
      paidMinor: int(totals.paidMinor),
      outstandingMinor: Math.max(0, int(totals.billedMinor) - int(totals.paidMinor)),
    },
    people,
    months: (result?.months ?? []).map((row) => ({
      month: row._id,
      collectedMinor: int(row.collectedMinor),
      payments: int(row.payments),
    })),
    generatedAt: new Date().toISOString(),
  });
});
