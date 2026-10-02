"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { ChevronRightIcon, EditIcon, LightbulbIcon, PlusIcon, RefreshIcon, TrashIcon } from "@/components/icons";
import type { ProductTypeTemplate } from "@/types/api";

interface TemplatesPanelProps {
  templates: ProductTypeTemplate[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onChanged: () => void;
}

interface DraftState {
  id: string | null; // null = creating
  type: string;
  points: string[];
}

/**
 * Product-type smart defaults. Suggestions come from MongoDB, are editable
 * here, and are only ever *suggestions* in the product editor — the admin can
 * always change or ignore them.
 */
export function TemplatesPanel({ templates, loading, error, onRetry, onChanged }: TemplatesPanelProps) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductTypeTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const startCreate = () => {
    setFormError(null);
    setDraft({ id: null, type: "", points: [""] });
  };

  const startEdit = (template: ProductTypeTemplate) => {
    setFormError(null);
    setDraft({ id: template._id, type: template.type, points: [...template.highlightPoints] });
  };

  const updatePoint = (index: number, value: string) => {
    setDraft((current) =>
      current ? { ...current, points: current.points.map((point, i) => (i === index ? value : point)) } : current,
    );
  };

  const removePoint = (index: number) => {
    setDraft((current) =>
      current ? { ...current, points: current.points.filter((_, i) => i !== index) } : current,
    );
  };

  const addPoint = () => {
    setDraft((current) =>
      current && current.points.length < 8 ? { ...current, points: [...current.points, ""] } : current,
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;

    const type = draft.type.trim();
    const points = draft.points.map((point) => point.trim()).filter((point) => point.length >= 2);

    if (type.length < 2) {
      setFormError("Give the template a type name (2+ characters).");
      return;
    }
    if (points.length === 0 || points.length > 8) {
      setFormError("Provide between 1 and 8 suggested highlight points.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (draft.id) {
        await api.admin.templates.update(draft.id, { type, highlightPoints: points });
      } else {
        await api.admin.templates.create({ type, highlightPoints: points });
      }
      setDraft(null);
      onChanged();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "Could not save this template.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setDeleting(true);
    try {
      await api.admin.templates.remove(target._id);
      setPendingDelete(null);
      onChanged();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "Could not delete this template.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">Product type smart defaults</h2>
          <p className="mt-1 text-sm text-muted">
            When an admin picks a category while creating a product, these suggestions pre-fill the
            highlight points. Edit them here — they are never forced on the final product.
          </p>
        </div>
        <Button size="sm" onClick={startCreate} iconLeft={<PlusIcon size={14} />}>
          New template
        </Button>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      )}

      {/* Inline editor */}
      {draft && (
        <form onSubmit={submit} noValidate className="card space-y-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">{draft.id ? "Edit template" : "New template"}</h3>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
          </div>

          <div>
            <label htmlFor="template-type" className="label">
              Product type
            </label>
            <input
              id="template-type"
              className="field"
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value })}
              placeholder="E-commerce"
              disabled={saving}
              data-autofocus
            />
          </div>

          <div>
            <span className="label">Suggested highlight points ({draft.points.length}/8)</span>
            <div className="space-y-2">
              {draft.points.map((point, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    className="field"
                    value={point}
                    onChange={(event) => updatePoint(index, event.target.value)}
                    placeholder="Secure checkout flow"
                    aria-label={`Suggested point ${index + 1}`}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon text-danger hover:text-danger"
                    aria-label={`Remove suggestion ${index + 1}`}
                    disabled={saving || draft.points.length <= 1}
                    onClick={() => removePoint(index)}
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={addPoint}
              disabled={saving || draft.points.length >= 8}
              iconLeft={<PlusIcon size={14} />}
            >
              Add suggestion
            </Button>
          </div>

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button type="submit" size="sm" loading={saving}>
              {saving ? "Saving…" : draft.id ? "Save changes" : "Create template"}
            </Button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="Templates could not be loaded"
          description={error}
          icon={<RefreshIcon size={22} />}
          action={
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a product type template so new products start with sensible highlight points."
          icon={<LightbulbIcon size={22} />}
          action={
            <Button size="sm" onClick={startCreate} iconLeft={<PlusIcon size={14} />}>
              New template
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => (
            <li key={template._id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{template.type}</h3>
                  <Badge tone="neutral" className="mt-1.5">
                    {template.highlightPoints.length} suggestions
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`Edit ${template.type} template`}
                    onClick={() => startEdit(template)}
                  >
                    <EditIcon size={15} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon text-danger hover:text-danger"
                    aria-label={`Delete ${template.type} template`}
                    onClick={() => setPendingDelete(template)}
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>

              <ul className="flex flex-wrap gap-1.5">
                {template.highlightPoints.slice(0, 4).map((point) => (
                  <li
                    key={point}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[0.7rem] text-muted"
                  >
                    <ChevronRightIcon size={10} />
                    {point}
                  </li>
                ))}
                {template.highlightPoints.length > 4 && (
                  <li className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-1 text-[0.7rem] font-semibold text-accent">
                    +{template.highlightPoints.length - 4} more
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this template?"
        message={`Existing products keep their points, but new products of type “${pendingDelete?.type ?? ""}” will no longer get suggestions.`}
        confirmLabel="Delete template"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default TemplatesPanel;
