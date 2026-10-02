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
  jwt: {
    secret: jwtSecret,
    expiresIn: readOptional("JWT_EXPIRES_IN", "7d"),
    cookieName: readOptional("JWT_COOKIE_NAME", "jazari_admin"),
    cookieSecure: readBool("COOKIE_SECURE", isProd),
    // Use "none" (with COOKIE_SECURE=true) when frontend and API are on
    // different top-level domains in production.
    cookieSameSite: readOptional("COOKIE_SAMESITE", "lax"),
  },
  cloudinary,
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
