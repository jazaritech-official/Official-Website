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
  AdminRole,
  AdminSession,
  AdminTeamMember,
  AdminTeamResponse,
  ApiEnvelope,
  BulkFixResponse,
  CreateAdminInput,
  DashboardStats,
  HealthData,
  LogoInput,
  LogoPreview,
  LogoProcessingOptions,
  PaginationMeta,
  ReprocessLogoResponse,
  Product,
  ProductTypeTemplate,
  PublicLogo,
  PushKeyResponse,
  PushSubscribeInput,
  PushSubscribeResult,
  PushUnsubscribeResult,
  Service,
  Submission,
  SubmissionInput,
  SubmissionResult,
  SubmissionStatus,
  Visitor,
  VisitorTrackInput,
  VisitorTrackResult,
  AdminNotification,
  NotificationInput,
  NotificationStats,
} from "@/types/api";
import { loadPublicContent } from "@/lib/publicContent";

// Two supported modes:
//  Mode 1 (production default) — the same-origin /api proxy: the client talks
//    to its OWN origin at /api, and the Next server proxies to BACKEND_ORIGIN
//    via the rewrite in next.config.ts. Keeps the auth cookie first-party.
//    When the proxy is configured at build time (NEXT_PUBLIC_API_PROXY is set
//    by next.config.ts) this wins even if a stale absolute NEXT_PUBLIC_API_URL
//    is present, because an absolute cross-site URL would make the session
//    cookie third-party (stored on login, never sent afterwards → 401).
//  Mode 2 (local development) — an absolute URL such as
//    http://localhost:5000/api is used directly, preserving the previous
//    direct frontend→backend workflow.
const API_PROXY_ACTIVE = process.env.NEXT_PUBLIC_API_PROXY === "1";
const RAW_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
const BASE = API_PROXY_ACTIVE ? "/api" : RAW_BASE || "/api";

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
  const combined = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, String(value));
    }
  }
  const search = params.toString();

  // Absolute base (local development) → normalized URL object.
  if (/^https?:\/\//i.test(combined)) {
    const url = new URL(combined);
    if (search) url.search = search;
    return url.toString();
  }
  // Relative base (same-origin proxy) → keep it relative so the browser uses
  // the current origin.
  return search ? `${combined}?${search}` : combined;
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
 * The three public collections resolve through the resilience hierarchy in
 * `lib/publicContent.ts` (live API → validated localStorage cache → validated
 * build-time snapshot → designed error), with one shared request per resource.
 * Everything else here is the plain typed request layer.
 */
export const api = {
  /* --- Public ----------------------------------------------------------- */
  health: () => request<HealthData>("/health"),
  logos: () => loadPublicContent<PublicLogo[]>("logos").then((result) => result.data),
  products: () => loadPublicContent<Product[]>("products").then((result) => result.data),
  services: () => loadPublicContent<Service[]>("services").then((result) => result.data),
  submitProject: (body: SubmissionInput) => request<SubmissionResult>("/submission", { method: "POST", body }),

  /* --- Push notifications (public) -------------------------------------- */
  push: {
    publicKey: () => request<PushKeyResponse>("/push/public-key"),
    subscribe: (body: PushSubscribeInput) =>
      request<PushSubscribeResult>("/push/subscribe", { method: "POST", body }),
    unsubscribe: (endpoint: string) =>
      request<PushUnsubscribeResult>("/push/unsubscribe", { method: "POST", body: { endpoint } }),
  },

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
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      request<{ changed: boolean }>("/auth/password", { method: "POST", body: input }),
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
      preview: (input: { image: string } & LogoProcessingOptions) =>
        request<LogoPreview>("/admin/logos/preview", { method: "POST", body: input }),
      reprocess: (id: string, options?: LogoProcessingOptions) =>
        request<ReprocessLogoResponse>(`/admin/logos/${id}/reprocess`, { method: "POST", body: options ?? {} }),
      revert: (id: string) => request<AdminLogo>(`/admin/logos/${id}/revert`, { method: "POST", body: {} }),
      bulkFix: (options?: LogoProcessingOptions) =>
        request<BulkFixResponse>("/admin/logos/bulk-fix", { method: "POST", body: options ?? {} }),
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

    /* --- Push notifications ------------------------------------------------- */
    notifications: {
      list: (signal?: AbortSignal) => request<AdminNotification[]>("/admin/notifications", { signal }),
      stats: (signal?: AbortSignal) => request<NotificationStats>("/admin/notifications/stats", { signal }),
      create: (input: NotificationInput) =>
        request<AdminNotification>("/admin/notifications", { method: "POST", body: input }),
      send: (id: string, endpoint?: string) =>
        request<AdminNotification>(`/admin/notifications/${id}/send`, {
          method: "POST",
          body: endpoint ? { endpoint } : {},
        }),
      remove: (id: string) =>
        request<{ id: string; deleted: boolean }>(`/admin/notifications/${id}`, { method: "DELETE" }),
    },

    /** Super-admin-only team management (backend enforces the role). */
    team: {
      list: () => request<AdminTeamResponse>("/admin/team"),
      create: (input: CreateAdminInput) =>
        request<{ admin: AdminTeamMember }>("/admin/team", { method: "POST", body: input }),
      updateRole: (id: string, role: AdminRole) =>
        request<{ admin: AdminTeamMember }>(`/admin/team/${id}/role`, { method: "PATCH", body: { role } }),
      setActive: (id: string, isActive: boolean) =>
        request<{ admin: AdminTeamMember }>(`/admin/team/${id}/status`, {
          method: "PATCH",
          body: { isActive },
        }),
      resetPassword: (id: string, password: string) =>
        request<{ admin: AdminTeamMember; reset: boolean }>(`/admin/team/${id}/password`, {
          method: "POST",
          body: { password },
        }),
      remove: (id: string) =>
        request<{ id: string; deleted: boolean }>(`/admin/team/${id}`, { method: "DELETE" }),
    },
  },
};

export default api;
