import webpush from "web-push";
import env from "../config/env.js";

/**
 * Web Push delivery layer — the ONLY place `web-push` is used.
 *
 * VAPID details are configured once at module load. When the keys are missing
 * (or rejected) `isPushEnabled()` is false and callers return a clean 503
 * instead of throwing an internal error.
 */

const DEFAULT_ICON = "/brand/icon-192.png";
const DEFAULT_TAG = "jazari-update";
const TTL_SECONDS = 60 * 60 * 24; // keep for a day if the device is offline

let configured = false;

if (env.push.enabled) {
  try {
    webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);
    configured = true;
  } catch (error) {
    console.error(`[push] VAPID configuration was rejected: ${error.message}`);
  }
}

/** True when both VAPID keys are valid and push delivery is available. */
export function isPushEnabled() {
  return configured;
}

/** Public (non-secret) application server key the browser subscribes with. */
export function getPublicKey() {
  return configured ? env.push.publicKey : "";
}

/** The JSON payload delivered to the service worker's `push` handler. */
export function buildPayload({ title, body, url, icon, tag }) {
  return JSON.stringify({
    title: title || "Jazari Tech",
    body: body || "",
    url: url || "/",
    icon: icon || DEFAULT_ICON,
    badge: DEFAULT_ICON,
    tag: tag || DEFAULT_TAG,
    timestamp: Date.now(),
  });
}

/** Plain target object web-push expects, from a stored subscription. */
export function toTarget(subscription) {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys?.p256dh ?? subscription.p256dh,
      auth: subscription.keys?.auth ?? subscription.auth,
    },
  };
}

/**
 * Deliver one payload to one subscription.
 * @returns {Promise<{ok: boolean, gone: boolean, statusCode: number}>}
 *   `gone` is true when the push service says the endpoint no longer exists
 *   (404/410) and the subscription should be deleted.
 */
export async function deliver(subscription, payload) {
  try {
    await webpush.sendNotification(toTarget(subscription), payload, { TTL: TTL_SECONDS });
    return { ok: true, gone: false, statusCode: 200 };
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 0;
    return { ok: false, gone: statusCode === 404 || statusCode === 410, statusCode };
  }
}

/**
 * Run `worker` over `items` with a bounded number of parallel operations so a
 * large subscriber list cannot open thousands of sockets at once.
 */
export async function mapWithConcurrency(items, limit, worker) {
  const size = Math.max(1, Math.min(limit, items.length || 1));
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: size }, run));
  return results;
}

export default { isPushEnabled, getPublicKey, buildPayload, toTarget, deliver, mapWithConcurrency };
