"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { bpToInput, bpToPercent, percentToBp, splitShareError, type OwnerShare } from "@/lib/finance";
import { TrashIcon } from "@/components/icons";
import type { FinanceSettings, Payee } from "@/types/api";

/**
 * SPLIT TEMPLATE — the ONE place the whole order amount is divided between the
 * company's owners, editable by a super admin only (the Treasury page is
 * already gated exactly like the settings API).
 *
 * The rule is blunt and enforced on BOTH sides: the shares — the optional
 * company reserve included — must total EXACTLY 100% (10000 basis points).
 * The error is shown field-level before the request is even sent, and the
 * server answers with the same sentence if it disagrees.
 *
 * Nothing here touches history: orders snapshot their split when they are
 * confirmed, so editing the template only affects NEW orders (existing ones
 * are changed through the explicit "Recalculate split" action on the order).
 */

interface RowState extends OwnerShare {
  /** Local key so React keeps identity while the owner is changed. */
  key: string;
}

function rowsFromSettings(settings: FinanceSettings | null): RowState[] {
  const entries = settings?.splitTemplate?.entries ?? [];
  return entries.map((entry, index) => ({
    key: `template-${index}-${entry.ownerId ?? "x"}`,
    ownerId: entry.ownerId ?? null,
    name: entry.name,
    role: entry.role ?? "",
    bp: entry.bp,
    isReserve: false,
  }));
}

interface Draft {
  rows: RowState[];
  reserveBp: number;
  roundTo100: boolean;
}

export interface SplitTemplatePanelProps {
  settings: FinanceSettings | null;
  /** Called after a successful save so the parent can reload its state. */
  onSaved: () => void;
}

export function SplitTemplatePanel({ settings, onSaved }: SplitTemplatePanelProps) {
  const payeesState = useApiData<Payee[]>(
    (signal) => api.admin.finance.payees.list({ active: "true", limit: 100 }, signal).then((envelope) => envelope.data),
    "split-template-payees",
  );

  /* The saved template is the source of truth; `draft` holds the super admin's
     in-progress edits and is thrown away on save (the parent then reloads the
     fresh server state). No effect writes state — the draft is derived during
     render, which keeps the rules-of-hooks lint clean. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const templateRows = rowsFromSettings(settings);
  const rows = draft?.rows ?? templateRows;
  const reserveBp = draft?.reserveBp ?? settings?.splitTemplate?.companyReserveBp ?? 0;
  const roundTo100 = draft?.roundTo100 ?? settings?.splitTemplate?.roundTo100 === true;
  const dirty = draft !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const startDraft = (changes: Partial<Draft>): Draft => {
    const base: Draft = draft ?? { rows: templateRows, reserveBp: settings?.splitTemplate?.companyReserveBp ?? 0, roundTo100: settings?.splitTemplate?.roundTo100 === true };
    return { ...base, ...changes };
  };

  const payees = payeesState.data ?? [];
  const usedIds = new Set(rows.map((row) => row.ownerId ?? ""));
  const available = payees.filter((payee) => !usedIds.has(payee._id));
  const totalBp = rows.reduce((sum, row) => sum + row.bp, 0) + reserveBp;
  const message = splitShareError(rows, reserveBp);
  const invalid = message !== null;

  const patch = (key: string, changes: Partial<RowState>) => {
    setError(null);
    const next = rows.map((row) => (row.key === key ? { ...row, ...changes } : row));
    setDraft(startDraft({ rows: next }));
  };

  const addOwner = (payeeId: string) => {
    const payee = payees.find((entry) => entry._id === payeeId);
    if (!payee) return;
    setError(null);
    const next: RowState[] = [
      ...rows,
      { key: `row-${payee._id}-${rows.length}`, ownerId: payee._id, name: payee.name, role: payee.role ?? "", bp: 0, isReserve: false },
    ];
    setDraft(startDraft({ rows: next }));
  };

  const removeOwner = (key: string) => {
    setError(null);
    setDraft(startDraft({ rows: rows.filter((row) => row.key !== key) }));
  };

  const save = async () => {
    if (invalid) {
      setError(message);
      return;
    }
    if (rows.length === 0) {
      setError("Add at least one owner to the split.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.admin.finance.settings.update({
        splitTemplate: {
          entries: rows.map((row) => ({
            ownerId: row.ownerId ?? "",
            name: row.name,
            role: row.role ?? "",
            bp: row.bp,
          })),
          companyReserveBp: reserveBp,
          roundTo100,
        },
      });
      setDraft(null);
      setNotice("Split template saved — new orders will use it. Existing orders keep the split they were confirmed with.");
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError) {
        const details = cause.details as Record<string, string> | undefined;
        setError(details?.splitTemplate ?? cause.message);
      } else {
        setError("Could not save the split template.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5" data-testid="split-template">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Split Template</h2>
          <p className="mt-1 text-sm text-muted">
            How the WHOLE amount of every new order is divided between the owners. The shares must total exactly
            100% — the company reserve is part of that 100%. Orders you have already confirmed keep their own
            snapshot until you recalculate them individually.
          </p>
        </div>
        <Badge tone={invalid ? "danger" : rows.length === 0 ? "neutral" : "success"}>
          {rows.length === 0 ? "Not configured" : `Shares total ${bpToPercent(totalBp)}`}
        </Badge>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger"
          data-testid="split-template-error"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          {notice}
        </p>
      )}

      <div className="mt-4 space-y-3" data-testid="split-template-rows">
        {rows.length === 0 && (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            No owners yet — add the people below and give each of them a share.
          </p>
        )}

        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
            <div className="min-w-0 flex-1 basis-48">
              <span className="label">Owner</span>
              <p className="truncate text-sm font-medium text-foreground" data-testid="split-owner-name">
                {row.name}
                {row.role ? <span className="text-muted"> · {row.role}</span> : null}
              </p>
            </div>
            <div className="w-44">
              <label className="label" htmlFor={`split-role-${row.key}`}>Role label</label>
              <input
                id={`split-role-${row.key}`}
                className="field"
                maxLength={60}
                placeholder="client &amp; work owner"
                value={row.role ?? ""}
                onChange={(event) => patch(row.key, { role: event.target.value })}
              />
            </div>
            <div className="w-28">
              <label className="label" htmlFor={`split-bp-${row.key}`}>Share %</label>
              <input
                id={`split-bp-${row.key}`}
                data-testid="split-bp-input"
                className="field text-right tabular-nums"
                inputMode="decimal"
                value={bpToInput(row.bp)}
                onChange={(event) => patch(row.key, { bp: percentToBp(event.target.value) ?? 0 })}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="!min-h-11"
              aria-label={`Remove ${row.name} from the split`}
              onClick={() => removeOwner(row.key)}
              disabled={busy}
              iconLeft={<TrashIcon size={14} />}
            />
          </div>
        ))}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line p-3">
          <div className="w-64">
            <label className="label" htmlFor="split-add-owner">Add an owner</label>
            <select
              id="split-add-owner"
              className="field"
              value=""
              data-testid="split-add-owner"
              onChange={(event) => addOwner(event.target.value)}
              disabled={available.length === 0}
            >
              <option value="">
                {available.length === 0 ? "Everyone is already in the split" : "Choose a person…"}
              </option>
              {available.map((payee) => (
                <option key={payee._id} value={payee._id}>
                  {payee.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-44">
            <label className="label" htmlFor="split-reserve">Company reserve %</label>
            <input
              id="split-reserve"
              data-testid="split-reserve"
              className="field text-right tabular-nums"
              inputMode="decimal"
              value={bpToInput(reserveBp)}
              onChange={(event) => {
                setError(null);
                setDraft(startDraft({ reserveBp: percentToBp(event.target.value) ?? 0 }));
              }}
            />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={roundTo100}
              data-testid="split-round-100"
              onChange={(event) => {
                setDraft(startDraft({ roundTo100: event.target.checked }));
              }}
            />
            Round shares to the nearest Rs 100
          </label>
        </div>

        <p className="text-xs text-muted">
          The rounding rule: each share is floored to whole rupees, then the few rupees left over are handed out one
          at a time to the largest fractions. The parts always add back up to the order total exactly.
          {reserveBp > 0 ? " The company reserve sits inside the same 100%." : ""}
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          onClick={() => void save()}
          loading={busy}
          disabled={invalid || rows.length === 0 || !dirty}
          data-testid="split-template-save"
        >
          Save split template
        </Button>
      </div>
    </section>
  );
}

export default SplitTemplatePanel;
