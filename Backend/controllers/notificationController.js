import env from "../config/env.js";
import Notification from "../models/Notification.js";
import PushSubscription from "../models/PushSubscription.js";
import { ApiError } from "../utils/errors.js";
import { sendData } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { buildPayload, deliver, isPushEnabled, mapWithConcurrency } from "../services/pushService.js";

const DELIVERY_CONCURRENCY = 20;

/**
 * Deliver a notification and persist the outcome.
 * @param {object} notification  mongoose document (title/body/url/icon/tag)
 * @param {string} [onlyEndpoint] when set, deliver to a single device only
 *                                (used by the admin "send test to this device")
 */
async function dispatch(notification, onlyEndpoint) {
  if (!isPushEnabled()) {
    throw ApiError.serviceUnavailable(
      "Push notifications are not configured on the server. Add the VAPID keys and try again.",
    );
  }

  const filter = { isActive: true };
  if (onlyEndpoint) filter.endpoint = onlyEndpoint;

  const subscriptions = await PushSubscription.find(filter).lean();
  const payload = buildPayload(notification);

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const maxFailures = env.push.maxFailures;

  const outcomes = await mapWithConcurrency(subscriptions, DELIVERY_CONCURRENCY, async (subscription) => {
    const result = await deliver(subscription, payload);

    if (result.ok) {
      await PushSubscription.updateOne(
        { _id: subscription._id },
        { $set: { lastSeenAt: new Date(), isActive: true, failureCount: 0 } },
      );
      return "sent";
    }

    if (result.gone) {
      await PushSubscription.deleteOne({ _id: subscription._id });
      removed += 1;
      return "removed";
    }

    // Transient failure: count it and deactivate noisy endpoints.
    await PushSubscription.updateOne({ _id: subscription._id }, { $inc: { failureCount: 1 } });
    if ((subscription.failureCount || 0) + 1 >= maxFailures) {
      await PushSubscription.updateOne({ _id: subscription._id }, { $set: { isActive: false } });
    }
    return "failed";
  });

  for (const outcome of outcomes) {
    if (outcome === "sent") sent += 1;
    else if (outcome === "removed") {
      failed += 1;
      removed += 1;
    } else if (outcome === "failed") failed += 1;
  }

  notification.stats = {
    targeted: subscriptions.length,
    sent,
    failed,
    removed,
  };
  notification.status = subscriptions.length === 0 ? "failed" : sent > 0 ? "sent" : "failed";
  notification.error =
    subscriptions.length === 0
      ? "No active devices to deliver to."
      : sent === 0
        ? "Delivery failed for every device."
        : "";
  notification.sentAt = new Date();
  await notification.save();
  return notification;
}

/** GET /api/admin/notifications — most recent first. */
export const listNotifications = asyncHandler(async (_req, res) => {
  const items = await Notification.find({}).sort({ createdAt: -1 }).limit(50).select("-__v").lean();
  sendData(res, items);
});

/** GET /api/admin/notifications/stats — audience + delivery counters. */
export const getNotificationStats = asyncHandler(async (_req, res) => {
  const [total, active, recent] = await Promise.all([
    PushSubscription.countDocuments({}),
    PushSubscription.countDocuments({ isActive: true }),
    Notification.aggregate([
      { $match: { status: "sent" } },
      {
        $group: {
          _id: null,
          sent: { $sum: "$stats.sent" },
          failed: { $sum: "$stats.failed" },
          notifications: { $sum: 1 },
        },
      },
    ]),
  ]);

  const totals = recent[0] || { sent: 0, failed: 0, notifications: 0 };
  sendData(res, {
    subscribers: total,
    activeSubscribers: active,
    notificationsSent: totals.notifications,
    delivered: totals.sent,
    failed: totals.failed,
    pushConfigured: isPushEnabled(),
  });
});

/** POST /api/admin/notifications — compose, optionally sending immediately. */
export const createNotification = asyncHandler(async (req, res) => {
  const sendNow = req.body?.send === true || req.body?.send === "true";

  const notification = await Notification.create({
    title: req.body.title,
    body: req.body.body,
    url: req.body.url || "/",
    icon: req.body.icon || "",
    tag: req.body.tag || "",
    serviceSlug: req.body.serviceSlug || "",
    createdBy: req.admin?.id ?? null,
    createdByName: req.admin?.name || req.admin?.email || "",
  });

  if (!sendNow) return sendData(res, notification.toObject(), 201);

  try {
    const delivered = await dispatch(notification);
    return sendData(res, delivered.toObject(), 201);
  } catch (error) {
    // Keep the draft so the owner can retry once VAPID is configured.
    notification.status = "failed";
    notification.error = String(error.message || "").slice(0, 400);
    await notification.save();
    throw error;
  }
});

/**
 * POST /api/admin/notifications/:id/send — deliver an existing notification.
 * Optional `endpoint` in the body targets a single device (a safe test send).
 */
export const sendNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) throw ApiError.notFound("That notification no longer exists.");

  const endpoint = String(req.body?.endpoint || "").trim() || undefined;
  const delivered = await dispatch(notification, endpoint);
  sendData(res, delivered.toObject());
});

/** DELETE /api/admin/notifications/:id */
export const deleteNotification = asyncHandler(async (req, res) => {
  const result = await Notification.deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) throw ApiError.notFound("That notification no longer exists.");
  sendData(res, { id: req.params.id, deleted: true });
});

export default {
  listNotifications,
  getNotificationStats,
  createNotification,
  sendNotification,
  deleteNotification,
};
