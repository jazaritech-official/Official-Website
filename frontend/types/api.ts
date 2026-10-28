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

/** Resolved, safe logo reference attached to a product (never internal ids). */
export interface ProductLogo {
  /** Logo id when referenced from the Logo collection, else null (legacy URL). */
  id: string | null;
  url: string;
  displayName: string;
  alt: string;
  tone: LogoTone | null;
  hasAlpha: boolean | null;
  aspectRatio: number | null;
}

export interface Product {
  _id: string;
  name: string;
  /**
   * The product's logo reference. `null` means “use the designed monogram”.
   * A legacy plain-URL string is still tolerated at runtime (see
   * `lib/productLogo.ts`) so an old cached/snapshotted payload never blanks.
   */
  logo: ProductLogo | null;
  /** Reference id into the Logo collection (admin responses). */
  logoId?: string | null;
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
  /**
   * Optional discipline grouping for the Services "Discipline Atlas"
   * (`engineering | growth | design | security | operations`). Empty/absent
   * means ungrouped — the atlas then renders one ring and never invents a
   * category. Backward compatible: the enum is enforced by the backend.
   */
  category?: string;
  /**
   * Optional MICRO accent hint (`blue | navy | green-micro`). Growth Green is
   * only ever a dot/crest/spark, never a large fill. Unknown values fall back
   * to `blue` in the UI.
   */
  accent?: "blue" | "navy" | "green-micro" | string;
  sortOrder: number;
  /** 0..4 when this service is featured in the Exploded Logo Services Hub, else null. */
  hubSlot?: number | null;
  /** Optional hub label override (falls back to the title when empty). */
  hubLabel?: string | null;
}

/* --- Intake --------------------------------------------------------------- */

/** Optional intake extras (Task L) — always optional and backward compatible. */
export type SubmissionTimeline = "asap" | "1-3-months" | "3-6-months" | "exploring";

export interface SubmissionInput {
  name: string;
  domain?: string;
  phone?: string;
  email?: string;
  service: string;
  /** "Tell us about your project" — free text, ≤ 1000 characters. */
  message?: string;
  /** Optional timeline bucket; omitted when the visitor skips the question. */
  timeline?: SubmissionTimeline | "";
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
  /** Optional free-text brief (Task L) — empty string when not supplied. */
  message: string;
  /** Optional timeline bucket (Task L) — empty string when not supplied. */
  timeline: SubmissionTimeline | "";
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

/* --- Business: orders, clients, payees, settlement, treasury (Task N) ---- */

export type OrderStatus = "new" | "in_progress" | "review" | "delivered" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid";
export type PayeeRole = "worker" | "referrer" | "both";

/** Basis points: 10000 = 100%, 1000 = 10%, 1250 = 12.5%. Integers only. */
export type BasisPoints = number;

export interface FinanceClient {
  _id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  notes: string;
  isActive: boolean;
  /** Derived by the API (one aggregation over the listed ids). */
  orderCount?: number;
  billedMinor?: number;
  paidMinor?: number;
  lastOrderAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientOrderSummary {
  _id: string;
  invoiceNumber: string;
  title: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalMinor: number;
  paidMinor: number;
  createdAt: string;
}

export interface FinanceClientDetail extends FinanceClient {
  orders?: ClientOrderSummary[];
}

export interface Payee {
  _id: string;
  name: string;
  role: PayeeRole;
  phone: string;
  notes: string;
  isActive: boolean;
  /** Derived by the API from the split snapshots on non-cancelled orders. */
  owedMinor?: number;
  paidOutMinor?: number;
  orderCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogItem {
  _id: string;
  name: string;
  unitLabel: string;
  defaultUnitPriceMinor: number;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderItem {
  catalogItemId?: string | null;
  name: string;
  unitLabel: string;
  quantity: number;
  unitPriceMinor: number;
  /** Recomputed server-side; a value sent by the client is ignored. */
  lineTotalMinor: number;
}

export interface OrderPayment {
  _id: string;
  amountMinor: number;
  method: string;
  receivedAt: string;
  reference: string;
  note: string;
  recordedBy?: string | null;
}

export interface OrderShare {
  payeeId: string | null;
  name: string;
  bp: BasisPoints;
  amountMinor: number;
  paidOutAt: string | null;
}

export interface OrderSplit {
  referrerBp: BasisPoints;
  workerBp: BasisPoints;
  referrer: OrderShare | null;
  workers: OrderShare[];
  companyMinor: number;
  computedAt: string;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  at: string;
  byAdminId?: string | null;
  note?: string;
}

export interface Order {
  _id: string;
  invoiceNumber: string;
  clientId: string;
  clientSnapshot: { name: string; phone: string; email: string; company: string };
  title: string;
  notes: string;
  items: OrderItem[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  status: OrderStatus;
  statusHistory: OrderStatusHistoryEntry[];
  paymentStatus: PaymentStatus;
  paidMinor: number;
  payments: OrderPayment[];
  deliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  /** Derived by the API for the list UI. */
  balanceMinor?: number;
  refundDueMinor?: number;
  /**
   * Present only for callers allowed to see it (super_admin when
   * FINANCE_SPLIT_SUPER_ONLY is on). Omitted server-side, never hidden in the UI.
   */
  split?: OrderSplit;
  /** Only returned by GET /admin/orders/:id. */
  paymentMethods?: string[];
}

/** What the editor sends (money is always integer minor units). */
export interface OrderInput {
  clientId: string;
  title?: string;
  notes?: string;
  deliveryDate?: string | null;
  discountMinor?: number;
  status?: OrderStatus;
  items: Array<{
    catalogItemId?: string | null;
    name: string;
    unitLabel: string;
    quantity: number;
    unitPriceMinor: number;
  }>;
  initialPayment?: { amountMinor: number; method: string; receivedAt?: string; reference?: string; note?: string };
  split?: {
    referrer?: { payeeId?: string | null; bp?: BasisPoints } | null;
    workers?: Array<{ payeeId?: string | null; bp?: BasisPoints }>;
  };
}

export interface OrdersSummary {
  openOrders: number;
  unpaidBalanceMinor: number;
  collectedThisMonthMinor: number;
  paymentsThisMonth: number;
  deliveredThisMonth: number;
  monthStart: string;
}

export interface FinanceBusiness {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  paymentInstructions: string;
  billFooterNote: string;
}

export interface FinanceSettings {
  referrerBp: BasisPoints;
  workerBp: BasisPoints;
  currency: string;
  paymentMethods: string[];
  business: FinanceBusiness;
}

export interface TreasuryPerson {
  payeeId: string | null;
  name: string;
  owedMinor: number;
  paidOutMinor: number;
  pendingMinor: number;
  orderCount: number;
}

export interface TreasuryMonth {
  /** "YYYY-MM" in Asia/Karachi. */
  month: string;
  collectedMinor: number;
  payments: number;
}

export interface TreasuryReport {
  expectedCompanyMinor: number;
  collectedCompanyMinor: number;
  stillToCollectMinor: number;
  peopleOwedMinor: number;
  peoplePaidOutMinor: number;
  orders: { count: number; billedMinor: number; paidMinor: number; outstandingMinor: number };
  people: TreasuryPerson[];
  months: TreasuryMonth[];
  generatedAt: string;
}

/** The payload of a payout toggle; `party` echoes what was changed. */
export interface PayoutResult {
  split: OrderSplit;
  party: "referrer" | "worker";
  payeeId: string;
  paid: boolean;
}

export interface PaymentResult {
  payment: OrderPayment | null;
  order: { _id: string; invoiceNumber: string; paidMinor: number; totalMinor: number; paymentStatus: PaymentStatus; balanceMinor: number };
}
