"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "./Pagination";
import { OrderEditor } from "./OrderEditor";
import { OrderDetail } from "./OrderDetail";
import { CatalogManager } from "./CatalogManager";
import { formatMinor } from "@/lib/bill/money";
import { ORDER_STATUS, PAYMENT_STATUS, formatDay, orderStatusMeta, paymentStatusMeta } from "@/lib/finance";
import { CartIcon, GearIcon, PlusIcon, RefreshIcon, SearchIcon } from "@/components/icons";
import type {
  AdminSession,
  CatalogItem,
  FinanceClient,
  FinanceSettings,
  Order,
  OrderInput,
  OrdersSummary,
  PaginationMeta,
  Payee,
} from "@/types/api";

interface OrderListEnvelope {
  data: Order[];
  meta?: PaginationMeta;
}

const PAGE_SIZE = 20;
const STATUS_OPTIONS = Object.keys(ORDER_STATUS) as Array<keyof typeof ORDER_STATUS>;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card order-stat px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="card flex items-center gap-4 p-4" aria-hidden="true">
      <Skeleton className="h-4 w-24 rounded" />
      <Skeleton className="h-4 w-40 rounded" />
      <Skeleton className="h-4 w-24 rounded" />
    </div>
  );
}

/** Orders: the daily screen — summary, filters, and the entry point to the editor and the bill. */
export function OrdersManager() {
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  /* `?client=<id>` deep link from the Clients page — read once during the
     first render rather than inside an effect (no cascading update). */
  const [clientFilter, setClientFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("client") ?? "";
  });
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(draftQuery);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftQuery]);

  const listState = useApiData<OrderListEnvelope>(
    (signal) =>
      api.admin.finance.orders.list(
        { q: query, status, paymentStatus, clientId: clientFilter, page, limit: PAGE_SIZE },
        signal,
      ),
    `orders:${query}:${status}:${paymentStatus}:${clientFilter}:${page}`,
  );

  const summaryState = useApiData<OrdersSummary>((signal) => api.admin.finance.orders.summary(signal), "orders-summary");
  const sessionState = useApiData<AdminSession>(() => api.auth.me(), "orders-session");
  const settingsState = useApiData<FinanceSettings>((signal) => api.admin.finance.settings.get(signal), "orders-settings");
  const catalogState = useApiData<CatalogItem[]>((signal) => api.admin.finance.catalog.list(signal), "orders-catalog");
  const clientsState = useApiData<FinanceClient[]>(
    (signal) => api.admin.finance.clients.list({ active: "true", limit: 100 }, signal).then((envelope) => envelope.data),
    "orders-clients",
  );
  const payeesState = useApiData<Payee[]>(
    (signal) => api.admin.finance.payees.list({ active: "true", limit: 100 }, signal).then((envelope) => envelope.data),
    "orders-payees",
  );

  const canSplit = sessionState.data?.role === "super_admin";
  const items = listState.data?.data ?? [];
  const meta = listState.data?.meta;
  const summary = summaryState.data;

  const clientName = useMemo(() => {
    const map = new Map<string, string>();
    for (const client of clientsState.data ?? []) map.set(client._id, client.name);
    return map;
  }, [clientsState.data]);

  const reloadAll = () => {
    listState.reload();
    summaryState.reload();
  };

  const openNew = () => {
    setEditing(null);
    setActionError(null);
    setEditorOpen(true);
  };

  const openDetail = (id: string) => setOpenOrderId(id);

  const submitOrder = async (input: OrderInput) => {
    setBusy(true);
    try {
      if (editing) {
        await api.admin.finance.orders.update(editing._id, input);
      } else {
        const created = await api.admin.finance.orders.create(input);
        setOpenOrderId(created._id);
      }
      setEditorOpen(false);
      setEditing(null);
      reloadAll();
      clientsState.reload();
    } catch (cause) {
      // Re-throw so the editor can show its own inline error with field details.
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const closeDetail = () => {
    setOpenOrderId(null);
    reloadAll();
  };

  return (
    <div className="space-y-5" data-orders-manager>
      {/* ------------------------------------------------- Summary strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryState.loading ? (
          Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)
        ) : summary ? (
          <>
            <StatTile label="Open orders" value={String(summary.openOrders)} hint="New, in progress or in review" />
            <StatTile label="Unpaid balance" value={formatMinor(summary.unpaidBalanceMinor)} hint="Across every open order" />
            <StatTile label="Collected this month" value={formatMinor(summary.collectedThisMonthMinor)} hint={`${summary.paymentsThisMonth} payment(s)`} />
            <StatTile label="Delivered this month" value={String(summary.deliveredThisMonth)} hint="Delivered or completed" />
          </>
        ) : (
          <StatTile label="Summary" value="—" hint="Unavailable right now" />
        )}
      </div>

      {/* ------------------------------------------------------- Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            className="field pl-10"
            placeholder="Search invoice or client…"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            aria-label="Search orders"
            data-testid="orders-search"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="orders-status" className="sr-only">Filter by status</label>
          <select
            id="orders-status"
            className="field w-auto min-w-36"
            value={status}
            data-testid="orders-status-filter"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS[value].label}
              </option>
            ))}
          </select>
          <label htmlFor="orders-payment" className="sr-only">Filter by payment</label>
          <select
            id="orders-payment"
            className="field w-auto min-w-36"
            value={paymentStatus}
            onChange={(event) => {
              setPaymentStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All payments</option>
            {(Object.keys(PAYMENT_STATUS) as Array<keyof typeof PAYMENT_STATUS>).map((value) => (
              <option key={value} value={value}>
                {PAYMENT_STATUS[value].label}
              </option>
            ))}
          </select>
          {clientFilter && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setClientFilter("");
                setPage(1);
              }}
            >
              Client: {clientName.get(clientFilter) ?? "selected"} ✕
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={reloadAll} iconLeft={<RefreshIcon size={14} />}>
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCatalogOpen(true)} iconLeft={<GearIcon size={14} />}>
            Manage defaults
          </Button>
          <Button size="sm" onClick={openNew} iconLeft={<PlusIcon size={14} />} data-testid="new-order">
            New order
          </Button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      {/* ---------------------------------------------------------- List */}
      {listState.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <RowSkeleton key={index} />
          ))}
        </div>
      ) : listState.error ? (
        <EmptyState
          title="Orders could not be loaded"
          description={listState.error.message}
          icon={<CartIcon size={22} />}
          action={
            <Button variant="outline" size="sm" onClick={listState.reload}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={query || status || paymentStatus || clientFilter ? "No orders match these filters" : "No orders yet"}
          description={
            query || status || paymentStatus || clientFilter
              ? "Adjust the search or clear the filters."
              : "Create the first order — the invoice number, the split and the bill are all produced for you."
          }
          icon={<CartIcon size={22} />}
          action={
            query || status || paymentStatus || clientFilter ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftQuery("");
                  setStatus("");
                  setPaymentStatus("");
                  setClientFilter("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={openNew} iconLeft={<PlusIcon size={14} />}>
                New order
              </Button>
            )
          }
        />
      ) : (
        <div className="card relative overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <caption className="sr-only">Orders</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-3 font-semibold">Invoice</th>
                <th scope="col" className="px-4 py-3 font-semibold">Client</th>
                <th scope="col" className="px-4 py-3 font-semibold">Title</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Balance</th>
                <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody data-testid="orders-rows">
              {items.map((order) => {
                const statusMeta = orderStatusMeta(order.status);
                const paymentMeta = paymentStatusMeta(order.paymentStatus);
                return (
                  <tr key={order._id} className="table-row align-top" data-testid={`order-row-${order.invoiceNumber}`}>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{order.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{order.clientSnapshot.name}</span>
                      {order.clientSnapshot.company && (
                        <span className="block text-xs text-muted">{order.clientSnapshot.company}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{order.title || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={paymentMeta.tone}>{paymentMeta.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMinor(order.totalMinor)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMinor(order.balanceMinor ?? Math.max(0, order.totalMinor - order.paidMinor))}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDay(order.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(order._id)} data-testid={`open-order-${order.invoiceNumber}`}>
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(order);
                            setActionError(null);
                            setEditorOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          busy={listState.loading}
          onPageChange={setPage}
          label="orders"
        />
      )}

      {/* -------------------------------------------------------- Dialogs */}
      {editorOpen && (
        <OrderEditor
          open={editorOpen}
          order={editing}
          settings={settingsState.data}
          catalog={catalogState.data ?? []}
          clients={clientsState.data ?? []}
          payees={payeesState.data ?? []}
          canSplit={canSplit}
          busy={busy}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSubmit={submitOrder}
          onClientCreated={clientsState.reload}
        />
      )}

      {openOrderId && (
        <OrderDetail
          orderId={openOrderId}
          canSplit={canSplit}
          paymentMethods={settingsState.data?.paymentMethods ?? ["Cash"]}
          onClose={closeDetail}
          onEdit={(order) => {
            setOpenOrderId(null);
            setEditing(order);
            setEditorOpen(true);
          }}
          onChanged={reloadAll}
        />
      )}

      <CatalogManager open={catalogOpen} onClose={() => {
        setCatalogOpen(false);
        catalogState.reload();
        setActionError(null);
      }} />
    </div>
  );
}

export default OrdersManager;
