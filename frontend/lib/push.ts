"use client";

/**
 * Client-side Web Push helper.
 *
 * Everything that touches `navigator`/`Notification` lives here so components
 * stay declarative and SSR-safe. The server remains the source of truth: the
 * VAPID key is fetched from the API, never baked into the bundle.
 */
import { api } from "@/lib/api";

export const SW_PATH = "/sw.js";
/** Local key remembering that the user closed the prompt for good. */
export const DISMISS_KEY = "jazari-push-dismissed";
/** Local key remembering that the user enabled notifications. */
export const ENABLED_KEY = "jazari-push-enabled";

export interface PushCapability {
  supported: boolean;
  /** "default" | "granted" | "denied" | "unsupported" */
  permission: NotificationPermission | "unsupported";
  /** True when a live browser subscription exists. */
  subscribed: boolean;
}

/** Feature-detect Web Push in the current browser. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Convert the URL-safe base64 VAPID key into the byte array the API expects. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Register the service worker once and return its registration. */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH, { scope: "/" });
}

/** Current browser-side state, used to decide whether to show the prompt. */
export async function getPushCapability(): Promise<PushCapability> {
  if (!pushSupported()) return { supported: false, permission: "unsupported", subscribed: false };

  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = registration ? await registration.pushManager.getSubscription() : null;

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

/** Subscribe the device and register it on the API. */
export async function enablePush(): Promise<{ endpoint: string }> {
  if (!pushSupported()) throw new Error("This browser does not support notifications.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed.");

  const { key, configured } = await api.push.publicKey();
  if (!configured || !key) {
    throw new Error("Notifications are not configured on the server yet.");
  }

  const registration = await getServiceWorkerRegistration();
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }));

  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    throw new Error("The browser returned an incomplete subscription.");
  }

  await api.push.subscribe({
    endpoint: payload.endpoint,
    keys: { p256dh: payload.keys.p256dh, auth: payload.keys.auth },
    page: `${window.location.pathname}${window.location.search}`,
  });

  try {
    localStorage.setItem(ENABLED_KEY, "1");
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    // Storage may be unavailable (private mode) — not fatal.
  }

  return { endpoint: payload.endpoint };
}

/** Unsubscribe the device locally and forget it on the API. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = registration ? await registration.pushManager.getSubscription() : null;

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    try {
      await api.push.unsubscribe(endpoint);
    } catch {
      // The device is already unsubscribed locally; a stale record is harmless.
    }
  }

  try {
    localStorage.removeItem(ENABLED_KEY);
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore
  }
}
