"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Spinner";
import { formatMinor, minorToInput, parseMinor } from "@/lib/bill/money";
import { PlusIcon } from "@/components/icons";
import type { CatalogItem } from "@/types/api";

interface DraftItem {
  _id?: string;
  name: string;
  unitLabel: string;
  priceInput: string;
  isActive: boolean;
}

const EMPTY_DRAFT: DraftItem = { name: "", unitLabel: "item", priceInput: "0", isActive: true };

/**
 * "Manage defaults" — the catalogue the order editor picks its line items from.
 * Prices default to zero, so the admin always types the real number for a job.
 */
export function CatalogManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const catalogState = useApiData<CatalogItem[]>((signal) => api.admin.finance.catalog.list(signal), "catalog-manage");
  const [draft, setDraft] = useState<DraftItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) catalogState.reload();
    // Only react to the dialog opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const items = catalogState.data ?? [];

  const save = async () => {
    if (!draft) return;
    const price = parseMinor(draft.priceInput);
    if (price === null || price < 0) {
      setError("Enter a price of zero or more.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (draft._id) {
        await api.admin.finance.catalog.update(draft._id, {
          name: draft.name,
          unitLabel: draft.unitLabel,
          defaultUnitPriceMinor: price,
          isActive: draft.isActive,
        });
      } else {
        await api.admin.finance.catalog.create({
          name: draft.name,
          unitLabel: draft.unitLabel,
          defaultUnitPriceMinor: price,
        });
      }
      setDraft(null);
      catalogState.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save this item.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (item: CatalogItem) => {
    setBusy(true);
    try {
      await api.admin.finance.catalog.update(item._id, { isActive: !item.isActive });
      catalogState.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update this item.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} label="Manage catalogue" size="lg">
      <div className="space-y-4" data-catalog-manager>
        <div>
          <h2 className="pr-8 text-lg font-semibold text-foreground">Catalogue items</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The list the order editor offers. A zero price means “type the real price for this job”.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        {catalogState.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {items.map((item) => (
              <li key={item._id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.name}</span>
                <span className="text-xs text-muted">per {item.unitLabel}</span>
                <span className="w-28 text-right tabular-nums">
                  {item.defaultUnitPriceMinor > 0 ? formatMinor(item.defaultUnitPriceMinor) : <span className="text-muted-soft">Ask</span>}
                </span>
                {item.isActive === false && <Badge tone="neutral">Hidden</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      _id: item._id,
                      name: item.name,
                      unitLabel: item.unitLabel,
                      priceInput: minorToInput(item.defaultUnitPriceMinor),
                      isActive: item.isActive,
                    })
                  }
                >
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void toggleActive(item)} disabled={busy}>
                  {item.isActive === false ? "Show" : "Hide"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {draft && (
          <form
            className="space-y-3 rounded-xl border border-line bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <p className="text-sm font-semibold text-foreground">{draft._id ? "Edit item" : "Add item"}</p>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <div>
                <label className="label" htmlFor="catalog-name">Name</label>
                <input
                  id="catalog-name"
                  data-autofocus
                  className="field"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="catalog-unit">Unit</label>
                <input
                  id="catalog-unit"
                  className="field"
                  value={draft.unitLabel}
                  onChange={(event) => setDraft({ ...draft, unitLabel: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="catalog-price">Default price (Rs)</label>
                <input
                  id="catalog-price"
                  className="field"
                  inputMode="decimal"
                  value={draft.priceInput}
                  onChange={(event) => setDraft({ ...draft, priceInput: event.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" loading={busy}>
                Save item
              </Button>
            </div>
          </form>
        )}

        {!draft && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setDraft({ ...EMPTY_DRAFT })} iconLeft={<PlusIcon size={14} />}>
              Add item
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default CatalogManager;
