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

export interface PublicLogo {
  _id: string;
  name: string;
  secureUrl: string;
  alt?: string;
  sortOrder: number;
}

export interface AdminLogo extends PublicLogo {
  publicId: string;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLogosResponse {
  logos: AdminLogo[];
  driver: "cloudinary" | "local";
}

export interface LogoInput {
  name: string;
  alt?: string;
  isVisible?: boolean;
  sortOrder?: number;
  /** Base64 data URI — sent with progress tracking, never to the browser directly. */
  image?: string;
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
  sortOrder: number;
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
