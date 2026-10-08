"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ProductCard } from "@/components/products/ProductCards";
import { productLogoUrl } from "@/lib/productLogo";
import {
  PlusIcon,
  TrashIcon,
  ChevronRightIcon,
  LightbulbIcon,
  SearchIcon,
  PaletteIcon,
  CheckIcon,
} from "@/components/icons";
import type { AdminLogo, AdminLogosResponse, Product, ProductLogo, ProductTypeTemplate } from "@/types/api";

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
  logoId: null as string | null,
};

const URL_RE = /^https?:\/\/[^\s]+$/i;

type FormErrors = Partial<Record<"name" | "category" | "productUrl" | "highlightPoints" | "logoId", string>>;

/** Build the safe logo projection the public card renders from a chosen logo. */
function toLogoRef(logo: AdminLogo | undefined, name: string): ProductLogo | null {
  if (!logo) return null;
  return {
    id: logo._id,
    url: logo.secureUrl,
    displayName: logo.displayName || logo.name,
    alt: logo.alt || name,
    tone: logo.tone ?? null,
    hasAlpha: logo.hasAlpha ?? null,
    aspectRatio: logo.aspectRatio ?? null,
  };
}

/**
 * Create / edit product dialog.
 *
 * Choosing a category pulls the matching ProductTypeTemplate from the backend
 * and suggests highlight points. Choosing a logo references an existing
 * Homepage Logo (never copies it); “None” falls back to the monogram.
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
  const [logoId, setLogoId] = useState<string | null>(product?.logoId ?? null);
  const [logoQuery, setLogoQuery] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const logosState = useApiData<AdminLogosResponse>(() => api.admin.logos.list(), "admin-logos");
  const logos = useMemo(() => logosState.data?.logos ?? [], [logosState.data]);
  const selectedLogo = useMemo(() => logos.find((logo) => logo._id === logoId), [logos, logoId]);
  const visibleLogos = useMemo(() => {
    const needle = logoQuery.trim().toLowerCase();
    if (!needle) return logos;
    return logos.filter((logo) =>
      `${logo.name} ${logo.displayName ?? ""}`.toLowerCase().includes(needle),
    );
  }, [logos, logoQuery]);

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
      logoId,
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
        if (cause.details.logoId) mapped.logoId = cause.details.logoId;
        setErrors(mapped);
        if (Object.keys(mapped).length === 0) setSaveError(cause.message);
      } else {
        setSaveError(cause instanceof ApiError ? cause.message : "Could not save this product.");
      }
    } finally {
      setSaving(false);
    }
  };

  const previewProduct: Product = {
    _id: product?._id ?? "preview",
    name: name.trim() || "Product name",
    logo: toLogoRef(selectedLogo, name.trim() || "Product"),
    logoId,
    productUrl: productUrl.trim(),
    category: effectiveCategory || "Category",
    highlightPoints: points.map((point) => point.trim()).filter(Boolean),
    isPublished: published,
    sortOrder: product?.sortOrder ?? 0,
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
              : "Pick a logo, choose a type for suggested highlights, then save."}
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

        {/* Logo picker — references an existing Homepage Logo (never copies it). */}
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">Logo</legend>
          <p className="mb-3 text-xs text-muted">
            Pick a logo from your Homepage Logos. It is referenced, not copied — updating the logo
            updates every product that uses it. Choose “None” to show a monogram instead.
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                className="field pl-9"
                placeholder="Search logos by name…"
                value={logoQuery}
                onChange={(event) => setLogoQuery(event.target.value)}
                aria-label="Search logos"
                disabled={saving}
              />
            </div>
            <Link
              href="/admin/logos"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover"
            >
              <PaletteIcon size={14} />
              Add a new logo
            </Link>
          </div>

          {errors.logoId && <p className="error-text mb-2">{errors.logoId}</p>}

          <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4" role="radiogroup" aria-label="Product logo">
            <button
              type="button"
              role="radio"
              aria-checked={logoId === null}
              data-logo-choice="none"
              onClick={() => {
                setLogoId(null);
                setErrors((current) => ({ ...current, logoId: undefined }));
              }}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors ${
                logoId === null ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50"
              }`}
            >
              <span className="flex size-12 items-center justify-center rounded-lg border border-line bg-surface text-xs font-semibold text-muted">
                Aa
              </span>
              <span className="flex items-center gap-1 text-[0.66rem] font-semibold">
                {logoId === null && <CheckIcon size={11} className="text-accent" />}
                None · monogram
              </span>
            </button>

            {logosState.loading && <div className="col-span-3 flex items-center justify-center py-6 sm:col-span-4"><Spinner label="Loading logos" /></div>}

            {!logosState.loading &&
              visibleLogos.map((logo) => {
                const selected = logo._id === logoId;
                const url = productLogoUrl({ id: logo._id, url: logo.secureUrl, displayName: logo.name, alt: logo.alt, tone: logo.tone, hasAlpha: logo.hasAlpha ?? null, aspectRatio: logo.aspectRatio ?? null });
                return (
                  <button
                    key={logo._id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-logo-choice={logo._id}
                    onClick={() => {
                      setLogoId(logo._id);
                      setErrors((current) => ({ ...current, logoId: undefined }));
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors ${
                      selected ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50"
                    }`}
                  >
                    <span className="logo-checker flex size-12 items-center justify-center overflow-hidden rounded-lg border border-line">
                      {url ? (
                        <Image src={url} alt={logo.displayName || logo.name} width={48} height={48} sizes="48px" className="size-full object-contain p-1" />
                      ) : (
                        <span className="text-[0.62rem] text-muted">no image</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-[0.66rem] font-semibold">
                      {selected && <CheckIcon size={11} className="text-accent" />}
                      <span className="max-w-[6rem] truncate">{logo.displayName || logo.name}</span>
                    </span>
                  </button>
                );
              })}
          </div>

          {!logosState.loading && logos.length === 0 && (
            <p className="text-xs text-muted">
              No Homepage Logos yet — products will use the monogram.{" "}
              <Link href="/admin/logos" className="font-medium text-accent hover:text-accent-hover">
                Upload one
              </Link>
              .
            </p>
          )}
        </fieldset>

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
            <p className="text-sm font-semibold text-foreground">{published ? "Published" : "Draft"}</p>
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

        {/* Live preview of the real public card */}
        <div>
          <p className="label mb-0">Live preview</p>
          <p className="mb-2 text-xs text-muted">Exactly how this product will appear on the homepage.</p>
          <div className="pointer-events-none origin-top scale-[0.92] sm:scale-100" aria-hidden="true">
            <div className="max-w-sm">
              <ProductCard product={previewProduct} />
            </div>
          </div>
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
