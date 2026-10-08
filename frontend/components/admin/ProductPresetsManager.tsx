"use client";

import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { TemplatesPanel } from "./TemplatesPanel";
import type { ProductTypeTemplate } from "@/types/api";

/**
 * Standalone Product Presets page body.
 *
 * Uses the same resilient loader contract as every other collection: one shared
 * request, designed loading/error/empty states, and the backend as the ONLY
 * source of templates. Nothing is hardcoded.
 */
export function ProductPresetsManager() {
  const state = useApiData<ProductTypeTemplate[]>(() => api.admin.templates.list(), "templates");

  return (
    <TemplatesPanel
      templates={state.data ?? []}
      loading={state.loading}
      error={state.error?.message ?? null}
      onRetry={state.reload}
      onChanged={state.reload}
    />
  );
}

export default ProductPresetsManager;
