import Order, { ORDER_STATUSES, PAYMENT_STATUSES } from "../models/Order.js";
import Client from "../models/Client.js";
import { sendData, paginationMeta } from "../utils/apiResponse.js";
import { ApiError } from "../utils/errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { searchPattern } from "../utils/safeSearch.js";
import {
  KARACHI_OFFSET_MS,
  balanceMinor,
  buildSplit,
  buildSplitSnapshot,
  canAssignSplit,
  derivePaymentStatus,
  financeSettings,
  hasOwnerSplit,
  nextInvoiceNumber,
  orderLocked,
  recomputeOrderMoney,
  recomputeSnapshotAmounts,
} from "../services/orderService.js";
import { computeSplit } from "../utils/orderMath.js";
import { recordAudit } from "../utils/audit.js";

const int = (value) => Math.round(Number(value) || 0);

/** First instant of the current month, in Asia/Karachi, as a UTC timestamp. */
function karachiMonthStart(now = new Date()) {
  const shifted = new Date(now.getTime() + KARACHI_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - KARACHI_OFFSET_MS);
}

/** Attach the fields the list UI always needs (never a DB read). */
function presentOrder(order, req) {
  const balance = balanceMinor(order.paidMinor, order.totalMinor);
  const base = {
    ...order,
    balanceMinor: balance,
    refundDueMinor: order.status === "cancelled" && order.paidMinor > 0 ? order.paidMinor : 0,
  };
  if (!canAssignSplit(req)) delete base.split;
  return base;
}

function queryFilter(req) {
  const filter = {};
  const status = String(req.query.status ?? "").trim();
  const paymentStatus = String(req.query.paymentStatus ?? "").trim();
  const clientId = String(req.query.clientId ?? "").trim();
  const workTypeId = String(req.query.workTypeId ?? "").trim();

  if (ORDER_STATUSES.includes(status)) filter.status = status;
  if (PAYMENT_STATUSES.includes(paymentStatus)) filter.paymentStatus = paymentStatus;
  if (/^[a-f0-9]{24}$/i.test(clientId)) filter.clientId = clientId;
  // Orders-list "work type" filter — every line is checked, so an order that
  // uses the type on ANY line matches.
  if (/^[a-f0-9]{24}$/i.test(workTypeId)) filter["items.workTypeId"] = workTypeId;

  const from = Date.parse(req.query.from);
  const to = Date.parse(req.query.to);
  if (!Number.isNaN(from)) filter.createdAt = { ...filter.createdAt, $gte: new Date(from) };
  if (!Number.isNaN(to)) {
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);
    filter.createdAt = { ...filter.createdAt, $lte: endOfDay };
  }

  const pattern = searchPattern(req.query.q);
  if (pattern) filter.$or = [{ invoiceNumber: pattern }, { "clientSnapshot.name": pattern }, { title: pattern }];

  return filter;
}

/** GET /api/admin/orders — filters, search, pagination (split hidden for non-super). */
export const listOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const filter = queryFilter(req);
  const projection = canAssignSplit(req) ? "-split" : undefined;

  const [rows, total] = await Promise.all([
    Order.find(filter)
      .select(projection)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  sendData(
    res,
    rows.map((row) => presentOrder(row, req)),
    200,
    paginationMeta({ page, limit, total }),
  );
});

/** GET /api/admin/orders/summary — the four tiles on the Orders page. */
export const getOrderSummary = asyncHandler(async (_req, res) => {
  const monthStart = karachiMonthStart();
  const [result] = await Order.aggregate([
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              openOrders: {
                $sum: { $cond: [{ $in: ["$status", ["new", "in_progress", "review"]] }, 1, 0] },
              },
              unpaidBalanceMinor: {
                $sum: { $max: [0, { $subtract: ["$totalMinor", "$paidMinor"] }] },
              },
              cancelledOrders: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
            },
          },
          { $project: { _id: 0 } },
        ],
        collected: [
          { $match: { "payments.receivedAt": { $gte: monthStart } } },
          { $unwind: "$payments" },
          { $match: { "payments.receivedAt": { $gte: monthStart } } },
          { $group: { _id: null, minor: { $sum: "$payments.amountMinor" }, count: { $sum: 1 } } },
        ],
        delivered: [
          { $unwind: "$statusHistory" },
          {
            $match: {
              "statusHistory.status": { $in: ["delivered", "completed"] },
              "statusHistory.at": { $gte: monthStart },
            },
          },
          { $group: { _id: "$_id" } },
          { $count: "orders" },
        ],
      },
    },
  ]);

  const overall = result?.overall?.[0] ?? {};
  sendData(res, {
    openOrders: int(overall.openOrders),
    unpaidBalanceMinor: int(overall.unpaidBalanceMinor),
    collectedThisMonthMinor: int(result?.collected?.[0]?.minor),
    paymentsThisMonth: int(result?.collected?.[0]?.count),
    deliveredThisMonth: int(result?.delivered?.[0]?.orders),
    monthStart: monthStart.toISOString(),
  });
});

/** GET /api/admin/orders/:id */
export const getOrder = asyncHandler(async (req, res) => {
  const projection = canAssignSplit(req) ? undefined : "-split";
  const order = await Order.findById(req.params.id).select(projection).lean();
  if (!order) throw ApiError.notFound("Order not found.");

  const settings = await financeSettings();
  sendData(res, { ...presentOrder(order, req), paymentMethods: settings.paymentMethods });
});

/** POST /api/admin/orders — creates the invoice, the split and (optionally) the first payment. */
export const createOrder = asyncHandler(async (req, res) => {
  const body = req.body || {};

  const client = await Client.findById(body.clientId).lean();
  if (!client) throw ApiError.notFound("Client not found. Choose an existing client.");

  const settings = await financeSettings();
  const { items, subtotalMinor, discountMinor, totalMinor } = await recomputeOrderMoney(
    body.items || [],
    Number.isInteger(body.discountMinor) ? body.discountMinor : 0,
  );

  const status = ORDER_STATUSES.includes(body.status) ? body.status : "new";
  const split = await buildSplit(totalMinor, body, req);
  // The three-owner split — null until a Split Template is configured, so
  // existing deployments keep their current behaviour (backward compatible).
  const splitSnapshot = await buildSplitSnapshot(totalMinor, body, req);

  // Optional first payment — validated here so the document is written ONCE.
  let initialPayment = null;
  let paidMinor = 0;
  if (body.initialPayment && Number.isInteger(body.initialPayment.amountMinor) && body.initialPayment.amountMinor > 0) {
    const method = String(body.initialPayment.method || "").trim();
    if (!settings.paymentMethods.includes(method)) {
      throw ApiError.badRequest("Choose a payment method that is set up in Settings.", {
        "initialPayment.method": "Choose one of the configured payment methods.",
      });
    }
    const amount = body.initialPayment.amountMinor;
    if (amount > totalMinor) {
      throw ApiError.conflict("The initial payment is more than the order total.", {
        balanceMinor: String(totalMinor),
      });
    }
    paidMinor = amount;
    initialPayment = {
      amountMinor: amount,
      method,
      receivedAt: body.initialPayment.receivedAt ? new Date(body.initialPayment.receivedAt) : new Date(),
      reference: String(body.initialPayment.reference ?? "").trim().slice(0, 120),
      note: String(body.initialPayment.note ?? "").trim().slice(0, 300),
      recordedBy: req.admin.id,
    };
  }

  const document = {
    invoiceNumber: await nextInvoiceNumber(),
    clientId: client._id,
    clientSnapshot: {
      name: client.name,
      phone: client.phone || "",
      email: client.email || "",
      company: client.company || "",
    },
    title: String(body.title ?? "").trim().slice(0, 160),
    notes: String(body.notes ?? "").trim().slice(0, 1000),
    items,
    subtotalMinor,
    discountMinor,
    totalMinor,
    status,
    statusHistory: [{ status, at: new Date(), byAdminId: req.admin.id, note: "Order created" }],
    paymentStatus: derivePaymentStatus(paidMinor, totalMinor),
    paidMinor,
    payments: initialPayment ? [initialPayment] : [],
    deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
    split,
    ...(splitSnapshot ? { splitSnapshot, splitHistory: [] } : {}),
    createdBy: req.admin.id,
  };

  try {
    const order = await Order.create(document);
    return sendData(res, presentOrder(order.toObject(), req), 201);
  } catch (error) {
    // Sequence collision (e.g. a restored database behind its counter) — retry
    // once with the next reserved number, then let the error surface.
    if (error?.code !== 11000) throw error;
    document.invoiceNumber = await nextInvoiceNumber();
    const order = await Order.create(document);
    return sendData(res, presentOrder(order.toObject(), req), 201);
  }
});

/** PUT /api/admin/orders/:id — edit money, people and metadata. */
export const updateOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound("Order not found.");

  const body = req.body || {};
  const locked = orderLocked(order);

  // Titles, notes and delivery dates are always editable; money is not.
  if (body.title !== undefined) order.title = String(body.title).trim().slice(0, 160);
  if (body.notes !== undefined) order.notes = String(body.notes).trim().slice(0, 1000);
  if (body.deliveryDate !== undefined) {
    order.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
  }

  // The client snapshot follows the order's client (spec 2.1).
  if (body.clientId && String(body.clientId) !== String(order.clientId)) {
    const client = await Client.findById(body.clientId).lean();
    if (!client) throw ApiError.notFound("Client not found. Choose an existing client.");
    order.clientId = client._id;
    order.clientSnapshot = {
      name: client.name,
      phone: client.phone || "",
      email: client.email || "",
      company: client.company || "",
    };
  }

  const touchesMoney =
    body.items !== undefined || body.discountMinor !== undefined || body.clientId !== undefined;
  const touchesSplit = body.split !== undefined && canAssignSplit(req);
  // A super admin may override the owner split for THIS order (100% rule
  // enforced server-side); a plain admin's override is ignored.
  const touchesOwnerSplit = body.splitOverride !== undefined && canAssignSplit(req);

  if (touchesMoney || touchesSplit || touchesOwnerSplit) {
    const nextItems = body.items !== undefined ? body.items : order.items;
    const nextDiscount =
      body.discountMinor !== undefined && Number.isInteger(body.discountMinor)
        ? body.discountMinor
        : order.discountMinor;
    const money = await recomputeOrderMoney(nextItems, nextDiscount);

    if (money.totalMinor < order.paidMinor) {
      throw ApiError.conflict(
        "The total cannot be lower than the amount already received. Remove or reduce the payment first.",
        { total: `At least ${order.paidMinor} paisa is already paid.` },
      );
    }

    if (locked && (money.totalMinor !== order.totalMinor || money.discountMinor !== order.discountMinor)) {
      throw ApiError.conflict(
        "A share has already been paid out, so this order's total and split can no longer be changed.",
        { split: "Undo the paid-out share first, or issue a correction order." },
      );
    }

    if (locked && touchesSplit) {
      throw ApiError.conflict(
        "A share has already been paid out, so the split cannot be reassigned.",
        { split: "Undo the paid-out share first." },
      );
    }

    order.items = money.items;
    order.subtotalMinor = money.subtotalMinor;
    order.discountMinor = money.discountMinor;
    order.totalMinor = money.totalMinor;
    order.paymentStatus = derivePaymentStatus(order.paidMinor, money.totalMinor);

    // The snapshot is refreshed whenever it is legal to do so.
    if (!locked) {
      if (touchesSplit) {
        order.split = await buildSplit(money.totalMinor, body, req);
      } else {
        // Same people, new amounts: only the money in the snapshot moves.
        const defaults = await financeSettings();
        const referrer = order.split?.referrer ?? null;
        const workers = order.split?.workers ?? [];
        const rebuilt = computeSplit(
          money.totalMinor,
          { referrerBp: defaults.referrerBp, workerBp: defaults.workerBp },
          referrer ? { payeeId: referrer.payeeId, name: referrer.name, bp: referrer.bp } : null,
          workers.map((worker) => ({ payeeId: worker.payeeId, name: worker.name, bp: worker.bp })),
        );
        order.split = {
          referrerBp: rebuilt.referrerBp,
          workerBp: rebuilt.workerBp,
          referrer: rebuilt.referrer,
          workers: rebuilt.workers,
          companyMinor: rebuilt.companyMinor,
          computedAt: new Date(),
        };
      }

      // Three-owner split: same owners, new amounts — unless a super admin
      // explicitly replaced the split for this order.
      if (hasOwnerSplit(order)) {
        order.splitSnapshot = touchesOwnerSplit
          ? (await buildSplitSnapshot(money.totalMinor, body, req)) ?? recomputeSnapshotAmounts(order.splitSnapshot, money.totalMinor)
          : recomputeSnapshotAmounts(order.splitSnapshot, money.totalMinor);
      } else if (touchesOwnerSplit) {
        // No template at this order's birth, but an explicit override arrives
        // now: adopt the owner model from here on.
        const snapshot = await buildSplitSnapshot(money.totalMinor, body, req);
        if (snapshot) order.splitSnapshot = snapshot;
      }
    }
  }

  if (body.status !== undefined && body.status !== order.status) {
    // Status changes go through PATCH /status (validation + history live there).
    throw ApiError.badRequest("Change the status from the Status control.", {
      status: "Use the status endpoint.",
    });
  }

  await order.save();
  const fresh = await Order.findById(order._id).lean();
  return sendData(res, presentOrder(fresh, req));
});

/**
 * PATCH /api/admin/orders/:id/split/recalculate — SUPER ADMIN ONLY (the mount
 * behind requireRole enforces it, exactly like /payout).
 *
 * The ONLY way an existing order's owner split may change: template-sourced
 * orders are re-pointed at the CURRENT Split Template, override orders keep
 * their own shares and only re-derive the amounts. Frozen once any share has
 * been paid out, and always recorded in the audit log + the order's own
 * splitHistory (the trail shown on the detail page).
 */
export const recalculateSplit = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound("Order not found.");

  if (!hasOwnerSplit(order)) {
    throw ApiError.badRequest("This order predates the owner split — its stored split stays as it is.", {
      splitSnapshot: "Only orders with an owner split can be recalculated.",
    });
  }
  if (orderLocked(order)) {
    throw ApiError.conflict("A share has already been paid out, so this split can no longer be recalculated.", {
      splitSnapshot: "Undo the paid-out share first.",
    });
  }

  let snapshot;
  if (order.splitSnapshot.source === "override") {
    // The order keeps its own shares: only the money is re-derived.
    snapshot = recomputeSnapshotAmounts(order.splitSnapshot, order.totalMinor);
    snapshot.source = "override";
  } else {
    snapshot = await buildSplitSnapshot(order.totalMinor, {}, req);
    if (!snapshot) {
      throw ApiError.badRequest("No Split Template is configured — set one up in Treasury first.", {
        splitSnapshot: "Configure the split template first.",
      });
    }
  }

  order.splitSnapshot = snapshot;
  order.splitHistory = [
    ...(order.splitHistory ?? []),
    {
      at: new Date(),
      byAdminId: req.admin.id,
      source: snapshot.source,
      totalMinor: order.totalMinor,
      note: "Split recalculated",
    },
  ];
  await order.save();

  recordAudit(req, "order.split.recalculated", {
    target: { id: String(order._id), email: order.invoiceNumber },
    metadata: {
      orderId: String(order._id),
      invoiceNumber: order.invoiceNumber,
      totalMinor: order.totalMinor,
      source: snapshot.source,
      entries: snapshot.entries.map((entry) => ({ bp: entry.bp, amountMinor: entry.amountMinor, isReserve: entry.isReserve })),
    },
  });

  const fresh = await Order.findById(order._id).lean();
  return sendData(res, presentOrder(fresh, req));
});

/** PATCH /api/admin/orders/:id/status — any status to any status, with two guards. */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound("Order not found.");

  const status = String(req.body?.status ?? "");
  if (!ORDER_STATUSES.includes(status)) {
    throw ApiError.badRequest("Unknown order status.", { status: "Choose a valid status." });
  }

  const allowUnpaidComplete = req.body?.allowUnpaidComplete === true;
  if (status === "completed" && order.paymentStatus !== "paid" && !allowUnpaidComplete) {
    throw ApiError.conflict(
      "This order is not fully paid. Record the balance first, or confirm completing it anyway.",
      { paymentStatus: `Balance due: ${balanceMinor(order.paidMinor, order.totalMinor)} paisa.` },
    );
  }

  if (status !== order.status) {
    order.status = status;
    order.statusHistory.push({
      status,
      at: new Date(),
      byAdminId: req.admin.id,
      note: String(req.body?.note ?? "").trim().slice(0, 200),
    });
    await order.save();
  }

  const refundDueMinor = status === "cancelled" && order.paidMinor > 0 ? order.paidMinor : 0;
  const fresh = await Order.findById(order._id).lean();

  return sendData(res, { ...presentOrder(fresh, req), refundDueMinor });
});
