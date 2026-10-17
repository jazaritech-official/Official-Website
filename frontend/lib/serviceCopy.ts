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
 * Resting summary line — ONE helper shared by the hero, the services index and
 * the Hub, so the same service never reads differently in two places.
 *
 * Order of preference:
 *   1. the backend's own `shortDescription` (the designed line) verbatim;
 *   2. a whole first sentence that already fits;
 *   3. a clause/sentence boundary at 40+ characters (never a mid-phrase chop);
 *   4. a whole-word cut that always leaves at least two words.
 *
 * It never invents copy, never repeats the service title, and never returns a
 * single dangling word (the old helper could produce "Fast" / "Strategy" from a
 * description whose first clause was one word long).
 */
export const RESTING_MIN_CLAUSE = 40;

export function restingLine(service: Service, maxLength = 92): string {
  const provided = (service.shortDescription ?? "").trim();
  if (provided) return provided;

  const text = (service.description ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const firstSentence = (text.split(/(?<=[.!?])\s/)[0] ?? text).trim();
  if (firstSentence.length <= maxLength) return firstSentence;

  const windowText = text.slice(0, maxLength);
  const boundaries = [". ", "! ", "? ", ", ", "; ", ": ", " \u2014 ", " \u2013 "];
  let clauseEnd = -1;
  for (const boundary of boundaries) {
    const at = windowText.lastIndexOf(boundary);
    if (at > clauseEnd) clauseEnd = at;
  }
  if (clauseEnd >= RESTING_MIN_CLAUSE) {
    return `${windowText.slice(0, clauseEnd).replace(/[\s,;:\u2014\u2013]+$/, "")}\u2026`;
  }

  const space = windowText.lastIndexOf(" ");
  let cut = space > RESTING_MIN_CLAUSE ? windowText.slice(0, space) : windowText;
  cut = cut.replace(/[\s,;:\u2014\u2013]+$/, "");
  if (cut.split(/\s+/).filter(Boolean).length < 2) {
    // A whole-word cut that left a single dangling word: take the next word
    // boundary, or fall back to the whole first sentence.
    const nextSpace = text.indexOf(" ", cut.length + 1);
    cut = nextSpace > -1 && nextSpace <= maxLength * 2 ? text.slice(0, nextSpace) : firstSentence;
  }
  return `${cut}\u2026`;
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
