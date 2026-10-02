"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Spinner, Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "./Pagination";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  DownloadIcon,
  InboxIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import type { PaginationMeta, Submission, SubmissionStatus } from "@/types/api";

interface SubmissionListEnvelope {
  data: Submission[];
  meta?: PaginationMeta;
}

const STATUS_TONE: Record<SubmissionStatus, BadgeTone> = {
  New: "info",
  Contacted: "warning",
  Closed: "success",
};

const STATUSES: SubmissionStatus[] = ["New", "Contacted", "Closed"];
const PAGE_SIZE = 15;

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RowSkeleton() {
  return (
    <div className="card flex items-center gap-4 p-4" aria-hidden="true">
      <Skeleton className="h-4 w-24 rounded" />
      <Skeleton className="h-4 w-40 rounded" />
      <Skeleton className="h-4 w-28 rounded" />
    </div>
  );
}

/** Submission inbox: search, filter, detail dialog, status workflow, CSV export. */
export function SubmissionsManager() {
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(draftQuery);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftQuery]);

  const listState = useApiData<SubmissionListEnvelope>(
    (signal) => api.admin.submissions.list({ q: query, status, page, limit: PAGE_SIZE }, signal),
    `submissions:${query}:${status}:${page}`,
  );

  const items = listState.data?.data ?? [];
  const meta = listState.data?.meta;

  const changeStatus = async (submission: Submission, nextStatus: SubmissionStatus) => {
    if (submission.status === nextStatus) return;
    setBusy(true);
    setActionError(null);

    // Optimistic update — both the table and the open dialog reflect it.
    listState.setData((current) =>
      current
        ? { ...current, data: current.data.map((row) => (row._id === submission._id ? { ...row, status: nextStatus } : row)) }
        : { data: [] },
    );
    setSelected((current) => (current && current._id === submission._id ? { ...current, status: nextStatus } : current));

    try {
      const updated = await api.admin.submissions.setStatus(submission._id, nextStatus);
      listState.setData((current) =>
        current
          ? { ...current, data: current.data.map((row) => (row._id === updated._id ? updated : row)) }
          : { data: [updated] },
      );
      setSelected((current) => (current && current._id === updated._id ? updated : current));
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not update the status.");
      listState.reload();
    } finally {
      setBusy(false);
    }
  };

  const removeSubmission = async () => {
    const target = pendingDelete;
    if (!target) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.admin.submissions.remove(target._id);
      listState.setData((current) =>
        current
          ? {
              ...current,
              data: current.data.filter((row) => row._id !== target._id),
              meta: current.meta ? { ...current.meta, total: Math.max(0, current.meta.total - 1) } : undefined,
            }
          : { data: [] },
      );
      setPendingDelete(null);
      setSelected((current) => (current && current._id === target._id ? null : current));
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not delete this submission.");
      setPendingDelete(null);
      listState.reload();
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    setActionError(null);
    try {
      await api.admin.submissions.exportCsv({ status });
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not export the CSV file.");
    } finally {
      setExporting(false);
    }
  };

  const detail = selected;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            className="field pl-10"
            placeholder="Search name, email, service…"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            aria-label="Search submissions"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="submission-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="submission-status"
            className="field w-auto min-w-40"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={listState.reload} iconLeft={<RefreshIcon size={14} />}>
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportCsv()}
            loading={exporting}
            iconLeft={<DownloadIcon size={14} />}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      {/* Table */}
      {listState.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <RowSkeleton key={index} />
          ))}
        </div>
      ) : listState.error ? (
        <EmptyState
          title="Submissions could not be loaded"
          description={listState.error.message}
          icon={<RefreshIcon size={22} />}
          action={
            <Button variant="outline" size="sm" onClick={listState.reload}>
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={query || status ? "No submissions match these filters" : "No submissions yet"}
          description={
            query || status
              ? "Adjust the search or status filter to see more results."
              : "Project requests from the Start Your Project form will appear here the moment they arrive."
          }
          icon={<InboxIcon size={22} />}
          action={
            query || status ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftQuery("");
                  setStatus("");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <caption className="sr-only">Project submissions</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-3 font-semibold">Reference</th>
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Domain</th>
                <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
                <th scope="col" className="px-4 py-3 font-semibold">Service</th>
                <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Visitor IP</th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((submission) => (
                <tr key={submission._id} className="table-row align-top">
                  <td className="px-4 py-3 font-mono text-xs text-muted">{submission.referenceId}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{submission.name}</td>
                  <td className="px-4 py-3 text-muted">{submission.domain || "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    <span className="block">{submission.email || "—"}</span>
                    {submission.phone && submission.email && (
                      <span className="block text-xs">{submission.phone}</span>
                    )}
                    {!submission.email && submission.phone && <span>{submission.phone}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{submission.service}</td>
                  <td className="px-4 py-3 text-muted">
                    <time dateTime={submission.createdAt}>{formatDate(submission.createdAt)}</time>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[submission.status]}>{submission.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{submission.visitorIp || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(submission)}>
                        View
                      </Button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon text-danger hover:text-danger"
                        aria-label={`Delete submission ${submission.referenceId}`}
                        onClick={() => setPendingDelete(submission)}
                      >
                        <TrashIcon size={15} />
                      </button>
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
          page={page}
          totalPages={meta.totalPages}
          total={meta.total}
          label="submissions"
          busy={listState.loading}
          onPageChange={setPage}
        />
      )}

      {/* Detail dialog */}
      <Modal
        open={detail !== null}
        onClose={() => setSelected(null)}
        label={detail ? `Submission ${detail.referenceId}` : "Submission"}
        size="lg"
      >
        {detail && (
          <div className="space-y-5">
            <div className="pr-8">
              <p className="font-mono text-xs text-muted">{detail.referenceId}</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">{detail.name}</h2>
              <p className="mt-1 text-sm text-muted">
                Received <time dateTime={detail.createdAt}>{formatDate(detail.createdAt)}</time>
              </p>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Email</dt>
                <dd className="mt-1 break-all text-sm text-foreground">{detail.email || "—"}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Phone</dt>
                <dd className="mt-1 break-all text-sm text-foreground">{detail.phone || "—"}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Domain / work</dt>
                <dd className="mt-1 break-all text-sm text-foreground">{detail.domain || "—"}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Service requested</dt>
                <dd className="mt-1 text-sm text-foreground">{detail.service}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Visitor IP</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">{detail.visitorIp || "—"}</dd>
              </div>
            </dl>

            <div>
              <p className="label">Status</p>
              <div role="group" aria-label="Submission status" className="flex flex-wrap gap-2">
                {STATUSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void changeStatus(detail, value)}
                    disabled={busy}
                    aria-pressed={detail.status === value}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      detail.status === value
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface-elevated text-muted hover:border-accent/50 hover:text-foreground"
                    }`}
                  >
                    {value}
                  </button>
                ))}
                {busy && <Spinner label="Updating" />}
              </div>
            </div>

            <div className="flex justify-between gap-3 border-t border-line pt-5">
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => setPendingDelete(detail)}
                iconLeft={<TrashIcon size={14} />}
              >
                Delete
              </Button>
              <Button size="sm" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this submission?"
        message={`“${pendingDelete?.referenceId ?? ""}” and all of its details will be permanently removed.`}
        confirmLabel="Delete submission"
        busy={busy}
        onConfirm={() => void removeSubmission()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default SubmissionsManager;
