import type { Service } from "@/types/api";

/**
 * Shared, purely-presentational helpers for service copy. The backend is the
 * single source of truth: nothing here invents text — it only chooses which
 * backend string to show, and shortens a long one at a word boundary.
 */

/** Grouping vocabulary the backend may use for a service's `category`. */
export const SERVICE_CATEGORIES = ["engineering", "growth", "design", "security", "operations"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  engineering: "Engineering",
  growth: "Growth",
  design: "Design",
  security: "Security",
  operations: "Operations",
};

/** Unknown/empty category → null (ungrouped). Never invent a category. */
export function serviceCategory(service: Service): ServiceCategory | null {
  const value = (service.category ?? "").trim().toLowerCase();
  return (SERVICE_CATEGORIES as readonly string[]).includes(value) ? (value as ServiceCategory) : null;
}

/** Unknown accent → blue (Growth Green is only ever a micro accent). */
export function serviceAccent(service: Service): "blue" | "navy" | "green-micro" {
  const value = (service.accent ?? "").trim().toLowerCase();
  return value === "navy" || value === "green-micro" ? value : "blue";
}

/**
 * Resting summary line. Uses the backend `shortDescription` when present;
 * otherwise the first clause/sentence of `description`, cut at a word boundary.
 * Never invents copy.
 */
export function restingLine(service: Service, maxLength = 92): string {
  const provided = (service.shortDescription ?? "").trim();
  if (provided) return provided;
  const firstSentence = service.description.split(/(?<=[.!?])\s/)[0] ?? service.description;
  const clause = firstSentence.split(/[,;:\u2014\u2013]/)[0] ?? firstSentence;
  const trimmed = clause.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > maxLength * 0.45 ? cut.slice(0, lastSpace) : cut}\u2026`;
}

/** Order services for display: `sortOrder`, then title, then id. Stable. */
export function sortServices(services: Service[]): Service[] {
  return [...services].sort((a, b) => {
    const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (order !== 0) return order;
    const title = a.title.localeCompare(b.title);
    if (title !== 0) return title;
    return a._id.localeCompare(b._id);
  });
}

/**
 * The services the hero's tooltips show, in a stable order. Prefers entries with
 * a `shortDescription` (they read better in a small card) while keeping the
 * backend's `sortOrder` — the frontend never invents or re-writes copy.
 */
export function heroServices(services: Service[], max = 10): Service[] {
  const sorted = sortServices(services);
  const withShort = sorted.filter((s) => (s.shortDescription ?? "").trim().length > 0);
  const withoutShort = sorted.filter((s) => (s.shortDescription ?? "").trim().length === 0);
  return [...withShort, ...withoutShort].slice(0, max);
}
