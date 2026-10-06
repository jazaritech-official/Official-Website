#!/usr/bin/env node
/**
 * `npm run snapshot:content` — writes `public/content-snapshot.json`, the
 * build-time fallback layer of the public-content resilience hierarchy.
 *
 * SAFETY RULES (all enforced here):
 *   · dependency-free (Node built-ins only — no new packages)
 *   · public GETs only (`/logos`, `/products`, `/services`) — never an admin,
 *     auth or submission endpoint
 *   · NEVER overwrites a good resource with an empty list
 *   · if the API is unreachable, the previous snapshot is preserved and the
 *     script exits 0 with a warning — a snapshot refresh must never fail a build
 *   · the file carries a `_generated` marker (NEVER HAND-EDIT) and contains no
 *     secrets — only the public projections the site already renders
 *
 * Base URL resolution order:
 *   SNAPSHOT_API_BASE → NEXT_PUBLIC_API_URL → `${BACKEND_ORIGIN}/api` →
 *   http://localhost:5000/api
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(root, "public", "content-snapshot.json");
const RESOURCES = ["logos", "products", "services"];
const TIMEOUT_MS = 8000;

function resolveBase() {
  const explicit = process.env.SNAPSHOT_API_BASE?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const publicUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/+$/, "");
  const backend = process.env.BACKEND_ORIGIN?.trim();
  if (backend) return `${backend.replace(/\/+$/, "")}/api`;
  return "http://localhost:5000/api";
}

async function fetchResource(name) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${resolveBase()}/${name}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
      throw new Error("unexpected payload shape");
    }
    return payload.data;
  } finally {
    clearTimeout(timer);
  }
}

function readPrevious() {
  try {
    const raw = fs.readFileSync(OUTPUT, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* no previous snapshot */
  }
  return null;
}

const previous = readPrevious();
const next = {};
let live = 0;
let kept = 0;
let missing = [];

for (const resource of RESOURCES) {
  let data = null;
  try {
    data = await fetchResource(resource);
    live += 1;
  } catch (cause) {
    const label = cause instanceof Error ? cause.message : String(cause);
    console.warn(`[snapshot] ${resource}: API unavailable (${label})`);
  }

  const previousList = Array.isArray(previous?.[resource]) ? previous[resource] : [];

  if (Array.isArray(data) && data.length > 0) {
    next[resource] = data;
  } else if (previousList.length > 0) {
    // Preserve the last good list — never downgrade to an empty array.
    next[resource] = previousList;
    kept += 1;
  } else {
    next[resource] = [];
    missing.push(resource);
  }
}

const total = RESOURCES.reduce((sum, resource) => sum + (next[resource]?.length ?? 0), 0);

if (total === 0) {
  console.warn("[snapshot] no public data available and no previous snapshot — nothing written.");
  process.exit(0);
}

const document = {
  _generated:
    "GENERATED - NEVER HAND-EDIT. Produced by `npm run snapshot:content` from the public API. Public data only; no secrets.",
  generatedAt: new Date().toISOString(),
  source: resolveBase(),
  counts: Object.fromEntries(RESOURCES.map((resource) => [resource, next[resource].length])),
  ...next,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, "utf8");

console.log(
  `[snapshot] wrote ${path.relative(root, OUTPUT)} — live=${live} kept=${kept}` +
    (missing.length ? ` empty=${missing.join(",")}` : "") +
    ` counts=${JSON.stringify(document.counts)}`,
);
