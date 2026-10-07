/**
 * Jazari Tech — Web Push service worker.
 *
 * Scope: /  (served statically from `public/sw.js`).
 * Its ONLY jobs are (1) show the notification the API pushed and (2) open the
 * right page when the user taps it. It deliberately does NOT cache or intercept
 * fetches, so it can never serve stale content.
 */

self.addEventListener("install", () => {
  // Activate the newest worker immediately.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Jazari Tech", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Jazari Tech";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/brand/icon-192.png",
    badge: payload.badge || "/brand/icon-192.png",
    tag: payload.tag || "jazari-update",
    data: { url: payload.url || "/", timestamp: payload.timestamp || Date.now() },
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab when one is already open on the same origin.
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});

/**
 * Browsers occasionally rotate a subscription. Re-subscribe and hand the new
 * endpoint back to the API so messages keep arriving.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
        const body = await keyResponse.json();
        const key = body && body.data ? body.data.key : "";
        if (!key) return;

        const applicationServerKey = urlBase64ToUint8Array(key);
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        const json = subscription.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, page: "/" }),
        });
      } catch {
        // Nothing else we can do here — the user can re-enable from the site.
      }
    })(),
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
