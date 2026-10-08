/**
 * Canonical PUBLIC content loader — the single resilient source for the three
 * public collections the site showcases (logos, products, services).
 *
 * THE CONTRACT (never bypassed):
 *   1. live API                       (authoritative)
 *   2. validated last-known-good cache (localStorage, same-origin only)
 *   3. validated build-time snapshot   (/content-snapshot.json)
 *   4. throw → the UI renders its designed error/empty state (with Retry)
 *
 * The frontend is NEVER the source of business truth: nothing here invents,
 * seeds or hardcodes a logo, product or service. Cached and snapshotted data
 * are always backend-originated, and every layer is schema-validated before it
 * is allowed to render.
 *
 * Only these three PUBLIC resources are ever cached. Admin, auth, submission
 * and visitor data are never written to localStorage.
 */
import { ApiError, request } from "@/lib/api";
import type { Product, PublicLogo, Service } from "@/types/api";

export type PublicResource = "logos" | "products" | "services";
export type ContentSource = "api" | "cache" | "snapshot";

export interface LoadedContent<T> {
  data: T;
  source: ContentSource;
}

/** localStorage key namespace. Bump the version when the shape changes. */
const CACHE_VERSION = 1;
const cacheKey = (resource: PublicResource) => `jazari:public-content:v${CACHE_VERSION}:${resource}`;

/** A stale cache is worse than none — bound how long a fallback may live. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days
/** Do not blow the localStorage quota on one collection. */
const MAX_ENTRY_BYTES = 512 * 1024;
/** Public GETs only: bounded wait + bounded retry (never an infinite spinner). */
const REQUEST_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [300, 900];

/** In-flight request dedupe so every consumer shares ONE public request. */
const inflight = new Map<PublicResource, Promise<LoadedContent<unknown>>>();
/** Short-lived in-memory memo so sections that mount at different times still
 * resolve from ONE request per resource (backend remains the source of truth). */
const MEMO_TTL_MS = 60_000;
const memo = new Map<PublicResource, { expires: number; data: unknown }>();

/* ------------------------------------------------------------------ schema */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Public logo as the backend projects it (safe URL + display fields). */
function isValidLogo(value: unknown): value is PublicLogo {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value._id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.secureUrl) &&
    typeof value.sortOrder === "number"
  );
}

function isValidProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value._id) &&
    isNonEmptyString(value.name) &&
    typeof value.category === "string" &&
    Array.isArray(value.highlightPoints)
  );
}

function isValidService(value: unknown): value is Service {
  if (!isRecord(value)) return false;
  if (
    !(
      isNonEmptyString(value._id) &&
      isNonEmptyString(value.title) &&
      isNonEmptyString(value.slug) &&
      typeof value.description === "string"
    )
  ) {
    return false;
  }
  // New OPTIONAL fields (Discipline Atlas) are accepted when absent (old cached
  // and snapshotted records stay valid). When present they must be strings —
  // the enum itself is enforced server-side, and the UI normalises an unknown
  // accent to `blue` rather than rejecting the whole collection (one bad label
  // must never blank the public site).
  if (value.category !== undefined && value.category !== null && typeof value.category !== "string") {
    return false;
  }
  if (value.accent !== undefined && value.accent !== null && typeof value.accent !== "string") {
    return false;
  }
  return true;
}

const VALIDATORS: Record<PublicResource, (value: unknown) => boolean> = {
  logos: isValidLogo,
  products: isValidProduct,
  services: isValidService,
};

/** True only when the payload is a list whose every item passes the schema. */
function validateList(resource: PublicResource, value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > 5000) return false; // paranoia cap
  return value.every((item) => VALIDATORS[resource](item));
}

/* -------------------------------------------------------------------- cache */

interface CacheEnvelope {
  v: number;
  savedAt: number;
  data: unknown;
}

/** Reads a validated, non-expired cache entry. Never throws. */
function readCache(resource: PublicResource): unknown | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(cacheKey(resource));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!isRecord(parsed) || parsed.v !== CACHE_VERSION) return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(cacheKey(resource));
      return null;
    }
    if (!validateList(resource, parsed.data)) {
      window.localStorage.removeItem(cacheKey(resource));
      return null;
    }
    return parsed.data;
  } catch {
    // Corrupted JSON (or storage disabled) is discarded, never rendered.
    try {
      window.localStorage.removeItem(cacheKey(resource));
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** Writes a validated, non-empty list. Never throws, never caches failures. */
function writeCache(resource: PublicResource, data: unknown): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (!validateList(resource, data)) return;
    if (Array.isArray(data) && data.length === 0) return; // never cache an empty list
    const envelope: CacheEnvelope = { v: CACHE_VERSION, savedAt: Date.now(), data };
    const serialized = JSON.stringify(envelope);
    if (serialized.length > MAX_ENTRY_BYTES) return; // too big to be worth a fallback
    window.localStorage.setItem(cacheKey(resource), serialized);
  } catch {
    /* quota / private mode / disabled storage — caching is best-effort */
  }
}

/* ----------------------------------------------------------------- snapshot */

const SNAPSHOT_PATH = "/content-snapshot.json";
let snapshotPromise: Promise<Record<string, unknown> | null> | null = null;

/**
 * Loads the build-time snapshot once per session. Any failure (missing file,
 * bad JSON, wrong shape) resolves to `null` so the caller falls through to the
 * designed empty/error state instead of the browser's broken-image path.
 */
function loadSnapshot(): Promise<Record<string, unknown> | null> {
  if (!snapshotPromise) {
    snapshotPromise = (async () => {
      try {
        const response = await fetch(SNAPSHOT_PATH, { cache: "force-cache" });
        if (!response.ok) return null;
        const parsed = (await response.json()) as unknown;
        if (!isRecord(parsed)) return null;
        return parsed;
      } catch {
        return null;
      }
    })();
  }
  return snapshotPromise;
}

/* ---------------------------------------------------------------- fetch live */

async function fetchLive<T>(resource: PublicResource, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const data = await request<T>(`/${resource}`, { signal: controller.signal });
      return data;
    } catch (cause) {
      // A caller-driven abort (unmount / key change) must NOT be retried.
      if (signal?.aborted) throw cause;
      lastError = cause;
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS[attempt] ?? 900));
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastError;
}

/* --------------------------------------------------------------------- load */

async function resolveContent<T>(
  resource: PublicResource,
  signal?: AbortSignal,
): Promise<LoadedContent<T>> {
  // 0 — fresh in-memory memo (avoids duplicate requests within a session)
  const hit = memo.get(resource);
  if (hit && hit.expires > Date.now()) return { data: hit.data as T, source: "api" };

  // 1 — live API
  try {
    const live = (await fetchLive<T>(resource, signal)) as unknown;
    if (validateList(resource, live)) {
      writeCache(resource, live);
      memo.set(resource, { expires: Date.now() + MEMO_TTL_MS, data: live });
      return { data: live as T, source: "api" };
    }
  } catch (cause) {
    if (signal?.aborted) throw cause;
    // fall through to the fallback layers
  }

  // 2 — validated last-known-good cache
  const cached = readCache(resource);
  if (cached !== null) return { data: cached as T, source: "cache" };

  // 3 — validated build-time snapshot
  const snapshot = await loadSnapshot();
  if (snapshot && validateList(resource, snapshot[resource])) {
    return { data: snapshot[resource] as T, source: "snapshot" };
  }

  // 4 — nothing usable → designed error state (with Retry)
  throw new ApiError("Unable to load this content right now.", { code: "CONTENT_UNAVAILABLE" });
}

/**
 * Loads one public collection through the full resilience hierarchy, sharing a
 * single in-flight request per resource so every consumer gets the same data.
 */
export function loadPublicContent<T>(
  resource: PublicResource,
  signal?: AbortSignal,
): Promise<LoadedContent<T>> {
  if (signal) {
    // A caller with its own abort signal bypasses the shared promise so it can
    // cancel independently.
    return resolveContent<T>(resource, signal);
  }
  const existing = inflight.get(resource);
  if (existing) return existing as Promise<LoadedContent<T>>;
  const promise = resolveContent<T>(resource).finally(() => {
    inflight.delete(resource);
  });
  inflight.set(resource, promise as Promise<LoadedContent<unknown>>);
  return promise;
}

/** Test/debug helper — clears the session's memoisation. */
export function __resetPublicContentMemo(): void {
  snapshotPromise = null;
  memo.clear();
  inflight.clear();
}
