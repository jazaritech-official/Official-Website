#!/usr/bin/env node
/**
 * `npm run check:secrets` — dependency-free guard against committed secrets.
 *
 * Scans TRACKED example files and documentation for values that look like real
 * credentials. It NEVER prints a matched value — only `file:line` and the kind
 * of secret — so it is safe to run in CI, in a shared terminal and in logs.
 *
 * Detects:
 *   1. a MongoDB connection string carrying real (non-placeholder) credentials
 *   2. Cloudinary-looking API keys / secrets
 *   3. 32+ character assignments to secret-shaped names (JWT_SECRET, *_TOKEN, …)
 *
 * Usage:
 *   node scripts/check-no-secrets.mjs            # scan git-tracked docs/examples
 *   node scripts/check-no-secrets.mjs <files…>   # scan explicit files (tests)
 *
 * Exit code: 1 when anything suspicious is found, 0 when clean.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The guard must cover the WHOLE repository (including `Backend/.env.example`),
 * not just the folder this script lives in — so resolve the git top-level and
 * fall back to the parent directory when git is unavailable.
 */
function resolveRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8" }).trim();
  } catch {
    return path.resolve(here, "..");
  }
}

const root = resolveRepoRoot();

/** Files worth scanning: example templates + human documentation + config. */
const SCANNABLE = /(^|[\\/])(\.env(\..+)?|[^\\/]+\.(example|md|markdown|txt|ya?ml))$/i;

/** Never scan these (huge, generated, or test fixtures that are not shipped). */
const IGNORED = /(^|[\\/])(node_modules|\.git|\.next|test-output)([\\/]|$)|package-lock\.json$/i;

/** Values that are obviously placeholders, never real secrets. */
const PLACEHOLDER = /^(<.*>?|your[_-\s]|change[_-\s]?me|example|placeholder|dummy|xxx+|todo|test|none|null|redacted|at-least-)/i;

/** Angle-bracket placeholder anywhere in the value (e.g. `pre-<password>-x`). */
const ANGLE = /[<>]/;

const KINDS = [
  {
    kind: "MongoDB URI with embedded credentials",
    // `mongodb+srv://user:pass@…` — excludes `<username>:<password>` and localhost.
    test: (line) => /mongodb(\+srv)?:\/\/(?!<)[^:@\s/]+:[^:@\s/]+@/i.test(line),
  },
  {
    kind: "Cloudinary credential",
    test: (line) => {
      const assignment = /(cloudinary_api_secret|cloudinary_api_key|cloudinary_url|api_secret|api_key)\s*[=:]\s*["']?([^\s#'"]{16,})/i.exec(line);
      if (!assignment) return false;
      const value = assignment[2];
      return !PLACEHOLDER.test(value) && !ANGLE.test(value);
    },
  },
  {
    kind: "Secret-shaped assignment (32+ chars)",
    test: (line) => {
      const assignment = /(jwt_secret|access_token|refresh_token|auth_token|private_key|client_secret|signing_key|api_key|apikey|secret)\s*[=:]\s*["']?([^\s#'"]{32,})/i.exec(line);
      if (!assignment) return false;
      const value = assignment[2];
      return !PLACEHOLDER.test(value) && !ANGLE.test(value) && !/^mongodb/i.test(value);
    },
  },
];

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "--", "."], { cwd: root, encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)
    .map((file) => path.resolve(root, file));
}

function resolveTargets(args) {
  if (args.length > 0) {
    return args.map((arg) => path.resolve(process.cwd(), arg));
  }
  return trackedFiles();
}

const args = process.argv.slice(2);
const findings = [];
let scanned = 0;

for (const file of resolveTargets(args)) {
  if (IGNORED.test(file)) continue;
  if (!SCANNABLE.test(file)) continue;
  let stats;
  try {
    stats = statSync(file);
  } catch {
    continue;
  }
  if (!stats.isFile()) continue;

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  scanned += 1;

  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) return;
    for (const { kind, test } of KINDS) {
      if (test(line)) {
        findings.push({ file: path.relative(root, file), line: index + 1, kind });
        break; // one finding per line is enough
      }
    }
  });
}

if (findings.length === 0) {
  console.log(`[check:secrets] clean — ${scanned} file(s) scanned, no secret-looking values.`);
  process.exit(0);
}

console.error(`[check:secrets] ${findings.length} suspicious value(s) found (values never printed):`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line} — ${finding.kind}`);
}
console.error("[check:secrets] replace each with a placeholder and rotate the real credential.");
process.exit(1);
