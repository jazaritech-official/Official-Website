"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PlusIcon, TrashIcon, ChevronRightIcon, LightbulbIcon } from "@/components/icons";
import type { Product, ProductTypeTemplate } from "@/types/api";

interface ProductEditorProps {
  /** `null` creates a new product; an existing product edits it. */
  product: Product | null;
  templates: ProductTypeTemplate[];
  onClose: () => void;
  onSaved: (product: Product, mode: "create" | "update") => void;
}

const EMPTY_PRODUCT = {
  name: "",
  category: "",
  productUrl: "",
  highlightPoints: [] as string[],
  isPublished: true,
  sortOrder: 0,
  logo: "",
};

const URL_RE = /^https?:\/\/[^\s]+$/i;

type FormErrors = Partial<Record<"name" | "category" | "productUrl" | "highlightPoints", string>>;

/**
 * Create / edit product dialog.
 *
 * Choosing a category pulls the matching ProductTypeTemplate from the backend
 * and suggests highlight points — always as *suggestions* the admin can edit,
 * reorder, clear or ignore.
 */
export function ProductEditor({ product, templates, onClose, onSaved }: ProductEditorProps) {
  const isEditing = product !== null;

  const initialCategory = product?.category ?? "";
  const hasTemplate = (value: string) => templates.some((template) => template.type === value);

  const [name, setName] = useState(product?.name ?? "");
  const [useCustomCategory, setUseCustomCategory] = useState(
    Boolean(initialCategory) && !hasTemplate(initialCategory),
  );
  const [category, setCategory] = useState(
    hasTemplate(initialCategory) ? initialCategory : (templates[0]?.type ?? ""),
  );
  const [customCategory, setCustomCategory] = useState(
    hasTemplate(initialCategory) ? "" : initialCategory,
  );
  const [productUrl, setProductUrl] = useState(product?.productUrl ?? "");
  const [points, setPoints] = useState<string[]>(product?.highlightPoints ?? EMPTY_PRODUCT.highlightPoints);
  const [published, setPublished] = useState(product?.isPublished ?? true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const effectiveCategory = useCustomCategory ? customCategory.trim() : category;
  const activeTemplate = useMemo(
    () => templates.find((template) => template.type === effectiveCategory),
    [templates, effectiveCategory],
  );

  const applyTemplate = (type: string) => {
    const template = templates.find((entry) => entry.type === type);
    if (!template) return;
    setPoints([...template.highlightPoints]);
    setErrors((current) => ({ ...current, highlightPoints: undefined }));
  };

  const onCategoryChange = (value: string) => {
    if (value === "__custom") {
      setUseCustomCategory(true);
      return;
    }
    setUseCustomCategory(false);
    setCategory(value);

    // Suggest points when creating, or when none have been entered yet.
    const template = templates.find((entry) => entry.type === value);
    if (template && (!isEditing || points.filter((point) => point.trim()).length === 0)) {
      setPoints([...template.highlightPoints]);
    }
    setErrors((current) => ({ ...current, category: undefined }));
  };

  const updatePoint = (index: number, value: string) => {
    setPoints((current) => current.map((point, i) => (i === index ? value : point)));
    setErrors((current) => ({ ...current, highlightPoints: undefined }));
  };

  const movePoint = (index: number, direction: -1 | 1) => {
    setPoints((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const removePoint = (index: number) => {
    setPoints((current) => current.filter((_, i) => i !== index));
  };

  const addPoint = () => {
    setPoints((current) => (current.length >= 8 ? current : [...current, ""]));
  };

  const validate = (): boolean => {
    const found: FormErrors = {};
    if (name.trim().length < 2) found.name = "Product name is required (2+ characters).";
    if (effectiveCategory.length < 2) found.category = "Choose or enter a category.";
    if (productUrl.trim() && !URL_RE.test(productUrl.trim())) {
      found.productUrl = "Use a full URL, e.g. https://example.com";
    }
    const cleaned = points.map((point) => point.trim()).filter(Boolean);
    if (cleaned.length === 0 || cleaned.length > 8) {
      found.highlightPoints = "Add between 1 and 8 highlight points.";
    } else if (cleaned.some((point) => point.length < 2 || point.length > 170)) {
      found.highlightPoints = "Each point must be 2–170 characters.";
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSaveError(null);

    const payload = {
      name: name.trim(),
      category: effectiveCategory,
      productUrl: productUrl.trim(),
      highlightPoints: points.map((point) => point.trim()).filter(Boolean),
      isPublished: published,
      sortOrder: product?.sortOrder ?? 0,
      logo: product?.logo ?? "",
    };

    try {
      const saved = isEditing
        ? await api.admin.products.update(product._id, payload)
        : await api.admin.products.create(payload);
      onSaved(saved, isEditing ? "update" : "create");
    } catch (cause) {
      if (cause instanceof ApiError && cause.details) {
        const mapped: FormErrors = {};
        if (cause.details.name) mapped.name = cause.details.name;
        if (cause.details.category) mapped.category = cause.details.category;
        if (cause.details.productUrl) mapped.productUrl = cause.details.productUrl;
        if (cause.details.highlightPoints) mapped.highlightPoints = cause.details.highlightPoints;
        setErrors(mapped);
        if (Object.keys(mapped).length === 0) setSaveError(cause.message);
      } else {
        setSaveError(cause instanceof ApiError ? cause.message : "Could not save this product.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      label={isEditing ? "Edit product" : "New product"}
      size="lg"
      showClose={!saving}
      closeOnBackdrop={!saving}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="pr-8">
          <h2 className="text-lg font-semibold">{isEditing ? "Edit product" : "New product"}</h2>
          <p className="mt-1 text-sm text-muted">
            {isEditing
              ? "Update the presentation details shown on the public site."
              : "Category templates suggest highlight points — edit them freely before saving."}
          </p>
        </div>

        {saveError && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
            {saveError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="product-name" className="label">
              Product name
            </label>
            <input
              id="product-name"
              className="field"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors((current) => ({ ...current, name: undefined }));
              }}
              placeholder="Jazari Commerce Suite"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "product-name-error" : undefined}
              data-autofocus
            />
            {errors.name && (
              <p id="product-name-error" className="error-text">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="product-category" className="label">
              Type / category
            </label>
            <select
              id="product-category"
              className="field"
              value={useCustomCategory ? "__custom" : category}
              onChange={(event) => onCategoryChange(event.target.value)}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={errors.category ? "product-category-error" : undefined}
            >
              {templates.map((template) => (
                <option key={template._id} value={template.type}>
                  {template.type}
                </option>
              ))}
              <option value="__custom">Custom…</option>
            </select>
            {useCustomCategory && (
              <input
                className="field mt-2"
                value={customCategory}
                onChange={(event) => {
                  setCustomCategory(event.target.value);
                  setErrors((current) => ({ ...current, category: undefined }));
                }}
                placeholder="Enter a custom category"
                aria-label="Custom category"
              />
            )}
            {errors.category && (
              <p id="product-category-error" className="error-text">
                {errors.category}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="product-url" className="label">
              Product URL <span className="font-normal">(optional)</span>
            </label>
            <input
              id="product-url"
              className="field"
              type="url"
              inputMode="url"
              value={productUrl}
              onChange={(event) => {
                setProductUrl(event.target.value);
                setErrors((current) => ({ ...current, productUrl: undefined }));
              }}
              placeholder="https://example.com"
              aria-invalid={Boolean(errors.productUrl)}
              aria-describedby={errors.productUrl ? "product-url-error" : undefined}
            />
            {errors.productUrl && (
              <p id="product-url-error" className="error-text">
                {errors.productUrl}
              </p>
            )}
          </div>
        </div>

        {/* Highlight points */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label mb-0">Highlight points</span>
            <span className="text-xs text-muted">{points.filter((point) => point.trim()).length}/8</span>
          </div>

          {activeTemplate && (
            <button
              type="button"
              onClick={() => applyTemplate(activeTemplate.type)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-contrast"
            >
              <LightbulbIcon size={13} />
              Fill from “{activeTemplate.type}” template
            </button>
          )}

          <div className="mt-3 space-y-2">
            {points.map((point, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  className="field"
                  value={point}
                  onChange={(event) => updatePoint(index, event.target.value)}
                  placeholder="Secure checkout flow"
                  aria-label={`Highlight point ${index + 1}`}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Move point ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => movePoint(index, -1)}
                >
                  <ChevronRightIcon size={14} className="-rotate-90" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Move point ${index + 1} down`}
                  disabled={index === points.length - 1}
                  onClick={() => movePoint(index, 1)}
                >
                  <ChevronRightIcon size={14} className="rotate-90" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon text-danger hover:text-danger"
                  aria-label={`Remove point ${index + 1}`}
                  disabled={points.length <= 1}
                  onClick={() => removePoint(index)}
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            ))}
          </div>

          {errors.highlightPoints && <p className="error-text">{errors.highlightPoints}</p>}

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={addPoint}
            disabled={points.length >= 8}
            iconLeft={<PlusIcon size={14} />}
          >
            Add point
          </Button>
        </div>

        {/* Publish */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {published ? "Published" : "Draft"}
            </p>
            <p className="text-xs text-muted">
              {published ? "Visible in the public product showcase." : "Hidden from the public site."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={published}
            aria-label="Publish product"
            onClick={() => setPublished((value) => !value)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
              published ? "bg-accent" : "bg-surface-sunken"
            }`}
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${
                published ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="flex justify-end gap-3 border-t border-line pt-5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default ProductEditor;
