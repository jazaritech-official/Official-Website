"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { formatMinor, minorToInput, parseMinor } from "@/lib/bill/money";
import { bpToInput, bpToPercent, ORDER_STATUS, ORDER_STATUS_ORDER, percentToBp } from "@/lib/finance";
import { PlusIcon, TrashIcon } from "@/components/icons";
import type {
  CatalogItem,
  FinanceClient,
  FinanceSettings,
  Order,
  OrderInput,
  OrderStatus,
  OrderStatusHistoryEntry,
  Payee,
} from "@/types/api";

/**
 * ORDER EDITOR — one screen that builds an order from the catalogue, keeps the
 * money in integer paisa, and shows the settlement split live while you type.
 *
 * Money rules mirrored here from the backend (Backend/utils/orderMath.js):
 *   person   = floor(total × bp / 10000)
 *   company  = total − Σ people      (a remainder, so the parts always add up)
 * Nobody is silently redistributed: if a share is empty its percentage stays
 * with the company and the preview says so in words.
 */

interface EditorItem {
  key: string;
  catalogItemId: string | null;
  name: string;
  unitLabel: string;
  quantity: number;
  unitPriceMinor: number;
}

interface EditorWorker {
  key: string;
  payeeId: string;
  bp: number;
}

export interface OrderEditorProps {
  open: boolean;
  /** `null` creates a new order. */
  order: Order | null;
  settings: FinanceSettings | null;
  catalog: CatalogItem[];
  clients: FinanceClient[];
  payees: Payee[];
  /** False for a plain admin: the Shares section is replaced by an explanation. */
  canSplit: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: OrderInput) => Promise<void>;
  /**
   * Called after a client is created inline. The parent owns the `clients`
   * list, so without a refresh the new id resolves to no client — the
   * "Billed to …" chip (and the picker) would never show it.
   */
  onClientCreated?: () => void;
}

let keySeed = 0;
const nextKey = () => `row-${(keySeed += 1)}`;

const bpSum = (bps: number[]) => bps.reduce((sum, bp) => sum + bp, 0);

/** floor(total × bp / 10000) — identical to the server's computation. */
function shareOf(totalMinor: number, bp: number): number {
  return Math.floor((totalMinor * bp) / 10000);
}

function defaultWorkerBp(settings: FinanceSettings | null): number {
  return settings?.workerBp ?? 2000;
}

function defaultReferrerBp(settings: FinanceSettings | null): number {
  return settings?.referrerBp ?? 1000;
}

export function OrderEditor({
  open,
  order,
  settings,
  catalog,
  clients,
  payees,
  canSplit,
  busy = false,
  onClose,
  onSubmit,
  onClientCreated,
}: OrderEditorProps) {
  const editing = Boolean(order);

  const [clientId, setClientId] = useState<string>(() => order?.clientId ?? "");
  const [clientSearch, setClientSearch] = useState("");
  const [inlineClient, setInlineClient] = useState<{ name: string; phone: string } | null>(null);
  const [items, setItems] = useState<EditorItem[]>(() =>
    order
      ? order.items.map((item) => ({
          key: nextKey(),
          catalogItemId: item.catalogItemId ?? null,
          name: item.name,
          unitLabel: item.unitLabel,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
        }))
      : [
          {
            key: nextKey(),
            catalogItemId: catalog[0]?._id ?? null,
            name: catalog[0]?.name ?? "",
            unitLabel: catalog[0]?.unitLabel ?? "item",
            quantity: 1,
            unitPriceMinor: catalog[0]?.defaultUnitPriceMinor ?? 0,
          },
        ],
  );
  const [title, setTitle] = useState(() => order?.title ?? "");
  const [status, setStatus] = useState<OrderStatus>(() => order?.status ?? "new");
  const [deliveryDate, setDeliveryDate] = useState(() => (order?.deliveryDate ? order.deliveryDate.slice(0, 10) : ""));
  const [notes, setNotes] = useState(() => order?.notes ?? "");
  const [discountInput, setDiscountInput] = useState(() => minorToInput(order?.discountMinor ?? 0));
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState(() => settings?.paymentMethods?.[0] ?? "Cash");
  const [payNow, setPayNow] = useState(false);
  const [referrerId, setReferrerId] = useState<string>(() => order?.split?.referrer?.payeeId ?? "");
  const [referrerBp, setReferrerBp] = useState<number>(() => order?.split?.referrer?.bp ?? defaultReferrerBp(settings));
  const [workers, setWorkers] = useState<EditorWorker[]>(() =>
    order?.split?.workers?.length
      ? order.split.workers.map((worker) => ({ key: nextKey(), payeeId: worker.payeeId ?? "", bp: worker.bp }))
      : [0, 1, 2].map(() => ({ key: nextKey(), payeeId: "", bp: defaultWorkerBp(settings) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* ------------------------------------------------------------- derived */

  const lineTotals = items.map((item) => item.quantity * item.unitPriceMinor);
  const subtotalMinor = lineTotals.reduce((sum, value) => sum + value, 0);
  const discountMinor = Math.min(Math.max(parseMinor(discountInput) ?? 0, 0), subtotalMinor);
  const totalMinor = subtotalMinor - discountMinor;

  const people = [
    ...(referrerId ? [{ key: "referrer", name: payees.find((p) => p._id === referrerId)?.name ?? "Referrer", bp: referrerBp }] : []),
    ...workers
      .filter((worker) => worker.payeeId)
      .map((worker) => ({
        key: worker.key,
        name: payees.find((p) => p._id === worker.payeeId)?.name ?? "Worker",
        bp: worker.bp,
      })),
  ];
  const peopleBp = bpSum(people.map((person) => person.bp));
  const peopleMinor = people.reduce((sum, person) => sum + shareOf(totalMinor, person.bp), 0);
  const companyMinor = totalMinor - peopleMinor;
  const overBudget = peopleBp > 10000;
  const activeWorkers = workers.filter((worker) => worker.payeeId);

  const payeeOptions = useMemo(() => {
    const active = payees.filter((payee) => payee.isActive !== false);
    return {
      referrers: active.filter((payee) => payee.role === "referrer" || payee.role === "both"),
      workers: active.filter((payee) => payee.role === "worker" || payee.role === "both"),
    };
  }, [payees]);

  const filteredClients = useMemo(() => {
    const needle = clientSearch.trim().toLowerCase();
    const active = clients.filter((client) => client.isActive !== false);
    if (!needle) return active.slice(0, 8);
    return active
      .filter(
        (client) =>
          client.name.toLowerCase().includes(needle) ||
          client.company.toLowerCase().includes(needle) ||
          client.phone.includes(needle),
      )
      .slice(0, 8);
  }, [clients, clientSearch]);

  const selectedClient = clients.find((client) => client._id === clientId) ?? null;
  const discountInvalid = (parseMinor(discountInput) ?? -1) < 0;
  const canSave = Boolean(clientId) && items.length > 0 && !overBudget && !discountInvalid;

  /* ------------------------------------------------------------ handlers */

  const updateItem = (key: string, patch: Partial<EditorItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const addItem = () => {
    if (items.length >= 14) return;
    const first = catalog[0];
    setItems((current) => [
      ...current,
      {
        key: nextKey(),
        catalogItemId: first?._id ?? null,
        name: first?.name ?? "Custom Work",
        unitLabel: first?.unitLabel ?? "item",
        quantity: 1,
        unitPriceMinor: first?.defaultUnitPriceMinor ?? 0,
      },
    ]);
  };

  const removeItem = (key: string) =>
    setItems((current) => (current.length > 1 ? current.filter((item) => item.key !== key) : current));

  const saveInlineClient = async () => {
    if (!inlineClient || inlineClient.name.trim().length < 2) {
      setError("Enter the new client's name (at least 2 characters).");
      return;
    }
    try {
      const created = await api.admin.finance.clients.create({
        name: inlineClient.name.trim(),
        phone: inlineClient.phone.trim(),
      });
      setClientId(created._id);
      setInlineClient(null);
      setClientSearch("");
      setError(null);
      onClientCreated?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not add that client.");
    }
  };

  const submit = async () => {
    setError(null);
    setFieldErrors({});
    if (!clientId) {
      setError("Choose a client for this order.");
      return;
    }
    const payload: OrderInput = {
      clientId,
      title: title.trim(),
      notes: notes.trim(),
      deliveryDate: deliveryDate ? new Date(`${deliveryDate}T00:00:00`).toISOString() : null,
      discountMinor,
      status,
      items: items.map((item) => ({
        catalogItemId: item.catalogItemId,
        name: item.name.trim(),
        unitLabel: item.unitLabel.trim() || "item",
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      })),
    };

    if (payNow && (parseMinor(payAmount) ?? 0) > 0) {
      payload.initialPayment = { amountMinor: parseMinor(payAmount) ?? 0, method: payMethod };
    }

    if (canSplit) {
      payload.split = {
        referrer: referrerId ? { payeeId: referrerId, bp: referrerBp } : null,
        workers: activeWorkers.map((worker) => ({ payeeId: worker.payeeId, bp: worker.bp })),
      };
    }

    try {
      await onSubmit(payload);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
        setFieldErrors(cause.details ?? {});
      } else {
        setError("Could not save this order. Please try again.");
      }
    }
  };

  const history: OrderStatusHistoryEntry[] = order?.statusHistory ?? [];

  /* --------------------------------------------------------------- view */

  return (
    <Modal open={open} onClose={onClose} label={editing ? `Edit order ${order?.invoiceNumber}` : "New order"} size="lg">
      <form
        className="space-y-6"
        data-testid="order-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <h2 className="pr-8 text-lg font-semibold text-foreground">
            {editing ? order?.invoiceNumber : "New order"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {editing
              ? "Change the work, the money or the people — the split recomputes as you type."
              : "Pick the client, add the work, and see exactly how the money will be shared."}
          </p>
        </div>

        {/* ---------------------------------------------------- 1. Client */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">1 · Client</h3>
          {editing ? (
            <p className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted">
              Billed to <span className="font-medium text-foreground">{order?.clientSnapshot.name}</span>
              {order?.clientSnapshot.company ? ` — ${order.clientSnapshot.company}` : ""}. Change the client from the
              Clients page.
            </p>
          ) : (
            <>
              <label className="label" htmlFor="order-client-search">
                Choose an existing client
              </label>
              <input
                id="order-client-search"
                data-testid="order-client-search"
                className="field"
                type="search"
                placeholder="Search clients…"
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
              />
              {filteredClients.length > 0 && !clientId && (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {filteredClients.map((client) => (
                    <li key={client._id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
                        onClick={() => setClientId(client._id)}
                        data-testid={`client-option-${client._id}`}
                      >
                        <span className="font-medium text-foreground">{client.name}</span>
                        <span className="text-xs text-muted">{client.company || client.phone || ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {clientId && selectedClient && (
                <p className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" data-testid="order-client-chosen">
                  Billed to <span className="font-medium text-foreground">{selectedClient.name}</span>
                  <button
                    type="button"
                    className="ml-2 text-accent underline-offset-4 hover:underline"
                    onClick={() => setClientId("")}
                  >
                    change
                  </button>
                </p>
              )}
              {inlineClient ? (
                <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
                  <label className="label" htmlFor="inline-client-name">
                    New client name
                  </label>
                  <input
                    id="inline-client-name"
                    data-testid="inline-client-name"
                    className="field"
                    value={inlineClient.name}
                    onChange={(event) => setInlineClient({ ...inlineClient, name: event.target.value })}
                  />
                  <label className="label" htmlFor="inline-client-phone">
                    Phone (optional)
                  </label>
                  <input
                    id="inline-client-phone"
                    className="field"
                    value={inlineClient.phone}
                    onChange={(event) => setInlineClient({ ...inlineClient, phone: event.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" type="button" onClick={() => setInlineClient(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" type="button" onClick={() => void saveInlineClient()} data-testid="save-inline-client">
                      Add & choose
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setInlineClient({ name: clientSearch, phone: "" })}
                  iconLeft={<PlusIcon size={14} />}
                  data-testid="add-client-inline"
                >
                  Add new client
                </Button>
              )}
            </>
          )}
        </section>

        {/* ----------------------------------------------------- 2. Items */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">2 · Work</h3>
            <span className="text-xs text-muted">{items.length}/14 items</span>
          </div>
          <ul className="space-y-3" data-testid="order-items">
            {items.map((item, index) => (
              <li key={item.key} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <label className="label" htmlFor={`item-name-${index}`}>
                      Item
                    </label>
                    <select
                      id={`item-name-${index}`}
                      data-testid={`item-select-${index}`}
                      className="field"
                      value={item.catalogItemId ?? ""}
                      onChange={(event) => {
                        const chosen = catalog.find((entry) => entry._id === event.target.value);
                        updateItem(item.key, {
                          catalogItemId: chosen?._id ?? null,
                          name: chosen?.name ?? "Custom Work",
                          unitLabel: chosen?.unitLabel ?? "item",
                          unitPriceMinor: chosen?.defaultUnitPriceMinor ?? 0,
                        });
                      }}
                    >
                      {catalog.map((entry) => (
                        <option key={entry._id} value={entry._id}>
                          {entry.name}
                        </option>
                      ))}
                      {!catalog.some((entry) => entry._id === item.catalogItemId) && item.name && (
                        <option value="">{item.name}</option>
                      )}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="label" htmlFor={`item-qty-${index}`}>
                      Qty
                    </label>
                    <input
                      id={`item-qty-${index}`}
                      data-testid={`item-qty-${index}`}
                      className="field text-center"
                      inputMode="numeric"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.key, { quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })
                      }
                    />
                  </div>
                  <div className="w-36">
                    <label className="label" htmlFor={`item-price-${index}`}>
                      Unit price (Rs)
                    </label>
                    <input
                      id={`item-price-${index}`}
                      data-testid={`item-price-${index}`}
                      className="field text-right tabular-nums"
                      inputMode="decimal"
                      value={minorToInput(item.unitPriceMinor)}
                      onChange={(event) =>
                        updateItem(item.key, { unitPriceMinor: Math.max(0, parseMinor(event.target.value) ?? 0) })
                      }
                    />
                  </div>
                  <div className="w-32 text-right">
                    <span className="label">Amount</span>
                    <span className="block py-2 text-sm font-semibold tabular-nums text-foreground" data-testid={`item-total-${index}`}>
                      {formatMinor(item.quantity * item.unitPriceMinor)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => removeItem(item.key)}
                    disabled={items.length <= 1}
                    iconLeft={<TrashIcon size={14} />}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>Unit: {item.unitLabel}</span>
                  <input
                    className="field w-auto flex-1 basis-64 py-1.5 text-xs"
                    placeholder="Note for this line (optional)"
                    value={item.name}
                    onChange={(event) => updateItem(item.key, { name: event.target.value })}
                    aria-label={`Description for item ${index + 1}`}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={addItem}
              disabled={items.length >= 14}
              iconLeft={<PlusIcon size={14} />}
              data-testid="add-item"
            >
              Add item
            </Button>
            <div className="w-40">
              <label className="label" htmlFor="order-discount">
                Discount (Rs)
              </label>
              <input
                id="order-discount"
                data-testid="order-discount"
                className="field text-right tabular-nums"
                inputMode="decimal"
                value={discountInput}
                aria-invalid={discountInvalid ? true : undefined}
                onChange={(event) => setDiscountInput(event.target.value)}
              />
              {discountInvalid && <p className="error-text">Discount cannot be negative.</p>}
            </div>
          </div>
          <dl className="space-y-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums" data-testid="order-subtotal">{formatMinor(subtotalMinor)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Discount</dt>
              <dd className="tabular-nums" data-testid="order-discount-value">− {formatMinor(discountMinor)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-foreground">
              <dt>Total</dt>
              <dd className="tabular-nums" data-testid="order-total">{formatMinor(totalMinor)}</dd>
            </div>
          </dl>
        </section>

        {/* -------------------------------------------- 3. Status + notes */}
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="order-title">Order title</label>
              <input
                id="order-title"
                data-testid="order-title"
                className="field"
                value={title}
                placeholder="e.g. Ramadan video campaign"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="order-delivery">Delivery date</label>
              <input
                id="order-delivery"
                type="date"
                className="field"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="order-status">Status</label>
              <select
                id="order-status"
                data-testid="order-status"
                className="field"
                value={status}
                onChange={(event) => setStatus(event.target.value as OrderStatus)}
              >
                {ORDER_STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {ORDER_STATUS[value].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="order-notes">Notes (internal)</label>
              <textarea
                id="order-notes"
                className="field min-h-16"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          {history.length > 0 && (
            <p className="sm:col-span-2 text-xs text-muted">
              Status history: {history.map((entry) => ORDER_STATUS[entry.status]?.label ?? entry.status).join(" → ")}
            </p>
          )}
        </section>

        {/* ------------------------------------------- 4. Initial payment */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">3 · First payment</h3>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={payNow} onChange={(event) => setPayNow(event.target.checked)} data-testid="initial-payment-toggle" />
            Record a payment now (optional — it is saved with the order in one step)
          </label>
          {payNow && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="initial-amount">Amount (Rs)</label>
                <input
                  id="initial-amount"
                  data-testid="initial-amount"
                  className="field text-right tabular-nums"
                  inputMode="decimal"
                  value={payAmount}
                  placeholder={minorToInput(totalMinor)}
                  onChange={(event) => setPayAmount(event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="initial-method">Method</label>
                <select
                  id="initial-method"
                  className="field"
                  value={payMethod}
                  onChange={(event) => setPayMethod(event.target.value)}
                >
                  {(settings?.paymentMethods ?? ["Cash"]).map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        {/* -------------------------------------------------- 5. Shares */}
        <section className="space-y-3" data-testid="shares-section">
          <h3 className="text-sm font-semibold text-foreground">4 · Shares</h3>
          {!canSplit ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
              Only a super admin can assign shares. This order is saved with the default percentages and nobody
              assigned, so the company box keeps the share until a super admin names the people.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="share-referrer">Referrer (optional)</label>
                  <select
                    id="share-referrer"
                    data-testid="share-referrer"
                    className="field"
                    value={referrerId}
                    onChange={(event) => setReferrerId(event.target.value)}
                  >
                    <option value="">No referrer</option>
                    {payeeOptions.referrers.map((payee) => (
                      <option key={payee._id} value={payee._id}>
                        {payee.name}
                      </option>
                    ))}
                  </select>
                  {referrerId && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs text-muted" htmlFor="referrer-percent">Share</label>
                      <input
                        id="referrer-percent"
                        data-testid="referrer-percent"
                        className="field w-20 text-right tabular-nums"
                        inputMode="decimal"
                        value={bpToInput(referrerBp)}
                        onChange={(event) => setReferrerBp(percentToBp(event.target.value) ?? 0)}
                      />
                      <span className="text-xs text-muted">% of the total</span>
                    </div>
                  )}
                  {!referrerId && (
                    <p className="mt-2 text-xs text-muted">
                      No referrer — {bpToPercent(defaultReferrerBp(settings))} stays with the company.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="label mb-0">Workers ({activeWorkers.length} of 6)</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() =>
                        setWorkers((current) =>
                          current.length >= 6
                            ? current
                            : [...current, { key: nextKey(), payeeId: "", bp: defaultWorkerBp(settings) }],
                        )
                      }
                      disabled={workers.length >= 6}
                      iconLeft={<PlusIcon size={14} />}
                      data-testid="add-worker"
                    >
                      Add worker
                    </Button>
                  </div>
                  {workers.map((worker, index) => (
                    <div key={worker.key} className="flex items-center gap-2">
                      <select
                        aria-label={`Worker ${index + 1}`}
                        data-testid={`share-worker-${index}`}
                        className="field min-w-0 flex-1"
                        value={worker.payeeId}
                        onChange={(event) =>
                          setWorkers((current) =>
                            current.map((entry) =>
                              entry.key === worker.key ? { ...entry, payeeId: event.target.value } : entry,
                            ),
                          )
                        }
                      >
                        <option value="">Choose a worker…</option>
                        {payeeOptions.workers.map((payee) => (
                          <option key={payee._id} value={payee._id}>
                            {payee.name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`Worker ${index + 1} share percentage`}
                        data-testid={`worker-percent-${index}`}
                        className="field w-20 text-right tabular-nums"
                        inputMode="decimal"
                        value={bpToInput(worker.bp)}
                        disabled={!worker.payeeId}
                        onChange={(event) =>
                          setWorkers((current) =>
                            current.map((entry) =>
                              entry.key === worker.key
                                ? { ...entry, bp: percentToBp(event.target.value) ?? 0 }
                                : entry,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        aria-label={`Remove worker ${index + 1}`}
                        iconLeft={<TrashIcon size={14} />}
                        disabled={workers.length <= 1}
                        onClick={() =>
                          setWorkers((current) => current.filter((entry) => entry.key !== worker.key))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Live settlement preview */}
              <div className="overflow-x-auto rounded-xl border border-line" data-testid="split-preview">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <caption className="sr-only">How the total of this order is shared</caption>
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                      <th scope="col" className="px-3 py-2 font-semibold">Who</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">%</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.length === 0 && (
                      <tr className="table-row">
                        <td className="px-3 py-2 text-muted" colSpan={3}>
                          Nobody assigned yet — the whole total stays in the company box.
                        </td>
                      </tr>
                    )}
                    {people.map((person) => (
                      <tr key={person.key} className="table-row">
                        <td className="px-3 py-2">{person.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{bpToPercent(person.bp)}</td>
                        <td className="px-3 py-2 text-right tabular-nums" data-testid={`split-amount-${person.key}`}>
                          {formatMinor(shareOf(totalMinor, person.bp))}
                        </td>
                      </tr>
                    ))}
                    <tr className="table-row bg-surface" data-testid="split-company">
                      <td className="px-3 py-2 font-medium">Company box (Khazana)</td>
                      <td className="px-3 py-2 text-right tabular-nums">{bpToPercent(10000 - peopleBp)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMinor(companyMinor)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="px-3 py-2 text-xs text-muted" colSpan={3}>
                        Total distributed = {formatMinor(peopleMinor + companyMinor)} · order total{" "}
                        <span className="font-medium text-foreground">{formatMinor(totalMinor)}</span>
                        {people.length > 0 && peopleBp < 10000 && (
                          <>
                            {" · "}
                            {bpToPercent(10000 - peopleBp)} stays with the company (no share assigned for it — it is
                            never redistributed).
                          </>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {overBudget && (
                <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger" data-testid="split-over">
                  The shares add up to {bpToPercent(peopleBp)} — that is more than 100%. Reduce one of the shares before saving.
                </p>
              )}
            </>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger" data-testid="editor-error">
            {error}
          </p>
        )}
        {Object.entries(fieldErrors).length > 0 && (
          <ul className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
            {Object.entries(fieldErrors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Badge tone={overBudget ? "danger" : "neutral"}>
            {overBudget ? "Over 100%" : `Shares total ${bpToPercent(peopleBp)}`}
          </Badge>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!canSave} data-testid="save-order">
              {editing ? "Save changes" : "Create order"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default OrderEditor;
