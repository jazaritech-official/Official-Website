import type { Product, ProductLogo } from "@/types/api";

/**
 * Tolerant accessors for a product's logo.
 *
 * The backend contract is `logo: { id, url, displayName, alt, tone, hasAlpha,
 * aspectRatio } | null`. Older cached/snapshotted payloads may still carry a
 * plain URL string in the same field, so every renderer goes through these
 * helpers instead of trusting the shape — a stale cache must never blank a card.
 */
export function productLogoUrl(logo: Product["logo"] | string | null | undefined): string | null {
  if (!logo) return null;
  if (typeof logo === "string") return logo.trim() || null;
  const url = (logo as ProductLogo).url;
  return typeof url === "string" && url.trim() ? url : null;
}

export function productLogoAlt(
  logo: Product["logo"] | string | null | undefined,
  name: string,
): string {
  if (logo && typeof logo !== "string") {
    const alt = (logo as ProductLogo).alt;
    if (typeof alt === "string" && alt.trim()) return alt;
  }
  return `${name} logo`;
}

/** True only for the new reference-object shape (used to pick the right glyph). */
export function isLogoReference(logo: Product["logo"] | string | null | undefined): logo is ProductLogo {
  return Boolean(logo && typeof logo === "object" && typeof (logo as ProductLogo).url === "string");
}
