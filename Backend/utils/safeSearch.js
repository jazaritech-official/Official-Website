/**
 * Shared text-search helpers for the finance lists.
 *
 * Any user string that becomes a Mongo `$regex` MUST pass through here: raw
 * input such as `(`, `*` or `[a-` would otherwise throw (ReDoS / invalid
 * pattern) inside the database. Search terms are also length-capped so a
 * pathological pattern can never be long enough to be slow.
 */
export const MAX_SEARCH_LENGTH = 80;

export function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a safe case-insensitive partial-match filter, or `null` when the term
 * is empty/too long (the caller then skips the filter entirely).
 */
export function searchPattern(value) {
  const term = String(value ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
  if (!term) return null;
  return { $regex: escapeRegex(term), $options: "i" };
}

export default searchPattern;
