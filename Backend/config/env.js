import "dotenv/config";

/**
 * Central, validated configuration layer.
 *
 * Every module in the backend reads configuration from here — nothing reads
 * process.env directly. Missing mandatory variables fail fast with a clear
 * message, and secret values are never printed.
 */

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

/** @type {string[]} */
const problems = [];
/** @type {string[]} */
const warnings = [];

function readRequired(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    problems.push(`Missing required environment variable: ${name}`);
    return "";
  }
  return value.trim();
}

function readOptional(name, fallback = "") {
  const value = process.env[name];
  if (!value || !value.trim()) return fallback;
  return value.trim();
}

function readInt(name, fallback) {
  const raw = readOptional(name, "");
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    problems.push(`Environment variable ${name} must be an integer (received "${raw}").`);
    return fallback;
  }
  return parsed;
}

function readBool(name, fallback) {
  const raw = readOptional(name, "").toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  problems.push(`Environment variable ${name} must be a boolean (true/false).`);
  return fallback;
}

const nodeEnv = readOptional("NODE_ENV", "development");
const port = readInt("PORT", 5000);

// Comma-separated list of allowed browser origins (never "*").
const clientOrigins = readOptional("CLIENT_ORIGIN", "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const mongoUri = readRequired("MONGODB_URI");

// JWT signing secret.
const jwtSecret = readRequired("JWT_SECRET");
if (jwtSecret && jwtSecret.length < 32) {
  if (isProd) {
    problems.push("JWT_SECRET must be at least 32 characters in production.");
  } else {
    warnings.push("JWT_SECRET is shorter than 32 characters (development only).");
  }
}

// Cloudinary — mandatory in production, optional in development.
const cloudinary = {
  cloudName: readOptional("CLOUDINARY_CLOUD_NAME"),
  apiKey: readOptional("CLOUDINARY_API_KEY"),
  apiSecret: readOptional("CLOUDINARY_API_SECRET"),
};
if (isProd && (!cloudinary.cloudName || !cloudinary.apiKey || !cloudinary.apiSecret)) {
  problems.push(
    "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are required in production.",
  );
}

// --- Session cookie flags -----------------------------------------------------
// A host-only, first-party cookie is the reliable production setup (the browser
// talks to the frontend origin, which proxies /api to this server). These flags
// are read once here so set / refresh / clear can never disagree.
const cookieName = readOptional("JWT_COOKIE_NAME", "jazari_admin");
const cookieSecure = readBool("COOKIE_SECURE", isProd);
const cookieSameSite = readOptional("COOKIE_SAMESITE", "lax").toLowerCase();
if (cookieSameSite === "none" && !cookieSecure) {
  warnings.push(
    "COOKIE_SAMESITE=none requires COOKIE_SECURE=true — browsers reject the session cookie otherwise.",
  );
}
if (!["lax", "strict", "none"].includes(cookieSameSite)) {
  problems.push('COOKIE_SAMESITE must be "lax", "strict" or "none".');
}

// --- Auth diagnostics ---------------------------------------------------------
// Adds an internal `X-Auth-Reason` header (no-token | invalid-token | no-admin |
// inactive) to failed-auth responses so a deploy can be diagnosed without
// guessing. OFF by default and never part of the public contract; the response
// body stays generic. Enabled only by an explicit opt-in.
const authDebugHeaders = readBool("AUTH_DEBUG_HEADERS", false);
if (authDebugHeaders && isProd) {
  warnings.push(
    "AUTH_DEBUG_HEADERS=true in production exposes WHY authentication failed (no values, no tokens) — set it back to false once diagnosis is done.",
  );
}

// --- Web Push (VAPID) ---------------------------------------------------------
// Optional. When BOTH keys are present the API can send push notifications;
// when either is missing the API still stores device subscriptions but sending
// is disabled (503) instead of crashing — a half-configured push setup must
// never take the whole API down.
const pushPublicKey = readOptional("VAPID_PUBLIC_KEY");
const pushPrivateKey = readOptional("VAPID_PRIVATE_KEY");
if ((pushPublicKey && !pushPrivateKey) || (!pushPublicKey && pushPrivateKey)) {
  warnings.push(
    "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be set for push notifications to work — sending is disabled until then.",
  );
}
const pushEnabled = Boolean(pushPublicKey && pushPrivateKey);

// Used only by the seed script (never by the running server).
const admin = {
  email: readOptional("ADMIN_EMAIL"),
  password: readOptional("ADMIN_PASSWORD"),
  name: readOptional("ADMIN_NAME"),
  // The configured account is promoted to `super_admin`; its password is only
  // overwritten when this flag is explicitly enabled.
  resetPasswordOnSeed: readBool("SEED_RESET_ADMIN_PASSWORD", false),
  // Legacy/demo account that is deactivated unless it IS the configured account.
  demoEmail: readOptional("DEMO_ADMIN_EMAIL", "admin@jazaritech.com"),
};

const config = {
  nodeEnv,
  isProd,
  isTest,
  port,
  clientOrigins,
  mongoUri,
  // Opt-in internal auth diagnostics — see the AUTH_DEBUG_HEADERS block above.
  authDebugHeaders,
  jwt: {
    secret: jwtSecret,
    expiresIn: readOptional("JWT_EXPIRES_IN", "7d"),
    cookieName,
    cookieSecure,
    // Preferred: "lax" with the same-origin /api proxy. Use "none" (with
    // COOKIE_SECURE=true) only when frontend and API are unavoidably on
    // different sites — browsers increasingly block those cookies.
    cookieSameSite,
  },
  cloudinary,
  push: {
    publicKey: pushPublicKey,
    privateKey: pushPrivateKey,
    // Contact address web-push sends to the push service (mailto: or https:).
    // The default is the project's public contact mailbox — a public address,
    // never a secret.
    subject: readOptional("VAPID_SUBJECT", "mailto:jazaritechofficial@gmail.com"),
    // True only when both keys are configured.
    enabled: pushEnabled,
    // A subscription that fails this many times (and is not reported gone) is
    // deactivated so dead devices stop being retried forever.
    maxFailures: readInt("PUSH_MAX_FAILURES", 5),
  },
  admin,
  // Public base URL of this API (used to build local development asset URLs).
  publicApiUrl: readOptional("PUBLIC_API_URL", ""),
  // Reverse proxy hops to trust for client IP extraction.
  // Accepts: a number ("1"), true/false, or "true"/"false".
  trustProxy: parseTrustProxy(readOptional("TRUST_PROXY", "1")),
  logFormat: readOptional("LOG_FORMAT", isProd ? "combined" : "dev"),
  jsonBodyLimit: readOptional("JSON_BODY_LIMIT", "15mb"),
  visitor: {
    // Repeated hits from the same IP inside this window collapse into one record.
    dedupeWindowHours: readInt("VISITOR_DEDUPE_HOURS", 24),
  },
  rateLimits: {
    generalWindowMs: readInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    generalMax: readInt("RATE_LIMIT_MAX", 300),
    loginMax: readInt("LOGIN_RATE_LIMIT_MAX", 10),
    submissionMax: readInt("SUBMISSION_RATE_LIMIT_MAX", 5),
    visitorMax: readInt("VISITOR_RATE_LIMIT_MAX", 120),
    // Push subscription register/unregister beacons.
    pushMax: readInt("PUSH_RATE_LIMIT_MAX", 60),
    // Team management + password changes (sensitive write operations).
    sensitiveMax: readInt("SENSITIVE_RATE_LIMIT_MAX", 30),
  },
};

function parseTrustProxy(raw) {
  const lower = raw.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  const asNumber = Number.parseInt(raw, 10);
  if (!Number.isNaN(asNumber)) return asNumber;
  problems.push(`TRUST_PROXY must be a boolean or a number (received "${raw}").`);
  return 1;
}

if (warnings.length) {
  for (const warning of warnings) console.warn(`[config] warning: ${warning}`);
}

if (problems.length) {
  console.error("\n[config] Invalid environment configuration:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nCopy backend/.env.example to backend/.env and fill in the values.\n");
  process.exit(1);
}

export default config;
