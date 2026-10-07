"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DISMISS_KEY,
  disablePush,
  enablePush,
  getPushCapability,
  type PushCapability,
} from "@/lib/push";

interface UsePushNotifications {
  /** Browser supports Web Push. */
  supported: boolean;
  /** Notification permission, or "unsupported". */
  permission: NotificationPermission | "unsupported";
  /** A live browser subscription exists. */
  subscribed: boolean;
  /** True until the first capability read completes. */
  loading: boolean;
  /** An enable/disable action is in flight. */
  busy: boolean;
  /** Safe, user-facing error from the last action. */
  error: string | null;
  /** The user permanently dismissed the invitation. */
  dismissed: boolean;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  dismiss: () => void;
}

/** Read + control this browser's push subscription state. */
export function usePushNotifications(): UsePushNotifications {
  const [capability, setCapability] = useState<PushCapability>({
    supported: false,
    permission: "unsupported",
    subscribed: false,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Read the stored preference lazily; SSR has no localStorage, so it defaults
  // to "not dismissed" there (the prompt itself only opens on the client).
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let active = true;

    // All state updates happen after the await, inside the async task rather
    // than synchronously in the effect body.
    const load = async () => {
      const result = await getPushCapability();
      if (!active) return;
      setCapability(result);
      setLoading(false);
    };

    void load().catch(() => {
      /* capability read is best-effort */
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePush();
      setCapability({ supported: true, permission: "granted", subscribed: true });
      setDismissed(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be enabled.");
      // Re-read permission: a denial leaves the browser in "denied".
      const refreshed = await getPushCapability().catch(() => null);
      if (refreshed) setCapability(refreshed);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disablePush();
      setCapability((prev) => ({ ...prev, subscribed: false }));
      setDismissed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be disabled.");
    } finally {
      setBusy(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }, []);

  return {
    supported: capability.supported,
    permission: capability.permission,
    subscribed: capability.subscribed,
    loading,
    busy,
    error,
    dismissed,
    enable,
    disable,
    dismiss,
  };
}

export default usePushNotifications;
