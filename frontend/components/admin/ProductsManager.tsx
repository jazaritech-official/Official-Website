"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner, Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "./Pagination";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProductEditor } from "./ProductEditor";
import { TemplatesPanel } from "./TemplatesPanel";
import {
  ChevronRightIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  LayersIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import type { PaginationMeta, Product, ProductTypeTemplate } from "@/types/api";

interface ProductListEnvelope {
  data: Product[];
  meta?: PaginationMeta;
}

const PAGE_SIZE = 8;

function monogram(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "JT"
  );
}

function RowSkeleton() {
  return (
    <div className="card flex items-center gap-4 p-4" aria-hidden="true">
      <Skeleton className="size-12 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-3 w-64 rounded" />
      </div>
    </div>
  );
}

/** Product catalogue management + the smart template library. */
export function ProductsManager() {
  const [tab, setTab] = useState<"products" | "templates">("products");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Debounced search — updates the list key, which re-runs the loader.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(draftQuery);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftQuery]);

  const templatesState = useApiData<ProductTypeTemplate[]>(() => api.admin.templates.list(), "templates");
  const templates = templatesState.data ?? [];

  const listState = useApiData<ProductListEnvelope>(
    (signal) => api.admin.products.list({ q: query, page, limit: PAGE_SIZE }, signal),
    `products:${query}:${page}`,
  );

  const items = listState.data?.data ?? [];
  const meta = listState.data?.meta;

  /* --- Mutations ---------------------------------------------------------- */

  const handleSaved = (saved: Product, mode: "create" | "update") => {
    if (mode === "update") {
      listState.setData((current) =>
        current
          ? { ...current, data: current.data.map((row) => (row._id === saved._id ? saved : row)) }
          : { data: [saved] },
      );
      setEditing(undefined);
      return;
    }
    setEditing(undefined);
    listState.reload();
  };

  const removeProduct = async () => {
    const target = pendingDelete;
    if (!target) return;
    setBusyId(target._id);
    setActionError(null);
    try {
      await api.admin.products.remove(target._id);
      listState.setData((current) =>
        current
          ? {
              ...current,
              data: current.data.filter((row) => row._id !== target._id),
              meta: current.meta
                ? { ...current.meta, total: Math.max(0, current.meta.total - 1) }
                : undefined,
            }
          : { data: [] },
      );
      setPendingDelete(null);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not delete this product.");
      setPendingDelete(null);
      listState.reload();
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const ordered = [...items];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);

    listState.setData((current) => (current ? { ...current, data: ordered } : { data: ordered }));
    setBusyId(moved._id);
    try {
      await api.admin.products.reorder(ordered.map((row) => row._id));
    } catch {
      listState.reload();
    } finally {
      setBusyId(null);
    }
  };

  const togglePublished = async (product: Product) => {
    const nextPublished = !product.isPublished;
    listState.setData((current) =>
      current
        ? {
            ...current,
            data: current.data.map((row) =>
              row._id === product._id ? { ...row, isPublished: nextPublished } : row,
            ),
          }
        : { data: [] },
    );
    setBusyId(product._id);
    try {
      await api.admin.products.update(product._id, { isPublished: nextPublished });
    } catch {
      listState.reload();
    } finally {
      setBusyId(null);
    }
  };

  const hasFilters = query.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Product management views" className="inline-flex rounded-full border border-line bg-surface p-1">
          {(
            [
              { id: "products", label: "Products" },
              { id: "templates", label: "Smart templates" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                tab === item.id ? "bg-primary text-primary-contrast shadow-[var(--shadow-subtle)]" : "text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "products" && (
          <Button size="sm" onClick={() => setEditing(null)} iconLeft={<PlusIcon size={14} />}>
            New product
          </Button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      )}

      {tab === "templates" ? (
        <TemplatesPanel
          templates={templates}
          loading={templatesState.loading}
          error={templatesState.error?.message ?? null}
          onRetry={templatesState.reload}
          onChanged={templatesState.reload}
        />
      ) : (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              className="field pl-10"
              placeholder="Search by name or category…"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              aria-label="Search products"
            />
          </div>

          {/* List */}
          {listState.loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <RowSkeleton key={index} />
              ))}
            </div>
          ) : listState.error ? (
            <EmptyState
              title="Products could not be loaded"
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
              title={hasFilters ? "No products match your search" : "No products yet"}
              description={
                hasFilters
                  ? "Try a different name or category."
                  : "Create your first product — the smart templates will suggest highlight points for it."
              }
              icon={<LayersIcon size={22} />}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={() => setDraftQuery("")}>
                    Clear search
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setEditing(null)} iconLeft={<PlusIcon size={14} />}>
                    New product
                  </Button>
                )
              }
            />
          ) : (
            <ul className="space-y-3">
              {items.map((product, index) => (
                <li key={product._id} className="card flex flex-wrap items-center gap-4 p-4">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface">
                    {product.logo ? (
                      <Image
                        src={product.logo}
                        alt={`${product.name} logo`}
                        width={48}
                        height={48}
                        sizes="48px"
                        className="size-full object-contain p-1"
                      />
                    ) : (
                      <span className="text-gradient text-sm font-semibold">{monogram(product.name)}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone="info">{product.category}</Badge>
                      <Badge tone="neutral">{product.highlightPoints.length} points</Badge>
                      <Badge tone={product.isPublished ? "success" : "warning"}>
                        {product.isPublished ? "Published" : "Draft"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {busyId === product._id && <Spinner label="Working" />}

                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Move ${product.name} earlier`}
                      disabled={index === 0 || busyId === product._id}
                      onClick={() => void move(index, -1)}
                    >
                      <ChevronRightIcon size={15} className="rotate-[-90deg]" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Move ${product.name} later`}
                      disabled={index === items.length - 1 || busyId === product._id}
                      onClick={() => void move(index, 1)}
                    >
                      <ChevronRightIcon size={15} className="rotate-90" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      role="switch"
                      aria-checked={product.isPublished}
                      aria-label={`${product.isPublished ? "Unpublish" : "Publish"} ${product.name}`}
                      title={product.isPublished ? "Unpublish" : "Publish"}
                      disabled={busyId === product._id}
                      onClick={() => void togglePublished(product)}
                    >
                      {product.isPublished ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Edit ${product.name}`}
                      onClick={() => setEditing(product)}
                    >
                      <EditIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon text-danger hover:text-danger"
                      aria-label={`Delete ${product.name}`}
                      disabled={busyId === product._id}
                      onClick={() => setPendingDelete(product)}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {meta && (
            <Pagination
              page={page}
              totalPages={meta.totalPages}
              total={meta.total}
              label="products"
              busy={listState.loading}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {editing !== undefined && (
        <ProductEditor
          key={editing?._id ?? "new"}
          product={editing ?? null}
          templates={templates}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this product?"
        message={`“${pendingDelete?.name ?? ""}” will be permanently removed from the catalogue and from the public site.`}
        confirmLabel="Delete product"
        busy={busyId === pendingDelete?._id}
        onConfirm={() => void removeProduct()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default ProductsManager;
