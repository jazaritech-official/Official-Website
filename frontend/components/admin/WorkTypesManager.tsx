"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatMinor, formatMinorCompact, minorToInput, parseMinor } from "@/lib/bill/money";
import { LayersIcon, PlusIcon, RefreshIcon, TrashIcon, EditIcon } from "@/components/icons";
import type { WorkType } from "@/types/api";

interface DraftType {
  _id?: string;
  name: string;
  priceInput: string;
  description: string;
  /** Only used for the live "3 × 500 = 1,500" example line. */
  exampleQty: number;
}

const EMPTY_DRAFT: DraftType = { name: "", priceInput: "0", description: "", exampleQty: 3 };

interface ListEnvelope {
  data: WorkType[];
}

/** One price-list row. 44px minimum targets so it is comfortable on a phone. */
function WorkTypeRow({
  workType,
  busy,
  onEdit,
  onToggle,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  workType: WorkType;
  busy: boolean;
  onEdit: (workType: WorkType) => void;
  onToggle: (workType: WorkType) => void;
  onDelete: (workType: WorkType) => void;
  onMove: (workType: WorkType, direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
      data-testid={`work-type-row-${workType.name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className="flex shrink-0 flex-col">
        <button
          type="button"
          className="btn btn-ghost btn-icon !h-6 !w-8 !min-h-0"
          aria-label={`Move ${workType.name} up`}
          disabled={busy || !canMoveUp}
          onClick={() => onMove(workType, -1)}
        >
          <span aria-hidden="true" className="-rotate-90">›</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon !h-6 !w-8 !min-h-0"
          aria-label={`Move ${workType.name} down`}
          disabled={busy || !canMoveDown}
          onClick={() => onMove(workType, 1)}
        >
          <span aria-hidden="true" className="rotate-90">›</span>
        </button>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{workType.name}</span>
        {workType.description && <span className="block truncate text-xs text-muted">{workType.description}</span>}
      </span>

      <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-foreground">
        {formatMinor(workType.unitPrice)}
      </span>

      <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums">
        {workType.orderCount ? `${workType.orderCount} order${workType.orderCount === 1 ? "" : "s"}` : "—"}
      </span>

      {workType.isActive === false && <Badge tone="neutral">Inactive</Badge>}

      <span className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={busy}
          onClick={() => onEdit(workType)}
          aria-label={`Edit ${workType.name}`}
          data-testid={`work-type-edit-${workType.name.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <EditIcon size={14} />
          <span className="ml-1">Edit</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={busy}
          onClick={() => onToggle(workType)}
          data-testid={`work-type-toggle-${workType.name.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {workType.isActive === false ? "Reactivate" : "Deactivate"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 text-danger"
          disabled={busy}
          onClick={() => onDelete(workType)}
          aria-label={`Delete ${workType.name}`}
        >
          <TrashIcon size={14} />
        </Button>
      </span>
    </li>
  );
}

/**
 * WORK TYPES — the owner's own price list ("30 Seconds Video = Rs 500").
 *
 * Everything the order form needs comes from here: the admin adds a type, sets
 * a price, and new orders can pick it. Orders snapshot name + price at creation,
 * so editing a price never rewrites a past order. Referenced types are
 * deactivated by the server rather than deleted.
 */
export function WorkTypesManager() {
  const [showInactive, setShowInactive] = useState(false);
  const [draft, setDraft] = useState<DraftType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<WorkType | null>(null);

  const listState = useApiData<ListEnvelope>(
    (signal) =>
      api.admin.finance.workTypes.list({ includeInactive: showInactive ? "true" : "", limit: 100 }, signal),
    `work-types:${showInactive}`,
  );

  const rows = useMemo(() => listState.data?.data ?? [], [listState.data]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Give the work type a name (1–60 characters).");
      return;
    }
    if (name.length > 60) {
      setError("Names can be at most 60 characters.");
      return;
    }
    const price = parseMinor(draft.priceInput);
    if (price === null || price < 0) {
      setError("Enter a price of zero or more.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (draft._id) {
        await api.admin.finance.workTypes.update(draft._id, {
          name,
          unitPrice: price,
          description: draft.description.trim(),
        });
      } else {
        await api.admin.finance.workTypes.create({
          name,
          unitPrice: price,
          description: draft.description.trim() || undefined,
        });
      }
      setDraft(null);
      setNotice(draft._id ? `Saved “${name}”.` : `Added “${name}” — it is now available in the order form.`);
      listState.reload();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.details && typeof cause.details.name === "string"
            ? cause.details.name
            : cause.message
          : "Could not save this work type.",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (workType: WorkType) => {
    setBusy(true);
    setError(null);
    try {
      await api.admin.finance.workTypes.setActive(workType._id, workType.isActive === false);
      setNotice(
        workType.isActive === false
          ? `“${workType.name}” is active again.`
          : `“${workType.name}” deactivated — existing orders are untouched.`,
      );
      listState.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update this work type.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.admin.finance.workTypes.remove(confirming._id);
      setNotice(
        result.message ??
          (result.deleted ? `Deleted “${confirming.name}”.` : `Deactivated “${confirming.name}”.`),
      );
      setConfirming(null);
      listState.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete this work type.");
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  };

  const move = async (workType: WorkType, direction: -1 | 1) => {
    const ids = rows.map((row) => row._id);
    const index = ids.indexOf(workType._id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    setError(null);
    try {
      await api.admin.finance.workTypes.reorder(next);
      listState.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not reorder the list.");
    } finally {
      setBusy(false);
    }
  };

  const examplePrice = draft ? parseMinor(draft.priceInput) ?? 0 : 0;
  const exampleQty = draft && Number.isFinite(draft.exampleQty) && draft.exampleQty >= 1 ? Math.trunc(draft.exampleQty) : 1;

  return (
    <div className="space-y-5" data-testid="work-types-manager">
      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger" data-testid="work-types-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            data-testid="work-types-show-inactive"
          />
          Show deactivated
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => listState.reload()}
            iconLeft={<RefreshIcon size={14} />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            className="min-h-11"
            iconLeft={<PlusIcon size={14} />}
            onClick={() => {
              setError(null);
              setNotice(null);
              setDraft({ ...EMPTY_DRAFT });
            }}
            data-testid="work-types-add"
          >
            Add work type
          </Button>
        </div>
      </div>

      {draft && (
        <form
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          data-testid="work-type-form"
        >
          <p className="text-sm font-semibold text-foreground">{draft._id ? "Edit work type" : "New work type"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="work-type-name">Work type name</label>
              <input
                id="work-type-name"
                data-autofocus
                className="field"
                value={draft.name}
                maxLength={60}
                placeholder="1 Minute Video"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
                data-testid="work-type-name"
              />
            </div>
            <div>
              <label className="label" htmlFor="work-type-price">Price (Rs)</label>
              <input
                id="work-type-price"
                className="field"
                inputMode="decimal"
                value={draft.priceInput}
                onChange={(event) => setDraft({ ...draft, priceInput: event.target.value })}
                required
                data-testid="work-type-price"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="work-type-description">Short description (optional)</label>
            <input
              id="work-type-description"
              className="field"
              maxLength={160}
              placeholder="Cut, captions, colour grade and delivery"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>

          {/* Live example: what this line will cost on an order right now. */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-elevated px-3 py-2.5 text-sm">
            <label htmlFor="work-type-example-qty" className="text-muted">Example</label>
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-outline btn-sm !min-h-11 !min-w-11"
                aria-label="Fewer"
                onClick={() => setDraft({ ...draft, exampleQty: Math.max(1, exampleQty - 1) })}
              >
                −
              </button>
              <input
                id="work-type-example-qty"
                className="field w-16 text-center"
                inputMode="numeric"
                value={String(exampleQty)}
                onChange={(event) =>
                  setDraft({ ...draft, exampleQty: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })
                }
                aria-label="Example quantity"
              />
              <button
                type="button"
                className="btn btn-outline btn-sm !min-h-11 !min-w-11"
                aria-label="More"
                onClick={() => setDraft({ ...draft, exampleQty: exampleQty + 1 })}
              >
                +
              </button>
            </span>
            <span className="font-medium tabular-nums text-foreground" data-testid="work-type-example" aria-live="polite">
              {exampleQty} × {formatMinorCompact(examplePrice)} = {formatMinorCompact(exampleQty * examplePrice)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="min-h-11" type="button" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button size="sm" className="min-h-11" type="submit" loading={busy} data-testid="work-type-save">
              {draft._id ? "Save changes" : "Add work type"}
            </Button>
          </div>
        </form>
      )}

      {listState.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded" />
          ))}
        </div>
      ) : listState.error ? (
        <EmptyState
          title="Work types could not be loaded"
          description={listState.error.message}
          icon={<LayersIcon size={22} />}
          action={
            <Button variant="outline" size="sm" onClick={listState.reload}>
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No work types yet"
          description="Add your first one — for example “30 Seconds Video” at Rs 500 — and it will appear in the order form straight away."
          icon={<LayersIcon size={22} />}
          action={
            <Button size="sm" className="min-h-11" iconLeft={<PlusIcon size={14} />} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              Add work type
            </Button>
          }
        />
      ) : (
        <div className="card relative overflow-x-auto" data-testid="work-types-list">
          <ul className="min-w-[360px] divide-y divide-line">
            {rows.map((workType, index) => (
              <WorkTypeRow
                key={workType._id}
                workType={workType}
                busy={busy}
                canMoveUp={index > 0}
                canMoveDown={index < rows.length - 1}
                onEdit={(target) => {
                  setError(null);
                  setNotice(null);
                  setDraft({
                    _id: target._id,
                    name: target.name,
                    priceInput: minorToInput(target.unitPrice),
                    description: target.description ?? "",
                    exampleQty: 3,
                  });
                }}
                onToggle={toggle}
                onDelete={setConfirming}
                onMove={move}
              />
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Prices apply to <strong>future</strong> orders only — every order keeps the name and price it was created with.
        A work type used by an order can be deactivated but never deleted.
      </p>

      <ConfirmDialog
        open={confirming !== null}
        title="Delete work type?"
        message={
          confirming
            ? confirming.orderCount
              ? `“${confirming.name}” is used by ${confirming.orderCount} order${confirming.orderCount === 1 ? "" : "s"}, so it will be deactivated instead — those orders keep their snapshots.`
              : `“${confirming.name}” is not used by any order, so it will be permanently removed.`
            : ""
        }
        confirmLabel={confirming?.orderCount ? "Deactivate" : "Delete"}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

export default WorkTypesManager;
