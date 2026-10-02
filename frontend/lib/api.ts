/**
 * THE single API client for the whole frontend.
 *
 * Every fetch() in the app goes through here: base URL from
 * NEXT_PUBLIC_API_URL, shared credentials (httpOnly JWT cookie), the
 * { success, data } / { success, error } contract, typed errors and a single
 * place where failures become user-facing messages.
 */
import type {
  AdminLogo,
  AdminLogosResponse,
  AdminSession,
  ApiEnvelope,
  DashboardStats,
  HealthData,
  LogoInput,
  PaginationMeta,
  Product,
  ProductTypeTemplate,
  PublicLogo,
  Service,
  Submission,
  SubmissionInput,
  SubmissionResult,
  SubmissionStatus,
  Visitor,
  VisitorTrackInput,
  VisitorTrackResult,
} from "@/types/api";

const RAW_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string>;

  constructor(message: string, options: { status?: number; code?: string; details?: Record<string, string> } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "REQUEST_FAILED";
    this.details = options.details;
  }

  /** Field-level messages returned by backend validation, if any. */
  field(name: string): string | undefined {
    return this.details?.[name];
  }
}

function messageForStatus(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have access to this resource.";
  if (status === 404) return "The requested resource was not found.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our end. Please try again.";
  return "The request could not be completed.";
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  if (!RAW_BASE) {
    throw new ApiError("The API location is not configured (NEXT_PUBLIC_API_URL).", {
      code: "CONFIG_MISSING",
    });
  }

  const url = new URL(`${RAW_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

async function requestEnvelope<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: PaginationMeta }> {
  const { method = "GET", body, query, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("Unable to reach the server. Check your connection and try again.", {
      code: "NETWORK_ERROR",
    });
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload || payload.success === false) {
    const error = payload && payload.success === false ? payload.error : undefined;
    throw new ApiError(error?.message || messageForStatus(response.status), {
      status: response.status,
      code: error?.code ?? "REQUEST_FAILED",
      details: error?.details,
    });
  }

  return { data: payload.data, meta: payload.meta };
}

export async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const { data } = await requestEnvelope<T>(path, options);
  return data;
}

export async function requestWithMeta<T>(
  path: string,
  options?: RequestOptions,
): Promise<{ data: T; meta?: PaginationMeta }> {
  return requestEnvelope<T>(path, options);
}

/**
 * Uploads use XMLHttpRequest so the admin UI can show real progress.
 * Same contract and credentials as `request`.
 */
export interface UploadOptions {
  onProgress?: (percent: number) => void;
  /** Abort the transfer (user pressed cancel). */
  signal?: AbortSignal;
}

export function requestWithProgress<T>(path: string, body: unknown, options: UploadOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!RAW_BASE) {
      reject(new ApiError("The API location is not configured (NEXT_PUBLIC_API_URL).", { code: "CONFIG_MISSING" }));
      return;
    }
    if (options.signal?.aborted) {
      reject(new ApiError("Upload cancelled.", { code: "ABORTED" }));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path));
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "json";

    const onAbort = () => xhr.abort();
    options.signal?.addEventListener("abort", onAbort);
    const cleanup = () => options.signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      cleanup();
      const payload = xhr.response as ApiEnvelope<T> | null;
      if (xhr.status < 200 || xhr.status >= 300 || !payload || payload.success === false) {
        const error = payload && payload.success === false ? payload.error : undefined;
        reject(
          new ApiError(error?.message || messageForStatus(xhr.status), {
            status: xhr.status,
            code: error?.code ?? "REQUEST_FAILED",
            details: error?.details,
          }),
        );
        return;
      }
      options.onProgress?.(100);
      resolve(payload.data);
    };

    xhr.onerror = () => {
      cleanup();
      reject(
        new ApiError("Unable to reach the server. Check your connection and try again.", {
          code: "NETWORK_ERROR",
        }),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ApiError("Upload cancelled.", { code: "ABORTED" }));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new ApiError("The upload timed out. Please retry.", { code: "TIMEOUT" }));
    };

    xhr.send(JSON.stringify(body));
  });
}

/** Downloads a file (CSV export) using the authenticated cookie. */
export async function downloadFile(path: string, query: Query, filename: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { credentials: "include", cache: "no-store" });
  } catch {
    throw new ApiError("Unable to reach the server. Check your connection and try again.", {
      code: "NETWORK_ERROR",
    });
  }

  if (!response.ok) {
    throw new ApiError(messageForStatus(response.status), { status: response.status, code: "EXPORT_FAILED" });
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/* ========================================================================
 * Endpoint map
 * ====================================================================== */

/**
 * Short-lived in-memory cache for public GETs so sections that need the same
 * content (e.g. services grid + footer links) share one request. Always
 * refetches after the TTL, so the backend remains the source of truth.
 */
const readCache = new Map<string, { expires: number; promise: Promise<unknown> }>();

function cached<T>(path: string, ttlMs = 60_000): Promise<T> {
  const hit = readCache.get(path);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.promise as Promise<T>;

  const promise = request<T>(path);
  readCache.set(path, { expires: now + ttlMs, promise });
  promise.catch(() => readCache.delete(path)); // never cache failures
  return promise;
}

export const api = {
  /* --- Public ----------------------------------------------------------- */
  health: () => request<HealthData>("/health"),
  logos: () => cached<PublicLogo[]>("/logos"),
  products: () => cached<Product[]>("/products"),
  services: () => cached<Service[]>("/services"),
  submitProject: (body: SubmissionInput) => request<SubmissionResult>("/submission", { method: "POST", body }),

  /** Fire-and-forget analytics beacon — never throws to the caller. */
  async trackVisit(input: VisitorTrackInput): Promise<void> {
    try {
      await request<VisitorTrackResult>("/visitor-track", { method: "POST", body: input });
    } catch {
      // Analytics must never break the browsing experience.
    }
  },

  /* --- Auth ------------------------------------------------------------- */
  auth: {
    login: async (email: string, password: string) => {
      const data = await request<{ admin: AdminSession }>("/auth/login", { method: "POST", body: { email, password } });
      return data.admin;
    },
    logout: () => request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }),
    me: async () => (await request<{ admin: AdminSession }>("/auth/me")).admin,
  },

  /* --- Admin ------------------------------------------------------------ */
  admin: {
    stats: () => request<DashboardStats>("/admin/dashboard/stats"),

    logos: {
      list: () => request<AdminLogosResponse>("/admin/logos"),
      create: (input: LogoInput, options?: UploadOptions) =>
        requestWithProgress<AdminLogo>("/admin/logos", input, options),
      update: (id: string, input: Partial<LogoInput>) =>
        request<AdminLogo>(`/admin/logos/${id}`, { method: "PUT", body: input }),
      remove: (id: string) => request<{ id: string }>(`/admin/logos/${id}`, { method: "DELETE" }),
      reorder: (ids: string[]) => request<{ reordered: number }>("/admin/logos/reorder", { method: "PATCH", body: { ids } }),
      setVisibility: (id: string, isVisible: boolean) =>
        request<AdminLogo>(`/admin/logos/${id}/visibility`, { method: "PATCH", body: { isVisible } }),
    },

    products: {
      list: (query: Query = {}, signal?: AbortSignal) =>
        requestWithMeta<Product[]>("/admin/products", { query, signal }),
      get: (id: string) => request<Product>(`/admin/products/${id}`),
      create: (input: Partial<Product>) => request<Product>("/admin/products", { method: "POST", body: input }),
      update: (id: string, input: Partial<Product>) =>
        request<Product>(`/admin/products/${id}`, { method: "PUT", body: input }),
      remove: (id: string) => request<{ id: string }>(`/admin/products/${id}`, { method: "DELETE" }),
      reorder: (ids: string[]) =>
        request<{ reordered: number }>("/admin/products/reorder", { method: "PATCH", body: { ids } }),
    },

    templates: {
      list: () => request<ProductTypeTemplate[]>("/admin/product-type-templates"),
      create: (input: { type: string; highlightPoints: string[] }) =>
        request<ProductTypeTemplate>("/admin/product-type-templates", { method: "POST", body: input }),
      update: (id: string, input: { type?: string; highlightPoints?: string[] }) =>
        request<ProductTypeTemplate>(`/admin/product-type-templates/${id}`, { method: "PUT", body: input }),
      remove: (id: string) =>
        request<{ id: string }>(`/admin/product-type-templates/${id}`, { method: "DELETE" }),
    },

    submissions: {
      list: (query: Query = {}, signal?: AbortSignal) =>
        requestWithMeta<Submission[]>("/admin/submissions", { query, signal }),
      get: (id: string) => request<Submission>(`/admin/submissions/${id}`),
      setStatus: (id: string, status: SubmissionStatus) =>
        request<Submission>(`/admin/submissions/${id}/status`, { method: "PATCH", body: { status } }),
      remove: (id: string) => request<{ id: string }>(`/admin/submissions/${id}`, { method: "DELETE" }),
      exportCsv: (query: Query = {}) => {
        const stamp = new Date().toISOString().slice(0, 10);
        return downloadFile("/admin/submissions/export", query, `jazari-submissions-${stamp}.csv`);
      },
    },

    visitors: {
      list: (query: Query = {}, signal?: AbortSignal) =>
        requestWithMeta<Visitor[]>("/admin/visitors", { query, signal }),
    },
  },
};

export default api;
