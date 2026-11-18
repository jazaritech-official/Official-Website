"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { formatMinor, minorToInput, parseMinor } from "@/lib/bill/money";
import {
  bpToInput,
  bpToPercent,
  computeOwnerSplit,
  ORDER_STATUS,
  ORDER_STATUS_ORDER,
  percentToBp,
  splitShareError,
  type OwnerShare,
} from "@/lib/finance";
import { PlusIcon, TrashIcon } from "@/components/icons";
import type {
  FinanceClient,
  FinanceSettings,
  Order,
  OrderInput,
  OrderStatus,
  OrderStatusHistoryEntry,
  WorkType,
} from "@/types/api";

/**
 * ORDER EDITOR — one screen that builds an order from the WORK TYPES price
 * list, keeps the money in integer paisa, and shows the three-owner split live
 * while you type.
 *
 * Money rules mirrored here from the backend:
 *   line   = quantity × unit price (snapshot taken from the work type)
 *   total  = Σ lines − discount
 *   owner  = floor(total × bp / 10000), remainder by largest fraction
 *            (Backend/utils/splitTemplate.js — identical maths, see
 *            computeOwnerSplit in @/lib/finance)
 * The split is configured once in the Split Template; a super admin may give
 * THIS order a different split, but it must still total exactly 100%.
 */

interface EditorItem {
  key: string;
  catalogItemId: string | null;
  /** The work type this line was picked from (null → a custom line). */
  workTypeId: string | null;
  name: string;
  unitLabel: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface OrderEditorProps {
  open: boolean;
  /** `null` creates a new order. */
  order: Order | null;
  settings: FinanceSettings | null;
  /** The owner-managed price list — every line picks from it. */
  workTypes: WorkType[];
  clients: FinanceClient[];
  /** False for a plain admin: the per-order override controls are hidden. */
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

/**
 * The Split Template as a runnable entry list — the optional "Company reserve"
 * is appended as a pseudo-entry so the SAME maths covers it. Returns [] when
 * the owner has not configured a template yet.
 */
function templateEntries(settings: FinanceSettings | null): OwnerShare[] {
  const template = settings?.splitTemplate;
  const raw = Array.isArray(template?.entries) ? template.entries : [];
  const entries: OwnerShare[] = raw.map((entry) => ({
    ownerId: entry.ownerId ?? null,
    name: entry.name,
    role: entry.role ?? "",
    bp: entry.bp,
    isReserve: false,
  }));
  const reserve = template?.companyReserveBp ?? 0;
  if (reserve > 0) {
    entries.push({ ownerId: null, name: "Company reserve", role: "", bp: reserve, isReserve: true });
  }
  return entries;
}

export function OrderEditor({
  open,
  order,
  settings,
  workTypes,
  clients,
  canSplit,
  busy = false,
  onClose,
  onSubmit,
  onClientCreated,
}: OrderEditorProps) {
  const editing = Boolean(order);
  const activeWorkTypes = useMemo(() => workTypes.filter((type) => type.isActive !== false), [workTypes]);

  const [clientId, setClientId] = useState<string>(() => order?.clientId ?? "");
  const [clientSearch, setClientSearch] = useState("");
  const [inlineClient, setInlineClient] = useState<{ name: string; phone: string } | null>(null);
  const [items, setItems] = useState<EditorItem[]>(() =>
    order
      ? order.items.map((item) => ({
          key: nextKey(),
          catalogItemId: item.catalogItemId ?? null,
          workTypeId: item.workTypeId ?? null,
          name: item.name,
          unitLabel: item.unitLabel,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
        }))
      : [
          {
            key: nextKey(),
            catalogItemId: null,
            workTypeId: activeWorkTypes[0]?._id ?? null,
            name: activeWorkTypes[0]?.name ?? "",
            unitLabel: "item",
            quantity: 1,
            unitPriceMinor: activeWorkTypes[0]?.unitPrice ?? 0,
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
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /* Optional PER-ORDER override of the Split Template (super admin only).
     Shares are edited as basis points and must total exactly 10000 (100%). */
  const [overrideOn, setOverrideOn] = useState(false);
  const [overrideEntries, setOverrideEntries] = useState<OwnerShare[]>([]);

  /* ------------------------------------------------------------- derived */

  const lineTotals = items.map((item) => item.quantity * item.unitPriceMinor);
  const subtotalMinor = lineTotals.reduce((sum, value) => sum + value, 0);
  const discountMinor = Math.min(Math.max(parseMinor(discountInput) ?? 0, 0), subtotalMinor);
  const totalMinor = subtotalMinor - discountMinor;

  const templateEntryList = templateEntries(settings);
  const previewEntries = overrideOn ? overrideEntries : templateEntryList;
  const splitMessage = previewEntries.length > 0 ? splitShareError(previewEntries, 0) : null;
  const splitInvalid = previewEntries.length > 0 && splitMessage !== null;
  const roundTo100 = settings?.splitTemplate?.roundTo100 === true;
  const splitShares =
    previewEntries.length > 0 && !splitInvalid
      ? computeOwnerSplit(totalMinor, previewEntries, { roundTo100 })
      : [];
  const splitBpTotal = previewEntries.reduce((sum, entry) => sum + entry.bp, 0);
  const hasTemplate = templateEntryList.length > 0;
  const overBudget = splitInvalid;

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
    const first = activeWorkTypes[0];
    setItems((current) => [
      ...current,
      {
        key: nextKey(),
        catalogItemId: null,
        workTypeId: first?._id ?? null,
        name: first?.name ?? "",
        unitLabel: "item",
        quantity: 1,
        unitPriceMinor: first?.unitPrice ?? 0,
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
        workTypeId: item.workTypeId,
        name: item.name.trim(),
        unitLabel: item.unitLabel.trim() || "item",
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      })),
    };

    if (payNow && (parseMinor(payAmount) ?? 0) > 0) {
      payload.initialPayment = { amountMinor: parseMinor(payAmount) ?? 0, method: payMethod };
    }

    if (canSplit && overrideOn) {
      if (splitMessage) {
        setError(splitMessage);
        setFieldErrors({ splitOverride: splitMessage });
        return;
      }
      const owners = previewEntries.filter((entry) => !entry.isReserve);
      const reserve = previewEntries.find((entry) => entry.isReserve);
      payload.splitOverride = {
        entries: owners.map((entry) => ({ ownerId: entry.ownerId ?? "", bp: entry.bp, role: entry.role })),
        companyReserveBp: reserve?.bp ?? 0,
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
              ? "Change the work, the money or the owners' split — everything recomputes as you type."
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
                      Work type
                    </label>
                    <input
                      id={`item-name-${index}`}
                      data-testid={`item-select-${index}`}
                      className="field"
                      list={`work-type-options-${index}`}
                      autoComplete="off"
                      placeholder="Search work types…"
                      value={item.name}
                      onChange={(event) => {
                        const typed = event.target.value;
                        const chosen = activeWorkTypes.find(
                          (entry) => entry.name.toLowerCase() === typed.trim().toLowerCase(),
                        );
                        if (chosen) {
                          updateItem(item.key, {
                            workTypeId: chosen._id,
                            catalogItemId: null,
                            name: chosen.name,
                            unitLabel: "item",
                            unitPriceMinor: chosen.unitPrice,
                          });
                        } else {
                          // Free text → a custom line with no work type behind it.
                          updateItem(item.key, { workTypeId: null, name: typed });
                        }
                      }}
                    />
                    <datalist id={`work-type-options-${index}`}>
                      {activeWorkTypes.map((entry) => (
                        <option key={entry._id} value={entry.name}>
                          {formatMinor(entry.unitPrice)}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <div className="w-36">
                    <label className="label" htmlFor={`item-qty-${index}`}>
                      Qty
                    </label>
                    <div className="flex items-stretch gap-1">
                      <button
                        type="button"
                        className="btn btn-outline btn-icon !min-h-11 !min-w-11 shrink-0"
                        aria-label={`One fewer of line ${index + 1}`}
                        onClick={() => updateItem(item.key, { quantity: Math.max(1, item.quantity - 1) })}
                      >
                        <span aria-hidden="true">−</span>
                      </button>
                      <input
                        id={`item-qty-${index}`}
                        data-testid={`item-qty-${index}`}
                        className="field w-14 text-center"
                        inputMode="numeric"
                        min={1}
                        value={item.quantity}
                        aria-label={`Quantity for line ${index + 1}`}
                        onChange={(event) =>
                          updateItem(item.key, { quantity: Math.min(100000, Math.max(1, Number.parseInt(event.target.value, 10) || 1)) })
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-icon !min-h-11 !min-w-11 shrink-0"
                        aria-label={`One more of line ${index + 1}`}
                        onClick={() => updateItem(item.key, { quantity: Math.min(100000, item.quantity + 1) })}
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    </div>
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
                    {workTypes.find((entry) => entry._id === item.workTypeId) &&
                      item.unitPriceMinor !== workTypes.find((entry) => entry._id === item.workTypeId)?.unitPrice && (
                        <Badge tone="warning">Custom price</Badge>
                      )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="!min-h-11"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => removeItem(item.key)}
                    disabled={items.length <= 1}
                    iconLeft={<TrashIcon size={14} />}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <input
                    className="field w-auto flex-1 basis-64 py-1.5 text-xs"
                    placeholder="Description for this line (optional)"
                    value={item.name}
                    aria-label={`Description for line ${index + 1}`}
                    onChange={(event) => updateItem(item.key, { name: event.target.value })}
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
              Add work
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

        {/* ------------------------------------------- 5. Owners' split */}
        <section className="space-y-3" data-testid="owner-split-section">
          <h3 className="text-sm font-semibold text-foreground">4 · Owners&apos; split</h3>
          {!hasTemplate ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted" data-testid="owner-split-empty">
              No Split Template yet — this order keeps the current settlement. A super admin can divide the whole
              amount between the owners in <span className="font-medium text-foreground">Treasury → Split
              Template</span>; the shares must total exactly 100%.
            </p>
          ) : (
            <>
              {overrideOn && canSplit && (
                <div className="space-y-2 rounded-xl border border-line bg-surface p-3" data-testid="split-override">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">This order only</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => setOverrideOn(false)}
                    >
                      Use the template instead
                    </Button>
                  </div>
                  <ul className="space-y-2">
                    {overrideEntries.map((entry, index) => (
                      <li key={`${entry.ownerId ?? "reserve"}-${index}`} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {entry.name}
                          {entry.role ? <span className="text-muted"> · {entry.role}</span> : null}
                        </span>
                        <input
                          aria-label={`${entry.name} share percentage`}
                          data-testid={`override-percent-${index}`}
                          className="field w-24 text-right tabular-nums"
                          inputMode="decimal"
                          value={bpToInput(entry.bp)}
                          onChange={(event) => {
                            const bp = percentToBp(event.target.value) ?? 0;
                            setOverrideEntries((current) =>
                              current.map((row, rowIndex) => (rowIndex === index ? { ...row, bp } : row)),
                            );
                          }}
                        />
                        <span className="text-xs text-muted">%</span>
                      </li>
                    ))}
                  </ul>
                  {splitMessage && (
                    <p role="alert" className="text-sm text-danger" data-testid="split-error">
                      {splitMessage}
                    </p>
                  )}
                </div>
              )}

              {canSplit && !overrideOn && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    data-testid="split-override-on"
                    onClick={() => {
                      setOverrideEntries(templateEntryList.map((entry) => ({ ...entry })));
                      setOverrideOn(true);
                    }}
                  >
                    Different split for this order
                  </Button>
                </div>
              )}

              {!canSplit && (
                <p className="text-xs text-muted">
                  Only a super admin can give one order a different split.
                </p>
              )}

              {/* Live three-owner preview */}
              <div className="overflow-x-auto rounded-xl border border-line" data-testid="split-preview">
                <table className="w-full min-w-[320px] text-left text-sm">
                  <caption className="sr-only">How the total of this order is shared among the owners</caption>
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                      <th scope="col" className="px-3 py-2 font-semibold">Owner</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Share</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {splitShares.map((entry, index) => (
                      <tr key={`${entry.ownerId ?? "reserve"}-${index}`} className="table-row">
                        <td className="px-3 py-2">
                          {entry.name}
                          {entry.isReserve && <span className="ml-1 text-xs text-muted">(reserve)</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{bpToPercent(entry.bp)}</td>
                        <td className="px-3 py-2 text-right tabular-nums" data-testid={`split-amount-${index}`}>
                          {formatMinor(entry.amountMinor ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface">
                      <td className="px-3 py-2 font-medium" colSpan={2}>
                        Total distributed
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums" data-testid="split-total">
                        {formatMinor(splitShares.reduce((sum, entry) => sum + (entry.amountMinor ?? 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-muted" data-testid="split-footnote">
                Rounded to whole rupees; remainder assigned by largest fraction
                {roundTo100
                  ? " · shares rounded to the nearest Rs 100 (the last owner takes the leftover)"
                  : ""}
                . Order total <span className="font-medium text-foreground">{formatMinor(totalMinor)}</span>.
              </p>
              {splitInvalid && (
                <p
                  role="alert"
                  className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger"
                  data-testid="split-over"
                >
                  {splitMessage}
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
            {overBudget
              ? `Shares total ${bpToPercent(splitBpTotal)} — must be 100%`
              : hasTemplate
                ? `Shares total ${bpToPercent(splitBpTotal)}`
                : "No split template yet"}
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
