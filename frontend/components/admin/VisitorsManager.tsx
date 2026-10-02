"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "./Pagination";
import { GlobeIcon, RefreshIcon, SearchIcon, UsersIcon } from "@/components/icons";
import type { PaginationMeta, Visitor } from "@/types/api";

interface VisitorListEnvelope {
  data: Visitor[];
  meta?: PaginationMeta;
}

const PAGE_SIZE = 25;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Visitor analytics: paginated, deduplicated IP records with date filtering. */
export function VisitorsManager() {
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(draftQuery);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftQuery]);

  const listState = useApiData<VisitorListEnvelope>(
    (signal) => api.admin.visitors.list({ q: query, from, to, page, limit: PAGE_SIZE }, signal),
    `visitors:${query}:${from}:${to}:${page}`,
  );

  const items = listState.data?.data ?? [];
  const meta = listState.data?.meta;
  const totalVisits = items.reduce((sum, row) => sum + row.visitCount, 0);

  return (
    <div className="space-y-5">
      {/* Summary + filters */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Unique records</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">
            {(meta?.totalRecords ?? meta?.total ?? 0).toLocaleString("en-US")}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Matching visits</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">{totalVisits.toLocaleString("en-US")}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Dedupe window</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">24 h</p>
          <p className="mt-0.5 text-xs text-muted">One record per IP per day</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-full max-w-xs">
            <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              className="field pl-10"
              placeholder="Search IP, page or referrer…"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              aria-label="Search visitors"
            />
          </div>

          <div>
            <label htmlFor="visitor-from" className="label">
              From
            </label>
            <input
              id="visitor-from"
              type="date"
              className="field w-auto"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <label htmlFor="visitor-to" className="label">
              To
            </label>
            <input
              id="visitor-to"
              type="date"
              className="field w-auto"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </div>

          {(from || to || query) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftQuery("");
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={listState.reload} iconLeft={<RefreshIcon size={14} />}>
          Refresh
        </Button>
      </div>

      {/* Table */}
      {listState.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="card p-4" aria-hidden="true">
              <Skeleton className="h-4 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : listState.error ? (
        <EmptyState
          title="Visitor data could not be loaded"
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
          title={query || from || to ? "No visitors match these filters" : "No visits recorded yet"}
          description={
            query || from || to
              ? "Try widening the date range or clearing the search."
              : "Once the public site receives traffic, deduplicated visitor records appear here."
          }
          icon={<UsersIcon size={22} />}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <caption className="sr-only">Visitor records</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-3 font-semibold">IP address</th>
                <th scope="col" className="px-4 py-3 font-semibold">Visits</th>
                <th scope="col" className="px-4 py-3 font-semibold">Latest page</th>
                <th scope="col" className="px-4 py-3 font-semibold">Referrer</th>
                <th scope="col" className="px-4 py-3 font-semibold">User agent</th>
                <th scope="col" className="px-4 py-3 font-semibold">First seen</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id} className="table-row align-top">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-foreground">{row.normalizedIp}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={row.visitCount > 1 ? "success" : "neutral"}>{row.visitCount}×</Badge>
                  </td>
                  <td className="max-w-56 truncate px-4 py-3 text-muted" title={row.page}>
                    {row.page || "—"}
                  </td>
                  <td className="max-w-56 truncate px-4 py-3 text-muted" title={row.referrer}>
                    {row.referrer || "—"}
                  </td>
                  <td className="max-w-64 truncate px-4 py-3 text-xs text-muted" title={row.userAgent}>
                    {row.userAgent || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <time dateTime={row.lastVisitedAt}>{formatDateTime(row.lastVisitedAt)}</time>
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
          label="visitor records"
          busy={listState.loading}
          onPageChange={setPage}
        />
      )}

      <p className="flex items-center gap-2 text-xs text-muted">
        <GlobeIcon size={13} />
        IPs are normalized (IPv6 compressed, IPv4-mapped unwrapped) before deduplication.
      </p>
    </div>
  );
}

export default VisitorsManager;
