#!/usr/bin/env node
/**
 * Production seed — `npm run seed:prod`
 *
 * SAFETY GUARD: refuses to run unless CONFIRM_PRODUCTION_SEED=true is present
 * in the process environment. There is no interactive prompt — the flag is the
 * explicit confirmation. When it is missing the script exits non-zero WITHOUT
 * connecting to MongoDB and WITHOUT writing anything.
 *
 * Required environment variables (read from the process environment only —
 * never stored, echoed or written to disk by this script):
 *   MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
 * Optional:
 *   SEED_RESET_ADMIN_PASSWORD=true   (opt-in password overwrite for an existing admin)
 *   SEED_SAMPLE_CONTENT=true         (opt-in sample products; default OFF in production)
 *   DEMO_ADMIN_EMAIL                 (legacy/demo account to deactivate)
 *
 * The database name is printed; the connection string and every secret are not.
 * Behavior and data are shared with `npm run seed` via scripts/seed-core.js, so
 * the two commands can never diverge.
 */
import { isStrongPassword, PASSWORD_MIN, PASSWORD_MAX } from "../utils/password.js";

const REFUSED = "\n[seed:prod] REFUSED — production seeding was not confirmed.";
const CONFIRM = "CONFIRM_PRODUCTION_SEED";

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

// --- 1. Explicit confirmation guard (before anything else) ------------------
if (String(process.env[CONFIRM] || "").toLowerCase() !== "true") {
  fail([
    REFUSED,
    `  Set ${CONFIRM}=true to proceed. No database connection was made.`,
    "  Example (PowerShell):  $env:CONFIRM_PRODUCTION_SEED=\"true\"; npm run seed:prod",
    "",
  ]);
}

/** Extract only the database name from a MongoDB URI — never the URI itself. */
function databaseName(uri) {
  try {
    const withoutQuery = uri.split("?")[0];
    const withoutScheme = withoutQuery.replace(/^mongodb(\+srv)?:\/\//i, "");
    const afterHost = withoutScheme.split("@").pop() || "";
    const segments = afterHost.split("/").filter(Boolean);
    const name = segments[1] || "";
    return name || "(default)";
  } catch {
    return "(unknown)";
  }
}

// --- 2. Required inputs -----------------------------------------------------
const missing = ["MONGODB_URI", "ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_NAME"].filter(
  (name) => !String(process.env[name] || "").trim(),
);
if (missing.length) {
  fail([
    "\n[seed:prod] missing required environment variable(s):",
    ...missing.map((name) => `  - ${name}`),
    "",
  ]);
}

const uri = String(process.env.MONGODB_URI).trim();
const adminEmail = String(process.env.ADMIN_EMAIL).trim();
const adminName = String(process.env.ADMIN_NAME).trim();
const adminPassword = String(process.env.ADMIN_PASSWORD);

// --- 3. Password policy (before touching the database) ----------------------
if (!isStrongPassword(adminPassword)) {
  fail([
    "\n[seed:prod] ADMIN_PASSWORD does not meet the project password policy:",
    `  Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters and include upper and lower case letters and a number.`,
    "  (The value itself is never printed.)",
    "",
  ]);
}

const resetPassword = String(process.env.SEED_RESET_ADMIN_PASSWORD || "").toLowerCase() === "true";
const sampleContent = String(process.env.SEED_SAMPLE_CONTENT || "").toLowerCase() === "true";

// --- 4. Announce target (name only) then seed -------------------------------
console.log("[seed:prod] confirmed. target database:", databaseName(uri));
console.log(`[seed:prod] reset existing password: ${resetPassword}`);
console.log(`[seed:prod] seed sample products: ${sampleContent}`);

try {
  // Dynamic import so the confirmation guard runs before any module (and any
  // environment validation inside config/env.js) is evaluated.
  const { seedDatabase, disconnectDb } = await import("./seed-core.js");

  const result = await seedDatabase({
    uri,
    adminEmail,
    adminPassword,
    adminName,
    resetPassword,
    demoEmail: process.env.DEMO_ADMIN_EMAIL || "admin@jazaritech.com",
    sampleContent,
  });

  console.log("\n[seed:prod] done.");
  console.log(`  admin created: ${result.admin.created}`);
  console.log(`  admin role:    ${result.admin.role}`);
  console.log(`  admin active:  ${result.admin.isActive}`);
  console.log(`  templates:     ${result.counts.templates}`);
  console.log(`  services:      ${result.counts.services}`);
  console.log(`  products:      ${result.counts.products}`);
  console.log("\nSign in at /admin/login, then change the password at /admin/account.\n");

  await disconnectDb();
} catch (error) {
  // Sanitize: never leak the URI/credentials that a driver error may embed.
  const message = String(error?.message || error).replace(/mongodb(\+srv)?:\/\/\S+/gi, "[redacted]");
  console.error(`\n[seed:prod] failed: ${message}`);
  process.exit(1);
}
