"use client";

import { ChevronRightIcon } from "@/components/icons";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  busy?: boolean;
  onPageChange: (page: number) => void;
  label?: string;
}

/** Accessible pagination: prev/next, position text and total count. */
export function Pagination({
  page,
  totalPages,
  total,
  busy = false,
  onPageChange,
  label = "items",
}: PaginationProps) {
  if (total === 0) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
    >
      <p>
        {total.toLocaleString("en-US")} {label}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev || busy}
        >
          <ChevronRightIcon size={14} className="rotate-180" />
          Previous
        </button>

        <span aria-live="polite" className="px-1 text-xs">
          Page {page} of {Math.max(1, totalPages)}
        </span>

        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext || busy}
        >
          Next
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
