"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "./Pagination";
import { formatMinor } from "@/lib/bill/money";
import { HandshakeIcon, PlusIcon, RefreshIcon, SearchIcon } from "@/components/icons";
import type { PaginationMeta, Payee, PayeeRole } from "@/types/api";

interface PayeeListEnvelope {
  data: Payee[];
  meta?: PaginationMeta;
}

const PAGE_SIZE = 20;

const ROLE_LABEL: Record<PayeeRole, string> = {
  worker: "Worker",
  referrer: "Referrer",
  both: "Worker & referrer",
};

const ROLE_HINT: Record<PayeeRole, string> = {
  worker: "Does the work on an order — normally 20% each.",
  referrer: "Brought the client in — normally 10%.",
  both: "Can be picked as either.",
};

interface DraftPayee {
  _id?: string;
  name: string;
  role: PayeeRole;
  phone: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_DRAFT: DraftPayee = { name: "", role: "worker", phone: "", notes: "", isActive: true };

function RowSkeleton() {
  return (
    <div className="card flex items-center gap-4 p-4" aria-hidden="true">
      <Skeleton className="h-4 w-32 rounded" />
      <Skeleton className="h-4 w-40 rounded" />
      <Skeleton className="h-4 w-24 rounded" />
    </div>
  );
}

/** Workers & referrers: the people named in an order's split. Not accounts. */
export function PayeesManager() {
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<DraftPayee | null>(null);
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

  const listState = useApiData<PayeeListEnvelope>(
    (signal) => api.admin.finance.payees.list({ q: query, role: roleFilter, page, limit: PAGE_SIZE }, signal),
    `payees:${query}:${roleFilter}:${page}`,
  );

  const items = listState.data?.data ?? [];
  const meta = listState.data?.meta;

  const openNew = () => {
    setFieldErrors({});
    setFormError(null);
    setDraft({ ...EMPTY_DRAFT });
  };

  const openEdit = (payee: Payee) => {
    setFieldErrors({});
    setFormError(null);
    setDraft({
      _id: payee._id,
      name: payee.name,
      role: payee.role,
      phone: payee.phone,
      notes: payee.notes,
      isActive: payee.isActive,
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (draft._id) {
        await api.admin.finance.payees.update(draft._id, draft);
      } else {
        await api.admin.finance.payees.create(draft);
      }
      setDraft(null);
      listState.reload();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFormError(cause.message);
        setFieldErrors(cause.details ?? {});
      } else {
        setFormError("Could not save this person. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (payee: Payee) => {
    setBusy(true);
    try {
      await api.admin.finance.payees.update(payee._id, { isActive: !payee.isActive });
      listState.reload();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "Could not update this person.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-payees-manager>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            className="field pl-10"
            placeholder="Search name or phone…"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            aria-label="Search workers and referrers"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="payee-role" className="sr-only">
            Filter by role
          </label>
          <select
            id="payee-role"
            className="field w-auto min-w-36"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Everyone</option>
            <option value="worker">Workers</option>
            <option value="referrer">Referrers</option>
            <option value="both">Both</option>
          </select>
          <Button variant="outline" size="sm" onClick={listState.reload} iconLeft={<RefreshIcon size={14} />}>
            Refresh
          </Button>
          <Button size="sm" onClick={openNew} iconLeft={<PlusIcon size={14} />} data-testid="new-payee">
            Add person
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
          {Array.from({ length: 4 }, (_, index) => (
            <RowSkeleton key={index} />
          ))}
        </div>
      ) : listState.error ? (
        <EmptyState
          title="People could not be loaded"
          description={listState.error.message}
          icon={<HandshakeIcon size={22} />}
          action={
            <Button variant="outline" size="sm" onClick={listState.reload}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={query || roleFilter ? "Nobody matches" : "No workers or referrers yet"}
          description={
            query || roleFilter
              ? "Adjust the search or clear the filter."
              : "Add the people who do the work and the people who bring clients in, then pick them in an order's Shares section."
          }
          icon={<HandshakeIcon size={22} />}
          action={
            query || roleFilter ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftQuery("");
                  setRoleFilter("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={openNew} iconLeft={<PlusIcon size={14} />}>
                Add person
              </Button>
            )
          }
        />
      ) : (
        <div className="card relative overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">Workers and referrers</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                <th scope="col" className="px-4 py-3 font-semibold">Phone</th>
                <th scope="col" className="px-4 py-3 font-semibold">Orders</th>
                <th scope="col" className="px-4 py-3 font-semibold">Owed</th>
                <th scope="col" className="px-4 py-3 font-semibold">Paid out</th>
                <th scope="col" className="px-4 py-3 font-semibold">State</th>
                <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((payee) => (
                <tr key={payee._id} className="table-row align-top">
                  <td className="px-4 py-3 font-medium text-foreground">{payee.name}</td>
                  <td className="px-4 py-3 text-muted">
                    <Badge tone={payee.role === "referrer" ? "info" : "neutral"}>{ROLE_LABEL[payee.role]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{payee.phone || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{payee.orderCount ?? 0}</td>
                  <td className="px-4 py-3">{formatMinor(payee.owedMinor ?? 0)}</td>
                  <td className="px-4 py-3">{formatMinor(payee.paidOutMinor ?? 0)}</td>
                  <td className="px-4 py-3">
                    {payee.isActive === false ? <Badge tone="neutral">Inactive</Badge> : <Badge tone="success">Active</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(payee)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void toggleActive(payee)} disabled={busy}>
                        {payee.isActive === false ? "Activate" : "Deactivate"}
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
          label="people"
        />
      )}

      <Modal open={draft !== null} onClose={() => setDraft(null)} label={draft?._id ? "Edit person" : "Add person"} size="md">
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div>
              <label className="label" htmlFor="payee-name">
                Name <span aria-hidden="true" className="text-danger">*</span>
              </label>
              <input
                id="payee-name"
                data-autofocus
                className="field"
                value={draft.name}
                aria-invalid={fieldErrors.name ? true : undefined}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
              />
              {fieldErrors.name && <p className="error-text">{fieldErrors.name}</p>}
            </div>
            <div>
              <label className="label" htmlFor="payee-role-select">Role</label>
              <select
                id="payee-role-select"
                className="field"
                value={draft.role}
                onChange={(event) => setDraft({ ...draft, role: event.target.value as PayeeRole })}
              >
                {(Object.keys(ROLE_LABEL) as PayeeRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted">{ROLE_HINT[draft.role]}</p>
            </div>
            <div>
              <label className="label" htmlFor="payee-phone">Phone</label>
              <input
                id="payee-phone"
                className="field"
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="payee-notes">Notes</label>
              <textarea
                id="payee-notes"
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
              <Button type="submit" loading={busy} data-testid="save-payee">
                {draft._id ? "Save changes" : "Add person"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default PayeesManager;
