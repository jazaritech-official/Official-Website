import PushSubscription from "../models/PushSubscription.js";
import { sendData } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPublicKey, isPushEnabled } from "../services/pushService.js";

/**
 * GET /api/push/public-key — public, non-secret VAPID application server key.
 * The frontend only shows its "Enable notifications" prompt when the API
 * reports the feature as configured.
 */
export const getPushKey = asyncHandler(async (_req, res) => {
  sendData(res, {
    key: getPublicKey(),
    configured: isPushEnabled(),
  });
});

/**
 * POST /api/push/subscribe — register (or refresh) a device.
 * Deliberately works even when VAPID keys are absent: the device is stored and
 * delivery simply begins once the owner configures the keys.
 */
export const subscribe = asyncHandler(async (req, res) => {
  const endpoint = String(req.body?.endpoint || "").trim();
  const p256dh = String(req.body?.keys?.p256dh || "").trim();
  const auth = String(req.body?.keys?.auth || "").trim();
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 400);
  const page = String(req.body?.page || "").slice(0, 500);

  const now = new Date();
  const subscription = await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      $set: {
        keys: { p256dh, auth },
        userAgent,
        page,
        isActive: true,
        failureCount: 0,
        lastSeenAt: now,
      },
      $setOnInsert: { endpoint },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
    .select("_id")
    .lean();

  sendData(res, { subscribed: true, id: subscription._id.toString() }, 201);
});

/** POST /api/push/unsubscribe — forget a device by its endpoint. */
export const unsubscribe = asyncHandler(async (req, res) => {
  const endpoint = String(req.body?.endpoint || "").trim();
  const result = await PushSubscription.deleteOne({ endpoint });
  sendData(res, { unsubscribed: result.deletedCount > 0 });
});

export default { getPushKey, subscribe, unsubscribe };
