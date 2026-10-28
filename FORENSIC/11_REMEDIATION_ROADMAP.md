# FORENSIC 11 — Remediation Roadmap (PROPOSAL ONLY)

**Nothing in this file was started.** It is a prioritised plan. Each group is one future task
("Fix-N") with scope, files, risk, effort, dependencies and the check that would prove it done.

Effort: S = under an hour · M = a day or two · L = multi-day.

---

## Fix-1 — Security (do first)

### Fix-1a · Dependency remediation
* **Scope:** upgrade `next` `16.3.8` → `16.4.3`+ (3 advisories, 1 critical); `npm audit fix` in
  `Backend/` for `body-parser`.
* **Files:** `frontend/package.json`, `frontend/package-lock.json`, `Backend/package-lock.json`.
* **Risk:** MEDIUM — a Next major/minor jump can change build output and route behaviour.
* **Effort:** M · **Depends on:** nothing.
* **Proof:** `npm audit --omit=dev` exits 0 in both packages; `npm run lint`, `npx tsc --noEmit`,
  `npx next build`, `npm run verify:bff` (21/21), full harness ≥ 301/308.

### Fix-1b · Frontend security headers
* **Scope:** add CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`,
  `X-Content-Type-Options`, `Permissions-Policy` to every frontend response; suppress
  `X-Powered-By`.
* **Files:** `frontend/next.config.ts` (`headers()`).
* **Risk:** MEDIUM — an over-strict CSP breaks inline scripts (the theme bootstrap at
  `layout.tsx:126` and JSON-LD at `:127` must be allowed).
* **Effort:** M · **Depends on:** nothing.
* **Proof:** `curl -D - http://localhost:3001/` shows the headers; harness extended with a new
  check asserting them; homepage still renders with no console errors.

### Fix-1c · CSRF origin check
* **Scope:** reject mutating requests (`POST/PUT/PATCH/DELETE`) whose `Origin` header is present
  and not in `CLIENT_ORIGIN`.
* **Files:** `Backend/middleware/` (new `csrfGuard.js`), `Backend/server.js`.
* **Risk:** LOW — must allow requests with no `Origin` (curl, server-to-server) exactly as the
  CORS callback already does.
* **Effort:** S · **Depends on:** nothing.
* **Proof:** new smoke checks — allowed origin → 200; disallowed origin → 403; no origin → 200.

### Fix-1d · SVG upload removal
* **Scope:** drop `image/svg+xml` from `ALLOWED_TYPES`, or re-encode uploaded originals to PNG.
* **Files:** `Backend/services/storageService.js:13`.
* **Risk:** LOW (admin-only upload path).
* **Effort:** S · **Depends on:** nothing.
* **Proof:** new smoke check — an SVG data-URI upload → 400 with a clear message.

### Fix-1e · Rate limiting hardening
* **Scope:** warn when `RATE_LIMIT_MAX` is set high in production; add a shared/edge store or
  document the per-instance limitation; consider per-account login backoff.
* **Files:** `Backend/config/env.js`, `Backend/middleware/rateLimiter.js`,
  `DEPLOYMENT.md §8`.
* **Risk:** LOW · **Effort:** M · **Depends on:** owner decision on a KV provider (use
  `gravity_index` to pick one before implementing).
* **Proof:** smoke check for the warning; a documented test showing 11 logins across two
  instances are both rejected.

### Fix-1f · `DIAGNOSTICS` + `AUTH_DEBUG_HEADERS` operational guard
* **Scope:** add both names to `DEPLOYMENT.md §8` and to the post-deploy checklist (§12).
* **Files:** `DEPLOYMENT.md`.
* **Risk:** NONE (docs only — this audit must not touch docs; a later task does).
* **Effort:** S · **Proof:** `grep -n DIAGNOSTICS DEPLOYMENT.md` returns the row.

---

## Fix-2 — Truth, docs and numbers

### Fix-2a · README §9 removal/marking
* **Scope:** delete or mark superseded `README.md` §9 (lines 241-280) and every stale `three/`
  reference (`:8, :246, :252, :261, :263, :277-280, :294, :356-360, :493`); fix the `271 checks`
  number at `:132`.
* **Files:** `README.md`.
* **Risk:** NONE · **Effort:** S · **Depends on:** nothing.
* **Proof:** `grep -n "components/three\|WebGL layer" README.md` → only historical mentions
  explicitly marked as deleted.

### Fix-2b · PROJECT_NOTES staleness
* **Scope:** mark `§38.6` (`:2662`, `:2666`) as superseded by `§42`; add `S8r` to `§50`;
  reconcile `:2684` (CHECK 83) with `§41`.
* **Files:** `PROJECT_NOTES.md` (**append-only, via a temp file, tail-verified**).
* **Risk:** NONE (this is exactly the partial-write hazard — follow the append rule).
* **Effort:** S · **Proof:** `git diff --stat PROJECT_NOTES.md` shows insertions only.

### Fix-2c · Harness header + smoke count
* **Scope:** correct `verify-three.mjs:19` ("no hover affordance") and `:26` ("81 assertions" →
  live number).
* **Files:** `frontend/scripts/verify-three.mjs` (comments only).
* **Risk:** LOW — never touch an assertion while doing this.
* **Effort:** S · **Proof:** `node --check` passes; full harness unchanged at 301/308.

### Fix-2d · `DEPLOYMENT.md` build-time truth
* **Scope:** rewrite `:698` to state precisely which parts of `BACKEND_ORIGIN` are build-time
  (the `/api` rewrite) and which are runtime (the BFF); add `BACKEND_ORIGIN`/`DIAGNOSTICS` to
  §8; add "clear the build cache when any `NEXT_PUBLIC_*` or `BACKEND_ORIGIN` changes"; strip
  guidance for an `/api` suffix.
* **Files:** `DEPLOYMENT.md`.
* **Risk:** NONE · **Effort:** M · **Depends on:** Fix-3a (so the documented behaviour is real).
* **Proof:** a fresh build with `BACKEND_ORIGIN` set shows the rewrite in
  `routes-manifest.json`, and `curl /api/services` on the frontend origin returns JSON.

### Fix-2e · Remove the six unbacked claims
* **Scope:** replace `Hero.tsx:34-36`, `:113`, `:135-137`, `:118-124` with backend-derived
  numbers (e.g. product count from `/api/products`) or delete them.
* **Files:** `frontend/components/sections/Hero.tsx`, possibly `Backend/controllers/dashboardController.js`.
* **Risk:** LOW (content change; owner must approve the copy).
* **Effort:** M · **Depends on:** owner decision on what claim, if any, is defensible.
* **Proof:** a new harness check asserting every numeric claim on `/` equals an API value.

---

## Fix-3 — Deployment correctness

### Fix-3a · Make the rewrite build-proof
* **Scope:** either validate `BACKEND_ORIGIN` at build (fail loudly if it is missing in
  production) or move the proxy to a middleware/`route.ts` that reads it at runtime.
* **Files:** `frontend/next.config.ts`, possibly `frontend/middleware.ts`.
* **Risk:** MEDIUM — changing proxy mechanics touches the auth cookie path.
* **Effort:** M · **Depends on:** nothing.
* **Proof:** build **without** `BACKEND_ORIGIN` in production mode fails with a clear message;
  build **with** it proxies correctly (verify-bff 21/21 still passes).

### Fix-3b · Normalise `BACKEND_ORIGIN`
* **Scope:** strip a trailing `/api` as well as trailing slashes; log the resolved destination
  once at build.
* **Files:** `frontend/next.config.ts:21`.
* **Risk:** LOW · **Effort:** S · **Proof:** a unit-style check in `verify-bff.mjs` asserting the
  destination for `https://h/api` and `https://h/` are identical.

### Fix-3c · Snapshot determinism
* **Scope:** stop rewriting `content-snapshot.json` when nothing changed (hash the content), or
  move it to an ignored path.
* **Files:** `frontend/scripts/snapshot-content.mjs`.
* **Risk:** LOW · **Effort:** S · **Proof:** run `npm run build` twice; `git status --porcelain`
  empty both times.

---

## Fix-4 — Task M completion

### Fix-4a · S8n — 2 of 14 services never open the preview
* **Scope:** isolate `web-development` and `automation` (single-row repro), find why the card
  does not open, fix it.
* **Files:** `frontend/components/services/ServicesIndex.tsx` (open/close timers, anchor rect),
  possibly `ServicePreviewCard.tsx`.
* **Risk:** MEDIUM — this is the flagship interaction.
* **Effort:** M · **Depends on:** a repro (run the harness with a filter for suite [20]).
* **Proof:** `CHECK S8n` passes in two consecutive full runs.

### Fix-4b · S8q — preview does not open under `prefers-reduced-motion`
* **Scope:** same root cause family as 4a, or a reduced-motion-specific branch that suppresses
  the open.
* **Files:** as above.
* **Risk:** MEDIUM (accessibility) · **Effort:** M · **Depends on:** 4a investigation.
* **Proof:** `CHECK S8q` passes.

### Fix-4c · S8p / S8r
* **Scope:** after 4a/4b, re-run; if S8p still reports `cards=0`, fix the re-open loop; make S8r
  sample rows that are known-open.
* **Files:** `frontend/scripts/verify-three.mjs` (assertion logic only — **never weaken a
  threshold**) and the component if the bug persists.
* **Risk:** LOW · **Effort:** S · **Depends on:** 4a, 4b.

### Fix-4d · S8o — reconcile the check with the deliberate prefetch
* **Scope:** decide: either remove the idle warm-up (and lose first-hover smoothness) or change
  the assertion to "≤ 3 scenes warmed at idle, the hovered row's own chunk fetched on demand".
* **Files:** `frontend/scripts/verify-three.mjs` **or** `ServicesIndex.tsx:214-221`.
* **Risk:** LOW · **Effort:** S · **Depends on:** owner preference.
* **Proof:** whichever way it is resolved, the check passes **and** is documented in §50.

### Fix-4e · Frame budget calibration
* **Scope:** replace the absolute `dropped <= 3` with `dropped <= idleDropped + 3` (or document
  that the budget is hardware-specific); keep the long-task check absolute.
* **Files:** `frontend/scripts/verify-three.mjs` (L58/L59 only).
* **Risk:** LOW — this is a **calibration**, and must be justified in the retired-check ledger,
  not a silent weakening.
* **Effort:** S · **Proof:** three consecutive full runs with the same result.

---

## Fix-5 — Copy and data correctness

### Fix-5a · `restingLine` single-word outputs
* **Scope:** apply the ≥2-word guard to the early-return paths, or ensure `shortDescription` is
  never one word in `seed-core.js`.
* **Files:** `frontend/lib/serviceCopy.ts:55-88`, `Backend/scripts/seed-core.js`.
* **Risk:** LOW · **Effort:** S · **Depends on:** nothing.
* **Proof:** a unit check executing the six cases in FORENSIC/04 §4.3, all returning ≥2 words or
  a designed value.

### Fix-5b · Production seed parity
* **Scope:** decide `SEED_SAMPLE_CONTENT` for production; document that `npm run seed:prod` must
  be re-run after any task that adds optional service/product fields.
* **Files:** `DEPLOYMENT.md`, owner's Vercel env.
* **Risk:** LOW · **Effort:** S · **Proof:** production `GET /api/services` returns
  `shortDescription` on all 14.

### Fix-5c · Logo detach atomicity
* **Scope:** wrap the detach+delete in `mongoose.startSession().withTransaction()`, or add a
  `Product` pre-validate hook that rejects a dangling `logoId`.
* **Files:** `Backend/controllers/logoController.js`, `Backend/models/Product.js`.
* **Risk:** MEDIUM (Mongo transactions require a replica set — Atlas qualifies).
* **Effort:** M · **Depends on:** nothing.
* **Proof:** new smoke check that simulates a failure between the two writes.

---

## Fix-6 — Harness hygiene

| id | scope | effort |
|---|---|---|
| Fix-6a | Gate `ensureLogos()` behind `HARNESS_ALLOW_WRITES=true` and refuse when `NODE_ENV=production` (F-4-006) | S |
| Fix-6b | Wire `verify-three.mjs` (and the two capture scripts) to npm scripts; delete `tmp-hero-m.mjs` and `tmp-tile.css` (F-2-009, F-2-005) | S |
| Fix-6c | Make the Chrome debug port configurable with an automatic fallback (F-7-004) | S |
| Fix-6d | Add checks for: frontend security headers, the mobile bottom sheet, `hasAlpha`/`aspectRatio`, a dangling `logoId`, and `npm audit` in CI (coverage gaps, 07 §7.4) | M |
| Fix-6e | Fix S8p's vacuous heap assertion (F-7-002) | S |

---

## Suggested ordering

| order | group | why |
|---|---|---|
| 1 | Fix-1a (deps) | a published critical RCE on the public site |
| 2 | Fix-3a + Fix-3d (build-time `BACKEND_ORIGIN`) | a silent production misconfiguration |
| 3 | Fix-2e (unbacked claims) | the public site currently states things its own data contradicts |
| 4 | Fix-4a + Fix-4b | two real, reproducible user-visible failures |
| 5 | Fix-1b (headers), Fix-1c (CSRF), Fix-1d (SVG) | cheap hardening |
| 6 | Fix-2a–2d (docs truth) | restores trust in the docs |
| 7 | Fix-5a–5c (copy + data) | makes production copy correct |
| 8 | Fix-6 (harness hygiene) | stops the next audit from being this expensive |
| 9 | Fix-1e, Fix-3b, Fix-3c, Fix-4c–4e | lower priority |

**Total: 9 groups, 23 individual changes. None of them was started in this task.**
