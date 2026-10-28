/**
 * MONEY — the single integer money module shared by the admin UI and the bill.
 *
 * Every amount in the finance system is an INTEGER number of paisa (minor
 * units). Rupees only ever exist as a DISPLAY concern: `formatMinor` renders
 * them, `parseMinor` converts them back, and both are loss-free because the
 * conversion is decimal string maths — no float ever touches a value.
 *
 * This file is pure TypeScript with no React and no DOM, so the same code runs
 * in the browser, in a Next.js server component and in `node --experimental-
 * strip-types` for the `verify:bill` harness.
 */

export const MINOR_PER_MAJOR = 100;

/** How the app refers to the currency in prose ("Rs" in the UI, "PKR" in data). */
export const CURRENCY_LABEL = "Rs";

export type Major = { whole: string; fraction: string };

/** Split minor units into integer display parts (never a float). */
export function minorToParts(minor: number): Major {
  const safe = Number.isFinite(minor) ? Math.trunc(minor) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.trunc(abs / MINOR_PER_MAJOR);
  const fraction = abs % MINOR_PER_MAJOR;
  return {
    whole: `${negative ? "-" : ""}${whole.toLocaleString("en-US")}`,
    fraction: String(fraction).padStart(2, "0"),
  };
}

/**
 * Format integer paisa as an en-PK grouped rupee string.
 * `formatMinor(12345678)` → "Rs 123,456.78"; `formatMinor(0)` → "Rs 0.00".
 */
export function formatMinor(minor: number, label: string = CURRENCY_LABEL): string {
  const parts = minorToParts(minor);
  return `${label} ${parts.whole}.${parts.fraction}`;
}

/** Compact form for tight columns: paisa are dropped when they are zero. */
export function formatMinorCompact(minor: number, label: string = CURRENCY_LABEL): string {
  const parts = minorToParts(minor);
  return parts.fraction === "00" ? `${label} ${parts.whole}` : `${label} ${parts.whole}.${parts.fraction}`;
}

/**
 * Parse a rupee amount typed by a human into integer paisa.
 *
 * Accepts "12", "12.5", "1,234.56" and "Rs 1,234.56". Rejects (returns null):
 * empty/garbage ("abc"), negatives ("-5"), and more than two decimals
 * ("1.234") — a third decimal cannot be represented in paisa, so guessing
 * would silently invent money.
 */
export function parseMinor(input: string): number | null {
  if (typeof input !== "string") return null;  const cleaned = input
    .replace(/[\s,\u00a0]/g, "")
    .replace(/^(rs|pkr|pkrs)\.?/i, "");
  if (!cleaned) return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const match = /^(-?)(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  if (!whole && !fraction) return null;
  if (sign === "-") return null;
  const wholeUnits = whole ? Number.parseInt(whole, 10) : 0;
  const padded = `${fraction}00`.slice(0, 2);
  const minorUnits = Number.parseInt(padded || "0", 10);
  if (!Number.isFinite(wholeUnits) || !Number.isFinite(minorUnits)) return null;
  const value = wholeUnits * MINOR_PER_MAJOR + minorUnits;
  return Number.isSafeInteger(value) ? value : null;
}

/** Same as `parseMinor` but throws-style: returns a safe default for display. */
export function parseMinorOr(input: string, fallback = 0): number {
  const value = parseMinor(input);
  return value === null ? fallback : value;
}

/** Turn integer paisa back into the string an editable field should show. */
export function minorToInput(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.trunc(abs / MINOR_PER_MAJOR);
  const fraction = abs % MINOR_PER_MAJOR;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}
