import FinanceSettings from "../models/FinanceSettings.js";
import Order from "../models/Order.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureFinanceDefaults } from "../services/financeDefaults.js";

/** Whole-number casting: the aggregation can return Mongo doubles. */
const int = (value) => Math.round(Number(value) || 0);

const str = (value, max) => String(value ?? "").trim().slice(0, max);

function serialiseSettings(settings) {
  return {
    referrerBp: settings.referrerBp,
    workerBp: settings.workerBp,
    currency: settings.currency,
    paymentMethods: settings.paymentMethods,
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

  sendData(res, serialiseSettings(settings));
});

/**
 * GET /api/admin/finance/treasury — super_admin only (enforced at the mount).
 *
 * Everything is computed by ONE Mongo aggregation (no per-order loop in JS):
 *   · expected  = Σ split.companyMinor over non-cancelled orders
 *   · collected = Σ floor(split.companyMinor × paidMinor / totalMinor)
 *     — the company's share of the money actually received
 *   · people    = owed / pending / paid-out per payee
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
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              billedMinor: { $sum: "$totalMinor" },
              paidMinor: { $sum: "$paidMinor" },
              expectedCompanyMinor: { $sum: { $ifNull: ["$split.companyMinor", 0] } },
              collectedCompanyMinor: {
                $sum: {
                  $cond: [
                    { $gt: ["$totalMinor", 0] },
                    {
                      $floor: {
                        $divide: [
                          { $multiply: [{ $ifNull: ["$split.companyMinor", 0] }, "$paidMinor"] },
                          "$totalMinor",
                        ],
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
        ],
        people: [
          {
            $project: {
              shares: {
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
            },
          },
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
                  { $gt: ["$totalMinor", 0] },
                  {
                    $floor: {
                      $divide: [
                        { $multiply: [{ $ifNull: ["$split.companyMinor", 0] }, "$payments.amountMinor"] },
                        "$totalMinor",
                      ],
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
