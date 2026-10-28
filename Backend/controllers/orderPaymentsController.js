import mongoose from "mongoose";
import Order from "../models/Order.js";
import { sendData } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { balanceMinor, financeSettings, hasPaidOut } from "../services/orderService.js";

/**
 * PAYMENTS AND PAYOUTS
 *
 * Both money-moving writes are single-document atomic updates — there are no
 * Mongo transactions in this codebase (Vercel is serverless), so correctness
 * comes from a guarded `findOneAndUpdate` plus an aggregation-pipeline update
 * that recomputes `paymentStatus` from the value it just wrote.
 *
 * The guard is what makes concurrent payments safe:
 *     { _id, status: { $ne: "cancelled" },
 *       paidMinor: { $lte: totalMinor - amountMinor } }
 * Two simultaneous payments can therefore never push `paidMinor` above the
 * order total: whichever would overshoot simply matches nothing and gets 409.
 */

/** Recompute paymentStatus from inside the update (second pipeline stage). */
const STATUS_STAGE = {
  $set: {
    paymentStatus: {
      $cond: [
        { $lte: ["$totalMinor", 0] },
        "paid",
        {
          $cond: [
            { $gte: ["$paidMinor", "$totalMinor"] },
            "paid",
            { $cond: [{ $gt: ["$paidMinor", 0] }, "partial", "unpaid"] },
          ],
        },
      ],
    },
  },
};

function assertPositiveInt(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw ApiError.badRequest("Enter an amount greater than zero.", {
      [field]: "Enter an amount greater than zero.",
    });
  }
  return value;
}

/** POST /api/admin/orders/:id/payments */
export const recordPayment = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const order = await Order.findById(req.params.id)
    .select("totalMinor paidMinor status paymentStatus invoiceNumber clientSnapshot")
    .lean();
  if (!order) throw ApiError.notFound("Order not found.");
  if (order.status === "cancelled") {
    throw ApiError.conflict("A cancelled order cannot receive payments.", {
      status: "Reopen the order before recording a payment.",
    });
  }

  const amountMinor = assertPositiveInt(body.amountMinor, "amountMinor");
  const settings = await financeSettings();
  const method = String(body.method ?? "").trim();
  if (!settings.paymentMethods.includes(method)) {
    throw ApiError.badRequest("Choose a payment method that is set up in Settings.", {
      method: "Choose one of the configured payment methods.",
    });
  }
  const receivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) {
    throw ApiError.badRequest("Received date is not valid.", { receivedAt: "Enter a valid date." });
  }
  if (receivedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw ApiError.badRequest("Received date cannot be in the future.", {
      receivedAt: "Received date cannot be in the future.",
    });
  }
  if (amountMinor > order.totalMinor) {
    throw ApiError.conflict("That is more than the balance due.", {
      balanceMinor: String(balanceMinor(order.paidMinor, order.totalMinor)),
    });
  }

  const payment = {
    _id: new mongoose.Types.ObjectId(),
    amountMinor,
    method,
    receivedAt,
    reference: String(body.reference ?? "").trim().slice(0, 120),
    note: String(body.note ?? "").trim().slice(0, 300),
    recordedBy: req.admin.id,
  };

  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: { $ne: "cancelled" },
      paidMinor: { $lte: order.totalMinor - amountMinor },
    },
    [
      {
        $set: {
          paidMinor: { $add: [{ $ifNull: ["$paidMinor", 0] }, amountMinor] },
          payments: { $concatArrays: [{ $ifNull: ["$payments", []] }, [payment]] },
        },
      },
      STATUS_STAGE,
    ],
    { new: false },
  );

  if (!updated) {
    const current = await Order.findById(order._id).select("paidMinor totalMinor status").lean();
    if (!current) throw ApiError.notFound("Order not found.");
    if (current.status === "cancelled") {
      throw ApiError.conflict("A cancelled order cannot receive payments.", { status: "Order is cancelled." });
    }
    throw ApiError.conflict("That would overpay the order.", {
      balanceMinor: String(balanceMinor(current.paidMinor, current.totalMinor)),
    });
  }

  const fresh = await Order.findById(order._id)
    .select("paidMinor totalMinor paymentStatus payments")
    .lean();
  const created = fresh.payments.find((entry) => String(entry._id) === String(payment._id));

  return sendData(
    res,
    {
      payment: created ?? null,
      order: {
        _id: order._id,
        invoiceNumber: order.invoiceNumber,
        paidMinor: fresh.paidMinor,
        totalMinor: fresh.totalMinor,
        paymentStatus: fresh.paymentStatus,
        balanceMinor: balanceMinor(fresh.paidMinor, fresh.totalMinor),
      },
    },
    201,
  );
});

/** DELETE /api/admin/orders/:id/payments/:paymentId — recomputes atomically. */
export const deletePayment = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .select("paidMinor totalMinor status paymentStatus payments split invoiceNumber")
    .lean();
  if (!order) throw ApiError.notFound("Order not found.");

  const payment = (order.payments || []).find((entry) => String(entry._id) === String(req.params.paymentId));
  if (!payment) throw ApiError.notFound("Payment not found.");

  if (hasPaidOut(order.split)) {
    throw ApiError.conflict(
      "A share has already been paid out, so payments can no longer be removed from this order.",
      { split: "Undo the paid-out share first." },
    );
  }
  if (order.paidMinor < payment.amountMinor) {
    throw ApiError.conflict("The recorded total is lower than this payment.", {
      paidMinor: "Contact support — the order totals look inconsistent.",
    });
  }

  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: { $ne: "cancelled" },
      paidMinor: { $gte: payment.amountMinor },
      "payments._id": payment._id,
    },
    [
      {
        $set: {
          paidMinor: { $subtract: ["$paidMinor", payment.amountMinor] },
          payments: {
            $filter: {
              input: { $ifNull: ["$payments", []] },
              as: "entry",
              cond: { $ne: ["$$entry._id", payment._id] },
            },
          },
        },
      },
      STATUS_STAGE,
    ],
    { new: false },
  );

  if (!updated) {
    const current = await Order.findById(order._id).select("payments").lean();
    if (!current || !current.payments.some((entry) => String(entry._id) === String(payment._id))) {
      throw ApiError.notFound("Payment not found.");
    }
    throw ApiError.conflict("That payment could not be removed right now. Please refresh and try again.", {
      payment: "Payment could not be removed.",
    });
  }

  const fresh = await Order.findById(order._id)
    .select("paidMinor totalMinor paymentStatus")
    .lean();

  return sendData(res, {
    id: payment._id,
    deleted: true,
    order: {
      _id: order._id,
      invoiceNumber: order.invoiceNumber,
      paidMinor: fresh.paidMinor,
      totalMinor: fresh.totalMinor,
      paymentStatus: fresh.paymentStatus,
      balanceMinor: balanceMinor(fresh.paidMinor, fresh.totalMinor),
    },
  });
});

/**
 * PATCH /api/admin/orders/:id/payout — super_admin only (enforced at the mount).
 * body: { party: "referrer" | "worker", payeeId, paid: boolean }
 */
export const setPayout = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound("Order not found.");

  const party = String(req.body?.party ?? "");
  if (party !== "referrer" && party !== "worker") {
    throw ApiError.badRequest("Choose who was paid.", { party: "Choose referrer or worker." });
  }
  const payeeId = String(req.body?.payeeId ?? "");
  if (!mongoose.isValidObjectId(payeeId)) {
    throw ApiError.badRequest("Choose a person.", { payeeId: "Choose a valid person." });
  }
  const paid = req.body?.paid !== false;

  if (order.status === "cancelled") {
    throw ApiError.conflict("A cancelled order has no payouts.", { status: "Order is cancelled." });
  }

  if (party === "referrer") {
    const share = order.split?.referrer;
    if (!share || String(share.payeeId ?? "") !== payeeId) {
      throw ApiError.notFound("This order has no referrer share for that person.");
    }
    share.paidOutAt = paid ? new Date() : null;
  } else {
    const share = (order.split?.workers ?? []).find((worker) => String(worker.payeeId ?? "") === payeeId);
    if (!share) throw ApiError.notFound("This order has no worker share for that person.");
    share.paidOutAt = paid ? new Date() : null;
  }

  // Mongoose writes only the modified paths ($set), so a concurrent payment is
  // never clobbered — one document, one atomic update.
  await order.save();

  return sendData(res, { split: order.split, party, payeeId, paid });
});
