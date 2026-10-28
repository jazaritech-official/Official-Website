"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Spinner, Skeleton } from "@/components/ui/Spinner";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatMinor, minorToInput, parseMinor } from "@/lib/bill/money";
import { buildBillSvg } from "@/lib/bill/billSvg";
import { DEFAULT_TIER, TIER_SIZES, downloadBillSvg, downloadBlob, exportBillPng, type QualityTier } from "@/lib/bill/billExport";
import { formatDay, formatMoment, orderStatusMeta, paymentStatusMeta, ORDER_STATUS, ORDER_STATUS_ORDER } from "@/lib/finance";
import { DownloadIcon, EditIcon, TrashIcon } from "@/components/icons";
import type { FinanceSettings, Order, OrderPayment, OrderStatus } from "@/types/api";

type Tab = "details" | "payments" | "shares" | "bill";

export interface OrderDetailProps {
  orderId: string;
  canSplit: boolean;
  paymentMethods: string[];
  onClose: () => void;
  onEdit: (order: Order) => void;
  onChanged: () => void;
}

/**
 * ORDER DETAIL — one dialog with four sections: the work, the money received,
 * the shares (super admin) and the client-facing bill.
 */
export function OrderDetail({ orderId, canSplit, paymentMethods, onClose, onEdit, onChanged }: OrderDetailProps) {
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState(paymentMethods[0] ?? "Cash");
  const [payReference, setPayReference] = useState("");
  const [pendingRemovePayment, setPendingRemovePayment] = useState<OrderPayment | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{ status: OrderStatus; allowUnpaidComplete: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tier, setTier] = useState<QualityTier>(DEFAULT_TIER);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const orderState = useApiData<Order>(() => api.admin.finance.orders.get(orderId), `order:${orderId}`);
  const settingsState = useApiData<FinanceSettings>(() => api.admin.finance.settings.get(), "order-settings");

  const order = orderState.data;
  const settings = settingsState.data;

  const reload = () => {
    orderState.reload();
    onChanged();
  };

  const changeStatus = async (status: OrderStatus) => {
    if (!order) return;
    if (status === order.status) return;
    if (status === "completed" && order.paymentStatus !== "paid") {
      setPendingStatus({ status, allowUnpaidComplete: true });
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.admin.finance.orders.setStatus(order._id, status);
      setNotice(
        updated.refundDueMinor
          ? `Order cancelled. Refund due: ${formatMinor(updated.refundDueMinor)}.`
          : `Status changed to ${ORDER_STATUS[status]?.label ?? status}.`,
      );
      reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not change the status.");
    } finally {
      setBusy(false);
    }
  };

  const confirmUnpaidComplete = async () => {
    if (!order || !pendingStatus) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.finance.orders.setStatus(order._id, pendingStatus.status, { allowUnpaidComplete: true });
      setNotice("Order marked completed even though it is not fully paid.");
      reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not complete this order.");
    } finally {
      setBusy(false);
      setPendingStatus(null);
    }
  };

  const recordPayment = async () => {
    if (!order) return;
    const amount = parseMinor(payAmount);
    if (amount === null || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.admin.finance.orders.addPayment(order._id, {
        amountMinor: amount,
        method: payMethod,
        reference: payReference.trim() || undefined,
      });
      setPayAmount("");
      setPayReference("");
      setNotice(`Payment recorded — balance now ${formatMinor(result.order.balanceMinor)}.`);
      reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.details?.balanceMinor) {
        setError(`${cause.message} Balance due: ${formatMinor(Number(cause.details.balanceMinor))}.`);
      } else {
        setError(cause instanceof ApiError ? cause.message : "Could not record that payment.");
      }
    } finally {
      setBusy(false);
    }
  };

  const removePayment = async (payment: OrderPayment) => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.finance.orders.removePayment(order._id, payment._id);
      setNotice("Payment removed and totals recomputed.");
      setPendingRemovePayment(null);
      reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove that payment.");
      setPendingRemovePayment(null);
    } finally {
      setBusy(false);
    }
  };

  const togglePayout = async (party: "referrer" | "worker", payeeId: string, paid: boolean) => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.finance.orders.setPayout(order._id, { party, payeeId, paid });
      reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update that share.");
    } finally {
      setBusy(false);
    }
  };

  const billData = order
    ? {
        invoiceNumber: order.invoiceNumber,
        issuedAt: order.createdAt,
        deliveryDate: order.deliveryDate,
        status: order.paymentStatus,
        business: settings?.business ?? {
          businessName: "Jazari Tech",
          address: "",
          phone: "",
          email: "",
          website: "",
          paymentInstructions: "",
          billFooterNote: "Thank you for choosing Jazari Tech.",
        },
        client: {
          name: order.clientSnapshot.name,
          company: order.clientSnapshot.company,
          phone: order.clientSnapshot.phone,
          email: order.clientSnapshot.email,
        },
        items: order.items,
        subtotalMinor: order.subtotalMinor,
        discountMinor: order.discountMinor,
        totalMinor: order.totalMinor,
        paidMinor: order.paidMinor,
        balanceMinor: Math.max(0, order.totalMinor - order.paidMinor),
        payments: order.payments,
      }
    : null;
  const billSvg = billData ? buildBillSvg(billData) : "";

  const downloadPng = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await exportBillPng(billSvg, tier, (message) => setExportMessage(message || null));
      downloadBlob(result.blob, `${order?.invoiceNumber ?? "invoice"}.png`);
      setExportMessage(
        result.fallbackReason ?? `Saved ${result.size} × ${result.size} PNG (${Math.round(result.blob.size / 1024).toLocaleString("en-US")} KB).`,
      );
    } catch (cause) {
      setExportMessage(
        cause instanceof Error ? cause.message : "The PNG could not be produced on this device — try Download SVG instead.",
      );
    } finally {
      setExporting(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "details", label: "Details & items" },
    { id: "payments", label: `Payments (${order?.payments.length ?? 0})` },
    ...(canSplit ? [{ id: "shares" as Tab, label: "Shares" }] : []),
    { id: "bill", label: "Bill" },
  ];

  return (
    <Modal open onClose={onClose} label={order ? `Order ${order.invoiceNumber}` : "Order"} size="lg">
      {orderState.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : orderState.error || !order ? (
        <div className="space-y-4">
          <p className="text-sm text-danger">{orderState.error?.message ?? "Order not found."}</p>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-4" data-order-detail>
          {/* ------------------------------------------------ header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="pr-8 font-mono text-lg font-semibold text-foreground" data-testid="detail-invoice">
                {order.invoiceNumber}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {order.clientSnapshot.name}
                {order.clientSnapshot.company ? ` · ${order.clientSnapshot.company}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={orderStatusMeta(order.status).tone}>{orderStatusMeta(order.status).label}</Badge>
                <Badge tone={paymentStatusMeta(order.paymentStatus).tone}>{paymentStatusMeta(order.paymentStatus).label}</Badge>
                <span className="text-sm text-muted">
                  Total {formatMinor(order.totalMinor)} · Paid {formatMinor(order.paidMinor)} · Balance{" "}
                  <span className="font-semibold text-foreground" data-testid="detail-balance">
                    {formatMinor(Math.max(0, order.totalMinor - order.paidMinor))}
                  </span>
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onEdit(order)} iconLeft={<EditIcon size={14} />}>
              Edit order
            </Button>
          </div>

          {order.status === "cancelled" && order.paidMinor > 0 && (
            <p role="status" className="rounded-xl border border-warning/40 bg-surface px-4 py-3 text-sm text-warning" data-testid="refund-banner">
              This order is cancelled. Refund due: {formatMinor(order.paidMinor)}.
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger" data-testid="detail-error">
              {error}
            </p>
          )}

          {/* ---------------------------------------------------- tabs */}
          <div role="tablist" aria-label="Order sections" className="flex flex-wrap gap-1 border-b border-line">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                data-testid={`tab-${entry.id}`}
                className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
                  tab === entry.id ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
                }`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {/* ------------------------------------------------- details */}
          {tab === "details" && (
            <section className="space-y-4" data-tab-panel="details">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Order items</caption>
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                    <th scope="col" className="py-2 font-semibold">Item</th>
                    <th scope="col" className="py-2 text-right font-semibold">Qty</th>
                    <th scope="col" className="py-2 text-right font-semibold">Unit price</th>
                    <th scope="col" className="py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, index) => (
                    <tr key={`${item.name}-${index}`} className="table-row">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2 text-right tabular-nums">{formatMinor(item.unitPriceMinor)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMinor(item.lineTotalMinor)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 text-muted" colSpan={3}>Subtotal</td>
                    <td className="py-2 text-right tabular-nums">{formatMinor(order.subtotalMinor)}</td>
                  </tr>
                  {order.discountMinor > 0 && (
                    <tr>
                      <td className="py-2 text-muted" colSpan={3}>Discount</td>
                      <td className="py-2 text-right tabular-nums">− {formatMinor(order.discountMinor)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-2 font-semibold" colSpan={3}>Total</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatMinor(order.totalMinor)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line p-3 text-sm">
                  <p className="label mb-1">Delivery date</p>
                  <p>{formatDay(order.deliveryDate)}</p>
                </div>
                <div className="rounded-xl border border-line p-3 text-sm">
                  <p className="label mb-1">Status</p>
                  <label className="sr-only" htmlFor="detail-status">Change status</label>
                  <select
                    id="detail-status"
                    data-testid="detail-status"
                    className="field"
                    value={order.status}
                    disabled={busy}
                    onChange={(event) => void changeStatus(event.target.value as OrderStatus)}
                  >
                    {ORDER_STATUS_ORDER.map((value) => (
                      <option key={value} value={value}>
                        {ORDER_STATUS[value].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {order.statusHistory.length > 0 && (
                <ol className="space-y-1 text-xs text-muted">
                  {order.statusHistory.map((entry, index) => (
                    <li key={`${entry.status}-${index}`}>
                      {ORDER_STATUS[entry.status]?.label ?? entry.status} · {formatMoment(entry.at)}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {/* ------------------------------------------------- payments */}
          {tab === "payments" && (
            <section className="space-y-4" data-tab-panel="payments">
              {order.payments.length === 0 ? (
                <p className="text-sm text-muted">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {order.payments
                    .slice()
                    .reverse()
                    .map((payment) => (
                      <li key={payment._id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-foreground">{formatMinor(payment.amountMinor)}</span>
                          <span className="block text-xs text-muted">
                            {payment.method} · {formatMoment(payment.receivedAt)}
                            {payment.reference ? ` · ${payment.reference}` : ""}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingRemovePayment(payment)}
                          iconLeft={<TrashIcon size={14} />}
                          disabled={busy}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                </ul>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="record-amount">Amount (Rs)</label>
                  <input
                    id="record-amount"
                    data-testid="record-amount"
                    className="field text-right tabular-nums"
                    inputMode="decimal"
                    value={payAmount}
                    placeholder={minorToInput(Math.max(0, order.totalMinor - order.paidMinor))}
                    onChange={(event) => setPayAmount(event.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="record-method">Method</label>
                  <select
                    id="record-method"
                    className="field"
                    value={payMethod}
                    onChange={(event) => setPayMethod(event.target.value)}
                  >
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="record-reference">Reference</label>
                  <input
                    id="record-reference"
                    className="field"
                    value={payReference}
                    placeholder="Transfer ID, cheque no.…"
                    onChange={(event) => setPayReference(event.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={() => void recordPayment()}
                loading={busy}
                disabled={order.status === "cancelled"}
                data-testid="record-payment"
              >
                Record payment
              </Button>
              {order.status === "cancelled" && (
                <p className="text-xs text-muted">A cancelled order cannot receive payments.</p>
              )}
            </section>
          )}

          {/* ---------------------------------------------------- shares */}
          {tab === "shares" && (
            <section className="space-y-3" data-tab-panel="shares">
              {!order.split ? (
                <p className="text-sm text-muted">This order has no split saved.</p>
              ) : (
                <>
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Shares of this order</caption>
                    <thead>
                      <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                        <th scope="col" className="py-2 font-semibold">Who</th>
                        <th scope="col" className="py-2 text-right font-semibold">%</th>
                        <th scope="col" className="py-2 text-right font-semibold">Amount</th>
                        <th scope="col" className="py-2 text-right font-semibold">Paid out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.split.referrer && (
                        <tr className="table-row">
                          <td className="py-2">
                            {order.split.referrer.name}
                            <span className="block text-xs text-muted">Referrer</span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{(order.split.referrer.bp / 100).toFixed(2).replace(/\.00$/, "")}%</td>
                          <td className="py-2 text-right tabular-nums" data-testid="share-referrer-amount">
                            {formatMinor(order.split.referrer.amountMinor)}
                          </td>
                          <td className="py-2 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || order.status === "cancelled"}
                              onClick={() =>
                                void togglePayout(
                                  "referrer",
                                  order.split!.referrer!.payeeId ?? "",
                                  !order.split!.referrer!.paidOutAt,
                                )
                              }
                              data-testid="payout-referrer"
                            >
                              {order.split.referrer.paidOutAt ? "Paid ✓" : "Mark paid out"}
                            </Button>
                          </td>
                        </tr>
                      )}
                      {order.split.workers.map((worker) => (
                        <tr key={`${worker.payeeId}-${worker.name}`} className="table-row">
                          <td className="py-2">
                            {worker.name}
                            <span className="block text-xs text-muted">Worker</span>
                          </td>
                          <td className="py-2 text-right tabular-nums">{(worker.bp / 100).toFixed(2).replace(/\.00$/, "")}%</td>
                          <td className="py-2 text-right tabular-nums" data-testid={`share-worker-amount-${worker.payeeId}`}>
                            {formatMinor(worker.amountMinor)}
                          </td>
                          <td className="py-2 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || order.status === "cancelled"}
                              onClick={() => void togglePayout("worker", worker.payeeId ?? "", !worker.paidOutAt)}
                              data-testid={`payout-worker-${worker.payeeId}`}
                            >
                              {worker.paidOutAt ? "Paid ✓" : "Mark paid out"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      <tr className="table-row bg-surface">
                        <td className="py-2 font-medium">Company box (Khazana)</td>
                        <td className="py-2 text-right tabular-nums">
                          {(10000 - (order.split.referrer?.bp ?? 0) - order.split.workers.reduce((sum, w) => sum + w.bp, 0)) / 100}%
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums" data-testid="share-company-amount">
                          {formatMinor(order.split.companyMinor)}
                        </td>
                        <td className="py-2 text-right text-xs text-muted">Kept by the business</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-xs text-muted">
                    Shares were computed on {formatMoment(order.split.computedAt)} and are frozen while any share is
                    marked paid out.
                  </p>
                </>
              )}
            </section>
          )}

          {/* ------------------------------------------------------ bill */}
          {tab === "bill" && (
            <section className="space-y-3" data-tab-panel="bill">
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                {/* The SAME SVG that is exported, scaled to fit. */}
                <div
                  className="bill-preview"
                  data-testid="bill-preview"
                  dangerouslySetInnerHTML={{ __html: billSvg }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void downloadPng()} loading={exporting} iconLeft={<DownloadIcon size={14} />} data-testid="download-png">
                  Download PNG (8K)
                </Button>
                <label className="sr-only" htmlFor="bill-quality">PNG quality</label>
                <select
                  id="bill-quality"
                  className="field w-auto"
                  value={tier}
                  data-testid="bill-quality"
                  onChange={(event) => setTier(event.target.value as QualityTier)}
                >
                  <option value="8k">8K · {TIER_SIZES["8k"]} px</option>
                  <option value="4k">4K · {TIER_SIZES["4k"]} px</option>
                  <option value="2k">2K · {TIER_SIZES["2k"]} px</option>
                </select>
                <Button
                  variant="outline"
                  onClick={() => downloadBillSvg(billSvg, order.invoiceNumber)}
                  iconLeft={<DownloadIcon size={14} />}
                  data-testid="download-svg"
                >
                  Download SVG
                </Button>
                {exporting && <Spinner label="Rendering the bill" />}
              </div>
              {exportMessage && (
                <p role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted" data-testid="export-message">
                  {exportMessage}
                </p>
              )}
              <p className="text-xs text-muted">
                The bill is client-facing: it never shows the internal split. A refresh of the API is not needed — the
                preview is rendered from the order you are looking at.
              </p>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingRemovePayment !== null}
        title="Remove this payment?"
        message={
          pendingRemovePayment
            ? `${formatMinor(pendingRemovePayment.amountMinor)} (${pendingRemovePayment.method}) will be removed and the balance recomputed.`
            : ""
        }
        confirmLabel="Remove payment"
        busy={busy}
        onConfirm={() => pendingRemovePayment && void removePayment(pendingRemovePayment)}
        onCancel={() => setPendingRemovePayment(null)}
      />

      <ConfirmDialog
        open={pendingStatus !== null}
        title="Complete an unpaid order?"
        message="This order is not fully paid. Completing it anyway records the decision in the status history."
        confirmLabel="Complete anyway"
        busy={busy}
        onConfirm={() => void confirmUnpaidComplete()}
        onCancel={() => setPendingStatus(null)}
      />
    </Modal>
  );
}

export default OrderDetail;
