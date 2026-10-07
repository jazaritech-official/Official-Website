"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { BellIcon, CheckIcon, CloseIcon, SendIcon } from "@/components/icons";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { api } from "@/lib/api";

/** Seconds a visitor browses before we offer notifications. */
const PROMPT_DELAY_MS = 10_000;

const BENEFITS = [
  "New services and capabilities, as they launch",
  "Product releases, offers and announcements",
  "Off in one tap — no spam, ever",
];

/**
 * Premium opt-in card, offered once a visitor has settled in.
 *
 * It only appears when there is something to gain and nothing to nag:
 * the browser supports push, permission is still undecided, the visitor has
 * not dismissed it, the server is actually configured, and the tab is visible.
 */
export function NotificationPrompt() {
  const { supported, permission, subscribed, loading, busy, error, dismissed, enable, dismiss } =
    usePushNotifications();
  const [open, setOpen] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [enabled, setEnabled] = useState(false);

  // Ask the API once whether push is configured — never prompt for a feature
  // the server cannot deliver.
  useEffect(() => {
    let active = true;
    api.push
      .publicKey()
      .then((result) => {
        if (active) setServerReady(result.configured && Boolean(result.key));
      })
      .catch(() => {
        if (active) setServerReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Offer after the delay, but only when the visitor is actually looking at it.
  useEffect(() => {
    if (loading || !supported || !serverReady) return;
    if (permission !== "default" || subscribed || dismissed) return;

    let timer: number | undefined;
    let opened = false;

    const arm = () => {
      if (opened || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        opened = true;
        setOpen(true);
      }, PROMPT_DELAY_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        if (timer) window.clearTimeout(timer);
      } else {
        arm();
      }
    };

    arm();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loading, supported, serverReady, permission, subscribed, dismissed]);

  // Visibility is DERIVED rather than synced: if permission is decided
  // elsewhere (the browser's own UI), the dialog simply stops rendering. The
  // `enabled` flag keeps the success state on screen for a moment after the
  // permission becomes "granted".
  const visible = open && (enabled || (permission === "default" && !subscribed));

  const closeForNow = () => setOpen(false);

  const handleEnable = async () => {
    const ok = await enable();
    if (ok) {
      setEnabled(true);
      window.setTimeout(() => setOpen(false), 1400);
    }
  };

  const handleDismiss = () => {
    dismiss();
    setOpen(false);
  };

  return (
    <Modal
      open={visible}
      onClose={closeForNow}
      size="md"
      showClose
      label="Enable notifications"
      className="push-prompt p-0"
    >
      <div className="push-prompt__inner" data-push-prompt="open">
        <div className="push-prompt__banner" aria-hidden="true">
          <span className="push-prompt__glow" />
          <span className="push-prompt__bell">
            <BellIcon size={26} />
          </span>
        </div>

        <div className="push-prompt__body">
          <p className="push-prompt__eyebrow">Stay in the loop</p>
          <h2 id="push-prompt-title" className="push-prompt__title">
            {enabled ? "You're all set" : "Get notified about what we build next"}
          </h2>
          <p className="push-prompt__lead">
            {enabled
              ? "Notifications are on for this device. We'll let you know when something new goes live."
              : "Be first to hear from Jazari Tech. Turn it on once and we'll keep you posted."}
          </p>

          {!enabled && (
            <ul className="push-prompt__benefits">
              {BENEFITS.map((benefit) => (
                <li key={benefit}>
                  <span className="push-prompt__check" aria-hidden="true">
                    <CheckIcon size={13} />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="push-prompt__error" role="alert">
              <CloseIcon size={14} /> {error}
            </p>
          )}

          {enabled ? (
            <div className="push-prompt__actions">
              <Button variant="primary" onClick={closeForNow} iconLeft={<CheckIcon size={16} />}>
                Done
              </Button>
            </div>
          ) : (
            <div className="push-prompt__actions">
              <Button
                variant="primary"
                loading={busy}
                onClick={handleEnable}
                iconLeft={<SendIcon size={16} />}
              >
                Enable notifications
              </Button>
              <Button variant="ghost" onClick={handleDismiss} disabled={busy}>
                Not now
              </Button>
            </div>
          )}

          <p className="push-prompt__fineprint">
            You can switch notifications off at any time in your browser settings.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default NotificationPrompt;
