"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "./Pagination";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatMinor } from "@/lib/bill/money";
import { formatDay } from "@/lib/finance";
import { PlusIcon, RefreshIcon, SearchIcon, UsersIcon } from "@/components/icons";
import type { FinanceClient, PaginationMeta } from "@/types/api";

interface ClientListEnvelope {
  data: FinanceClient[];
  meta?: PaginationMeta;
}

const PAGE_SIZE = 20;

interface DraftClient {
  _id?: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  notes: string;
}

const EMPTY_DRAFT: DraftClient = { name: "", phone: "", email: "", company: "", address: "", notes: "" };

function RowSkeleton() {
  return (
    <div className="card flex items-center gap-4 p-4" aria-hidden="true">
      <Skeleton className="h-4 w-32 rounded" />
      <Skeleton className="h-4 w-40 rounded" />
      <Skeleton className="h-4 w-24 rounded" />
    </div>
  );
}

/** Client book: search, add/edit, deactivate, per-client money totals. */
export function ClientsManager() {
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<DraftClient | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FinanceClient | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(draftQuery);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftQuery]);

  const listState = useApiData<ClientListEnvelope>(
    (signal) => api.admin.finance.clients.list({ q: query, active: activeFilter, page, limit: PAGE_SIZE }, signal),
    `clients:${query}:${activeFilter}:${page}`,
  );

  const items = listState.data?.data ?? [];
  const meta = listState.data?.meta;

  const openNew = () => {
    setFieldErrors({});
    setFormError(null);
    setDraft({ ...EMPTY_DRAFT });
  };

  const openEdit = (client: FinanceClient) => {
    setFieldErrors({});
    setFormError(null);
    setDraft({
      _id: client._id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      company: client.company,
      address: client.address,
      notes: client.notes,
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (draft._id) {
        await api.admin.finance.clients.update(draft._id, draft);
      } else {
        await api.admin.finance.clients.create(draft);
      }
      setDraft(null);
      listState.reload();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFormError(cause.message);
        setFieldErrors(cause.details ?? {});
      } else {
        setFormError("Could not save this client. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (client: FinanceClient) => {
    setBusy(true);
    try {
      await api.admin.finance.clients.update(client._id, { isActive: !client.isActive });
      setPendingDelete(null);
      listState.reload();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "Could not update this client.");
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-clients-manager>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            className="field pl-10"
            placeholder="Search name, phone, email…"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            aria-label="Search clients"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="client-active" className="sr-only">
            Filter by state
          </label>
          <select
            id="client-active"
            className="field w-auto min-w-36"
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All clients</option>
            <option value="true">Active only</option>
            <option value="false">Deactivated</option>
          </select>
          <Button variant="outline" size="sm" onClick={listState.reload} iconLeft={<RefreshIcon size={14} />}>
            Refresh
          </Button>
          <Button size="sm" onClick={openNew} iconLeft={<PlusIcon size={14} />} data-testid="new-client">
            New client
          </Button>
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      )}

      {listState.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <RowSkeleton key={index} />
          ))}
        </div>
      ) : listState.error ? (
        <EmptyState
          title="Clients could not be loaded"
          description={listState.error.message}
          icon={<UsersIcon size={22} />}
          action={
            <Button variant="outline" size="sm" onClick={listState.reload}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={query || activeFilter ? "No clients match" : "No clients yet"}
          description={
            query || activeFilter
              ? "Adjust the search or clear the filter."
              : "Add the first client — they become selectable in every new order."
          }
          icon={<UsersIcon size={22} />}
          action={
            query || activeFilter ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftQuery("");
                  setActiveFilter("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={openNew} iconLeft={<PlusIcon size={14} />}>
                New client
              </Button>
            )
          }
        />
      ) : (
        <div className="card relative overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">Clients</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-3 font-semibold">Client</th>
                <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
                <th scope="col" className="px-4 py-3 font-semibold">Orders</th>
                <th scope="col" className="px-4 py-3 font-semibold">Billed</th>
                <th scope="col" className="px-4 py-3 font-semibold">Paid</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last order</th>
                <th scope="col" className="px-4 py-3 font-semibold">State</th>
                <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((client) => (
                <tr key={client._id} className="table-row align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders?client=${client._id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      data-testid="client-orders-link"
                    >
                      {client.name}
                    </Link>
                    {client.company && <span className="block text-xs text-muted">{client.company}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <span className="block">{client.phone || "—"}</span>
                    {client.email && <span className="block text-xs">{client.email}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{client.orderCount ?? 0}</td>
                  <td className="px-4 py-3">{formatMinor(client.billedMinor ?? 0)}</td>
                  <td className="px-4 py-3">{formatMinor(client.paidMinor ?? 0)}</td>
                  <td className="px-4 py-3 text-muted">{formatDay(client.lastOrderAt)}</td>
                  <td className="px-4 py-3">
                    {client.isActive === false ? <Badge tone="neutral">Deactivated</Badge> : <Badge tone="success">Active</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(client)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPendingDelete(client)}>
                        {client.isActive === false ? "Restore" : "Deactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
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
          label="clients"
        />
      )}

      {/* Add / edit client */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        label={draft?._id ? "Edit client" : "New client"}
        size="md"
      >
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div>
              <label className="label" htmlFor="client-name">
                Name <span aria-hidden="true" className="text-danger">*</span>
              </label>
              <input
                id="client-name"
                data-autofocus
                className="field"
                value={draft.name}
                aria-invalid={fieldErrors.name ? true : undefined}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
              />
              {fieldErrors.name && <p className="error-text">{fieldErrors.name}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="client-phone">Phone</label>
                <input
                  id="client-phone"
                  className="field"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="client-email">Email</label>
                <input
                  id="client-email"
                  type="email"
                  className="field"
                  value={draft.email}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                />
                {fieldErrors.email && <p className="error-text">{fieldErrors.email}</p>}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="client-company">Company</label>
              <input
                id="client-company"
                className="field"
                value={draft.company}
                onChange={(event) => setDraft({ ...draft, company: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="client-address">Address (printed on the bill)</label>
              <input
                id="client-address"
                className="field"
                value={draft.address}
                onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="client-notes">Notes</label>
              <textarea
                id="client-notes"
                className="field min-h-20"
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </div>
            {formError && (
              <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)} type="button">
                Cancel
              </Button>
              <Button type="submit" loading={busy} data-testid="save-client">
                {draft._id ? "Save changes" : "Add client"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.isActive === false ? "Restore this client?" : "Deactivate this client?"}
        message={
          pendingDelete?.isActive === false
            ? `${pendingDelete?.name} becomes selectable again in new orders.`
            : `${pendingDelete?.name} stays in past orders but is hidden from new ones. Nothing is deleted — clients with orders cannot be deleted.`
        }
        confirmLabel={pendingDelete?.isActive === false ? "Restore" : "Deactivate"}
        busy={busy}
        onConfirm={() => pendingDelete && void deactivate(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default ClientsManager;
