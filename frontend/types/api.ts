/**
 * Types mirroring the backend response contract exactly.
 * Backend: { success: true, data, meta? } | { success: false, error: { code, message, details? } }
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFailureEnvelope {
  success: false;
  error: ApiErrorBody;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiFailureEnvelope;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  totalRecords?: number;
}

/* --- Public content ------------------------------------------------------- */

export type LogoTone = "light" | "dark" | "colorful";
export type LogoBackgroundStatus = "removed" | "kept" | "needs-transparent-png";

/** Safe, frontend-facing logo projection returned by the public API. */
export interface PublicLogo {
  _id: string;
  name: string;
  /** Human-friendly display name (falls back to `name`). */
  displayName: string;
  secureUrl: string;
  alt: string;
  /** Optional external product link (safe http/https only). */
  websiteUrl: string;
  sortOrder: number;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  hasAlpha: boolean | null;
  tone: LogoTone;
  backgroundStatus: LogoBackgroundStatus;
  dominantColors: string[];
}

export interface AdminLogo extends PublicLogo {
  publicId: string;
  originalUrl?: string;
  originalPublicId?: string;
  averageLuminance?: number | null;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLogosResponse {
  logos: AdminLogo[];
  driver: "cloudinary" | "local";
}

/** Server-side processing controls shared by upload / reprocess / bulk fix. */
export interface LogoProcessingOptions {
  removeBackground?: boolean;
  trim?: boolean;
  tolerance?: number;
}

export interface LogoInput extends LogoProcessingOptions {
  name: string;
  displayName?: string;
  alt?: string;
  websiteUrl?: string;
  isVisible?: boolean;
  sortOrder?: number;
  /** Base64 data URI — sent with progress tracking, never to the browser directly. */
  image?: string;
}

export interface LogoProcessingResult {
  status: LogoBackgroundStatus;
  changed: boolean;
  alreadyGood?: boolean;
  reason?: string;
}

export interface ReprocessLogoResponse {
  logo: AdminLogo;
  result: LogoProcessingResult;
}

/** Result of the server-side preview endpoint (no asset is stored). */
export interface LogoPreview {
  preview: string | null;
  backgroundStatus: LogoBackgroundStatus;
  metadata: {
    width: number;
    height: number;
    aspectRatio: number;
    hasAlpha: boolean;
    dominantColors: string[];
    averageLuminance: number;
    tone: LogoTone;
  } | null;
  reason?: string;
}

export interface BulkFixItem {
  id: string;
  name: string;
  status: "processed" | "already-good" | "needs-transparent-png" | "failed";
  message?: string;
}

export interface BulkFixSummary {
  processed: number;
  alreadyGood: number;
  needsTransparentPng: number;
  failed: number;
  total: number;
}

export interface BulkFixResponse {
  summary: BulkFixSummary;
  items: BulkFixItem[];
}

export interface Product {
  _id: string;
  name: string;
  logo: string;
  productUrl: string;
  category: string;
  highlightPoints: string[];
  isPublished: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductInput = Omit<Product, "_id" | "createdAt" | "updatedAt"> | Record<string, unknown>;

export interface ProductTypeTemplate {
  _id: string;
  type: string;
  highlightPoints: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Service {
  _id: string;
  title: string;
  slug: string;
  icon: string;
  description: string;
  /**
   * Optional one-line summary (≤ 90 chars) shown at rest on the services card.
   * Backward compatible: when absent the card falls back to the first clause of
   * `description` — the frontend never invents copy.
   */
  shortDescription?: string;
  /** Optional list of up to 3 short tag chips (≤ 24 chars each). */
  highlights?: string[];
  sortOrder: number;
  /** 0..4 when this service is featured in the Exploded Logo Services Hub, else null. */
  hubSlot?: number | null;
  /** Optional hub label override (falls back to the title when empty). */
  hubLabel?: string | null;
}

/* --- Intake --------------------------------------------------------------- */

export interface SubmissionInput {
  name: string;
  domain?: string;
  phone?: string;
  email?: string;
  service: string;
  /** Honeypot — must stay empty for humans. */
  website?: string;
}

export interface SubmissionResult {
  referenceId: string;
  accepted: boolean;
  duplicate?: boolean;
}

export type SubmissionStatus = "New" | "Contacted" | "Closed";

export interface Submission {
  _id: string;
  name: string;
  domain: string;
  phone: string;
  email: string;
  service: string;
  referenceId: string;
  visitorIp: string;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
}

/* --- Analytics ------------------------------------------------------------ */

export interface Visitor {
  _id: string;
  ip: string;
  normalizedIp: string;
  userAgent: string;
  page: string;
  referrer: string;
  visitDate: string;
  visitCount: number;
  lastVisitedAt: string;
  createdAt: string;
}

export interface VisitorTrackInput {
  page?: string;
  referrer?: string;
}

export interface VisitorTrackResult {
  tracked: boolean;
  deduplicated: boolean;
}

export interface DashboardSeriesPoint {
  date: string;
  uniqueVisitors: number;
  visits: number;
}

export interface DashboardStats {
  products: number;
  logos: number;
  submissions: {
    total: number;
    New: number;
    Contacted: number;
    Closed: number;
  };
  visitors: {
    todayUnique: number;
    totalUnique: number;
    totalVisits: number;
    series: DashboardSeriesPoint[];
  };
  generatedAt: string;
  mongoReady: boolean;
}

/* --- Push notifications --------------------------------------------------- */

/** Public answer from GET /api/push/public-key. */
export interface PushKeyResponse {
  /** VAPID application server key (empty when push is not configured). */
  key: string;
  /** False when the server has no VAPID keys — sending is disabled. */
  configured: boolean;
}

export interface PushSubscribeInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  page?: string;
}

export interface PushSubscribeResult {
  subscribed: boolean;
  id: string;
}

export interface PushUnsubscribeResult {
  unsubscribed: boolean;
}

export type NotificationStatus = "draft" | "sent" | "failed";

export interface NotificationStats {
  /** Total stored devices. */
  subscribers: number;
  /** Devices still eligible to receive a message. */
  activeSubscribers: number;
  notificationsSent: number;
  delivered: number;
  failed: number;
  pushConfigured: boolean;
}

export interface AdminNotification {
  _id: string;
  title: string;
  body: string;
  url: string;
  icon: string;
  tag: string;
  /** Optional service slug this message was composed from. */
  serviceSlug: string;
  status: NotificationStatus;
  stats: { targeted: number; sent: number; failed: number; removed: number };
  error: string;
  createdByName: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationInput {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  serviceSlug?: string;
  /** Deliver immediately instead of saving a draft. */
  send?: boolean;
}

/* --- Auth ----------------------------------------------------------------- */

/** Admin roles, mirroring the backend enum exactly. */
export type AdminRole = "admin" | "super_admin";

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/* --- Team management (Super Admin only) ----------------------------------- */

export type AdminTeamMember = AdminSession;

export interface AdminTeamResponse {
  admins: AdminTeamMember[];
}

export interface CreateAdminInput {
  email: string;
  name: string;
  role: AdminRole;
  /** Temporary password supplied by the Super Admin — never returned by the API. */
  password: string;
}

export interface HealthData {
  status: string;
  uptime: number;
  environment: string;
  database: string;
  timestamp: string;
}
