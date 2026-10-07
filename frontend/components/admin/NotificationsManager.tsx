"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  BellIcon,
  BellOffIcon,
  CheckIcon,
  RefreshIcon,
  SendIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";
import type { AdminNotification, Service } from "@/types/api";

const TITLE_MAX = 80;
const BODY_MAX = 200;

/** First sentence (or clause) of a description — never invents copy. */
function firstClause(text: string): string {
  const trimmed = (text || "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^[^.!?]+[.!?]?/);
  return (match ? match[0] : trimmed).trim();
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: AdminNotification["status"]) {
  if (status === "sent") return "success" as const;
  if (status === "failed") return "danger" as const;
  return "neutral" as const;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Push-notification management: compose, send, track and manage this device. */
export function NotificationsManager() {
  const statsState = useApiData((signal) => api.admin.notifications.stats(signal), "push-stats");
  const listState = useApiData((signal) => api.admin.notifications.list(signal), "push-list");
  const servicesState = useApiData(() => api.services(), "push-services");

  const device = usePushNotifications();

  const services = useMemo(() => servicesState.data ?? [], [servicesState.data]);
  const notifications = listState.data ?? [];
  const stats = statsState.data;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [serviceSlug, setServiceSlug] = useState("");
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminNotification | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const selectedService = useMemo(
    () => services.find((service) => service.slug === serviceSlug) ?? null,
    [services, serviceSlug],
  );

  const applyServiceReference = (slug: string) => {
    setServiceSlug(slug);
    const service = services.find((item) => item.slug === slug);
    if (!service) return;
    setTitle(`${service.title} — Jazari Tech`);
    setBody(firstClause(service.shortDescription || service.description).slice(0, BODY_MAX));
    setUrl("/#services");
  };

  const refreshAll = () => {
    listState.reload();
    statsState.reload();
  };

  const compose = async (send: boolean) => {
    setBusy(send ? "send" : "draft");
    setActionError(null);
    setNotice(null);
    try {
      const created = await api.admin.notifications.create({
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || "/",
        serviceSlug: serviceSlug || undefined,
        send,
      });
      if (send) {
        const { sent, failed, targeted } = created.stats;
        setNotice(
          targeted === 0
            ? "Saved, but there are no devices subscribed yet."
            : `Delivered to ${sent} of ${targeted} device${targeted === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}.`,
        );
      } else {
        setNotice("Draft saved. Press Send on it any time.");
      }
      setTitle("");
      setBody("");
      setUrl("/");
      setServiceSlug("");
      refreshAll();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "The notification could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const sendExisting = async (notification: AdminNotification) => {
    setSendingId(notification._id);
    setActionError(null);
    setNotice(null);
    try {
      const result = await api.admin.notifications.send(notification._id);
      setNotice(
        `"${result.title}" delivered to ${result.stats.sent} of ${result.stats.targeted} device${
          result.stats.targeted === 1 ? "" : "s"
        }.`,
      );
      refreshAll();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "The notification could not be sent.");
    } finally {
      setSendingId(null);
    }
  };

  const remove = async () => {
    const target = pendingDelete;
    if (!target) return;
    setDeletingId(target._id);
    setActionError(null);
    try {
      await api.admin.notifications.remove(target._id);
      listState.setData((current) => (current ? current.filter((row) => row._id !== target._id) : []));
      statsState.reload();
      setPendingDelete(null);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "The notification could not be deleted.");
      setPendingDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  const titleLeft = TITLE_MAX - title.length;
  const bodyLeft = BODY_MAX - body.length;
  const canSend = title.trim().length >= 2 && body.trim().length >= 2 && !busy;

  const deviceLabel = !device.supported
    ? "Not supported in this browser"
    : device.subscribed
      ? "Notifications are on for this device"
      : device.permission === "denied"
        ? "Blocked in your browser settings"
        : "Notifications are off for this device";

  return (
    <div className="space-y-6">
      {actionError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-growth/45 bg-growth/12 px-4 py-3 text-sm text-growth-ink">
          {notice}
        </p>
      )}

      {/* Audience ---------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Subscribed devices"
          value={(stats?.activeSubscribers ?? 0).toLocaleString("en-US")}
          hint={stats ? `${stats.subscribers.toLocaleString("en-US")} stored in total` : undefined}
        />
        <StatCard label="Notifications sent" value={(stats?.notificationsSent ?? 0).toLocaleString("en-US")} />
        <StatCard label="Messages delivered" value={(stats?.delivered ?? 0).toLocaleString("en-US")} />
        <StatCard
          label="Delivery failures"
          value={(stats?.failed ?? 0).toLocaleString("en-US")}
          hint={stats && !stats.pushConfigured ? "VAPID keys are not configured" : undefined}
        />
      </div>

      {stats && !stats.pushConfigured && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/12 px-4 py-3 text-sm text-warning">
          <BellOffIcon size={16} className="mt-0.5 shrink-0" />
          <span>
            Push sending is <strong>off</strong>: the server has no VAPID keys yet. Devices can still subscribe, but
            nothing will be delivered until they are added.
          </span>
        </p>
      )}

      {/* This device ------------------------------------------------------- */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
            {device.subscribed ? <BellIcon size={18} /> : <BellOffIcon size={18} />}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">This device</p>
            <p className="mt-0.5 text-sm text-muted">{deviceLabel}</p>
            {device.error && <p className="mt-1 text-xs text-danger">{device.error}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {device.subscribed ? (
            <>
              <Badge tone="success" icon={<CheckIcon size={12} />}>
                Subscribed
              </Badge>
              <Button variant="outline" size="sm" loading={device.busy} onClick={() => void device.disable()}>
                Turn off
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              loading={device.busy}
              disabled={!device.supported || device.permission === "denied"}
              onClick={() => void device.enable()}
              iconLeft={<BellIcon size={14} />}
            >
              Enable here
            </Button>
          )}
        </div>
      </div>

      {/* Composer ---------------------------------------------------------- */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Compose a notification</h2>
            <p className="mt-1 text-sm text-muted">
              Start from one of your services, then adjust the wording. Every subscribed device receives it.
            </p>
          </div>
          <Badge tone="info" icon={<SendIcon size={12} />}>
            Web Push
          </Badge>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="push-service" className="label">
              Reference a service (optional)
            </label>
            <select
              id="push-service"
              className="field"
              value={serviceSlug}
              onChange={(event) => applyServiceReference(event.target.value)}
            >
              <option value="">Write a message from scratch</option>
              {services.map((service: Service) => (
                <option key={service.slug} value={service.slug}>
                  {service.title}
                </option>
              ))}
            </select>
            {selectedService && (
              <p className="mt-2 text-xs text-muted">
                Prefilled from <span className="font-medium text-foreground">{selectedService.title}</span>. Edit
                freely before sending.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="push-title" className="label">
              Title
            </label>
            <input
              id="push-title"
              className="field"
              value={title}
              maxLength={TITLE_MAX}
              placeholder="e.g. New: AI Automation for your operations"
              onChange={(event) => setTitle(event.target.value)}
            />
            <p className="mt-1 text-right text-xs text-muted">{titleLeft} characters left</p>
          </div>

          <div>
            <label htmlFor="push-body" className="label">
              Message
            </label>
            <textarea
              id="push-body"
              className="field min-h-24 resize-y"
              value={body}
              maxLength={BODY_MAX}
              placeholder="One clear sentence about what is new."
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="mt-1 text-right text-xs text-muted">{bodyLeft} characters left</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="push-url" className="label">
                Opens at
              </label>
              <input
                id="push-url"
                className="field"
                value={url}
                placeholder="/#services"
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <p className="text-xs text-muted">
                Tapping the notification opens this page. Use a path like <code className="font-mono">/#services</code>{" "}
                or a full https link.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              loading={busy === "send"}
              disabled={!canSend}
              onClick={() => void compose(true)}
              iconLeft={<SendIcon size={15} />}
            >
              Send now
            </Button>
            <Button
              variant="outline"
              loading={busy === "draft"}
              disabled={!canSend}
              onClick={() => void compose(false)}
            >
              Save draft
            </Button>
          </div>
        </div>
      </div>

      {/* History ----------------------------------------------------------- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Delivery history</h2>
          <Button variant="outline" size="sm" onClick={refreshAll} iconLeft={<RefreshIcon size={14} />}>
            Refresh
          </Button>
        </div>

        {listState.loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="card p-4" aria-hidden="true">
                <Skeleton className="h-4 w-1/3 rounded" />
              </div>
            ))}
          </div>
        ) : listState.error ? (
          <EmptyState
            title="Notifications could not be loaded"
            description={listState.error.message}
            icon={<RefreshIcon size={22} />}
            action={
              <Button variant="outline" size="sm" onClick={listState.reload}>
                Try again
              </Button>
            }
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            description="Compose your first notification above. It will appear here with its delivery results."
            icon={<BellIcon size={22} />}
          />
        ) : (
          <ul className="space-y-3">
            {notifications.map((notification) => (
              <li key={notification._id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{notification.title}</p>
                      <Badge tone={statusTone(notification.status)}>
                        {notification.status === "sent" ? "Sent" : notification.status === "failed" ? "Failed" : "Draft"}
                      </Badge>
                      {notification.serviceSlug && <Badge tone="info">{notification.serviceSlug}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{notification.body}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>
                        <UsersIcon size={12} className="mr-1 inline" />
                        {notification.stats.targeted} targeted · {notification.stats.sent} delivered
                        {notification.stats.failed ? ` · ${notification.stats.failed} failed` : ""}
                      </span>
                      <span>Created {formatDateTime(notification.createdAt)}</span>
                      {notification.sentAt && <span>Sent {formatDateTime(notification.sentAt)}</span>}
                    </p>
                    {notification.error && <p className="mt-1 text-xs text-danger">{notification.error}</p>}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={sendingId === notification._id}
                      onClick={() => void sendExisting(notification)}
                      iconLeft={<SendIcon size={14} />}
                    >
                      {notification.status === "draft" ? "Send" : "Resend"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      aria-label={`Delete ${notification.title}`}
                      loading={deletingId === notification._id}
                      onClick={() => setPendingDelete(notification)}
                      iconLeft={<TrashIcon size={14} />}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this notification?"
        message={`"${pendingDelete?.title ?? ""}" will be removed from the history. Devices that already received it keep their copy.`}
        confirmLabel="Delete notification"
        busy={deletingId === pendingDelete?._id}
        onConfirm={() => void remove()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default NotificationsManager;
