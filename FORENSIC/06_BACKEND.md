# FORENSIC 06 — Backend Forensics (Phase 6)

---

## 6.1 Smoke test — REAL RUN

Exact commands (documented prerequisites followed; **no real database was touched**):

```
cd Backend && NODE_ENV=test RATE_LIMIT_MAX=5000 npm run smoke
```

Result:

```
[smoke] 234 passed, 0 failed
```

| metric | value |
|---|---|
| claimed baseline in the task | 222 |
| **actual measured** | **234 passed, 0 failed** |
| failures | none — `grep -c "✗"` on the log = **0** |
| harness self-description | `smoke.js` boots its **own** `MongoMemoryServer` (`smoke.js:155`), seeds it with `MONGODB_URI: uri` (`:159`), starts the API on `SMOKE_PORT` (default 5199) and sets `SUBMISSION_RATE_LIMIT_MAX: "40"` (`:179`) — test-only |

Pass/fail distribution across the run was monotonically increasing with no failures at any point
(log sampled at 121/0, 192/0, final 234/0).

**Also verified live before the run** (the DB-safety signature required by `prompt.md` §2a):

```
GET http://localhost:5001/api/health  → {"status":"ok","environment":"development","database":"connected"}
GET http://localhost:5001/api/products → 4 records (Jazari Commerce Suite, Jazari Flow, …)
GET http://localhost:5001/api/services → count 14, withShortDesc 14, withCategory 14
```
The signature is the SAFE one (4 sample products, 14 services with `shortDescription`), **not** the
dangerous one ("exactly one product named Irhas'Inn Ecommerce Store"). The backend under test was
`npm run dev:mem -- --seed` with an ephemeral in-memory MongoDB on port 5001.

---

## 6.2 Controller review

### Async error handling — VERIFIED-REAL

`Backend/utils/asyncHandler.js`:
```js
export const asyncHandler = (handler) =>
  function wrapped(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
```
Every controller export is wrapped — counts of `asyncHandler(` per file:
`authController 5, dashboardController 2, logoController 12, notificationController 6,
productController 8, pushController 4, serviceController 2, submissionController 7,
teamController 7, templateController 5, visitorController 3` = **61 wrapped handlers, 0 unwrapped
async exports found.** Under Express 5 an unhandled rejection in a handler reaches
`errorHandler` instead of hanging. VERIFIED-REAL.

### Missing `await`

`grep -B2 "await"` sweep found no floating promises: every `await` is inside a wrapped handler,
and the two places that intentionally do not await use `.catch(() => {})` on a cleanup
(`logoController.js:232,237` — rollback of already-uploaded assets) or `void`
(`ServicesIndex`-side equivalents are frontend).

### Unhandled rejections

`process.on("unhandledRejection")` is **not registered** in `server.js`. Node's default (crash)
applies. Low risk because every async path is wrapped.

**F-6-001 — NO `unhandledRejection` / `uncaughtException` HANDLER (LOW, CONFIRMED).**
`grep -n "unhandledRejection\|uncaughtException" Backend/server.js` → no matches.
A stray rejection anywhere outside `asyncHandler` kills the process (locally) or the serverless
instance (Vercel). Recommended fix (NOT APPLIED): log-and-keep-alive for `unhandledRejection`.

### Transactions where multi-write consistency matters

`grep -rn "startSession|session|transaction" Backend/controllers Backend/models` → **no MongoDB
transactions anywhere.**

| multi-write path | how consistency is handled | verdict |
|---|---|---|
| logo create: upload original → process → upload → `Logo.create` | on `create` failure, `deleteImage(processed)` + `deleteImage(original)` with `.catch(() => {})` (`logoController.js:231-238`) | best-effort compensation, **not** atomic. If the process dies between upload and create, an orphan asset remains |
| logo update (image replacement) | previous ids captured, new ids written, old deleted after success | same pattern |
| logo delete (409 + detach) | single document per operation; `?detach=true` updates products then deletes the logo — **two collections, no transaction** | **F-6-002** |
| product delete | single doc | fine |

**F-6-003 — `?detach=true` IS NOT ATOMIC ACROSS TWO COLLECTIONS (MEDIUM, CONFIRMED).**
`logoController.js:448-…` updates every referencing `Product` (`logoId → null`) and then deletes
the `Logo`. Without a transaction, a crash between the two leaves products pointing at a deleted
logo — the dangling-reference path that 4.5 marked PRESENT-UNTESTED. `Product.logoId` has no
`onDelete` guard and no `validate` hook checking existence.
Recommended fix (NOT APPLIED): wrap in `mongoose.startSession()` + `withTransaction`, or add a
model-level `validate` that resolves the ref.

### N+1 queries

No `for … of … await find()` loops in controllers. `notificationController.js:27` does a single
`PushSubscription.find(filter)`. `logoController.js:449` a single
`Product.find({ logoId: logo._id }).select("name")`. **No N+1 found.**

### Unbounded finds

| call | limit | note |
|---|---|---|
| `logoController.js:175` `Logo.find({ isVisible: true })` | none | public marquee — bounded by logo count (small) |
| `logoController.js:214` `Logo.find().sort(...)` | none | admin list |
| `productController.js:96` `Product.find({ isPublished: true })` | none | public showcase |
| `serviceController.js:7` `Service.find({ isVisible: true })` | none | public index (14 rows) |
| `teamController.js:57` `Admin.find().sort(...)` | none | super-admin only, small table |
| `notificationController.js:88` | `.limit(50)` | OK |
| `submissionController.js:100`, `visitorController.js:85`, `productController.js:119` | paginated builder | OK |

**F-6-004 — PUBLIC COLLECTION ENDPOINTS ARE UNBOUNDED (LOW, CONFIRMED).**
`GET /api/logos`, `/api/products`, `/api/services` return the whole collection with no `limit`.
Today the collections are tiny (2 / 4 / 14). If an admin ever creates 5 000 products the public
homepage payload grows linearly with no server-side cap. Recommended fix: server-side cap + total.

### Missing indexes for queried fields

Existing: `Logo.publicId` unique, `ProductTypeTemplate.type` unique, `PushSubscription.endpoint`
unique, `Submission` referenceId unique+indexed, `AuditLog.action` indexed, `Admin.email` unique,
`Service.slug` unique.
`Product.logoId` has `ref` but **no index** — `logoController.js:449` runs
`Product.find({ logoId: … })` on every logo delete. `Visitor` dedupe query
(`visitorController.js:22`) has no supporting index visible in the model.
**F-6-005 (LOW, CONFIRMED).**

### Regex built from user input (ReDoS)

`grep -rn "new RegExp" Backend --include=*.js` → **no matches.** All regexes are literals applied
to config or fixed strings. **No ReDoS candidate.**

### JSON size limits

`server.js:46` `express.json({ limit: env.jsonBodyLimit })` → default **15 mb**;
`server.js:47` `express.urlencoded({ extended: true, limit: "1mb" })`.
`entity.too.large` is normalised to `413 PAYLOAD_TOO_LARGE` (`errorHandler.js:26`).

---

## 6.3 Serverless readiness (Vercel)

| concern | evidence | verdict |
|---|---|---|
| connection caching across invocations | `config/db.js:10-14` keeps the in-flight promise on `globalThis.__jazariDb`; returns immediately when `readyState === 1`; clears the cache on failure so a later request retries | VERIFIED-REAL (the documented Vercel pattern) |
| lazy connection at request time | `middleware/ensureDb.js` mounted **after** `/api/health` in `routes/index.js:11-12`; returns `503 DATABASE_UNAVAILABLE` instead of `process.exit` | VERIFIED-REAL |
| eager startup suppressed on Vercel | `server.js:106` `if (!process.env.VERCEL) start();` | VERIFIED-REAL |
| export shape for the Express preset | `server.js:65` `export default app;` + `Backend/vercel.json` `{"framework":"express","fluid":true}` | VERIFIED-REAL |
| in-memory state that breaks across instances | `grep "new Map()\|new Set()\|globalThis\|let cache\|memo"` in controllers/middleware/services → **only per-request `new Map()` inside `imageProcessor.js:72,119,252`** (histogram buckets for one image) | VERIFIED-REAL — no cross-request memory state |
| rate limiter | `express-rate-limit` default store is **in-process** — correct only for a single instance | see F-6-006 |
| filesystem writes | `storageService.js` writes to `LOCAL_UPLOAD_DIR` **only when the Cloudinary driver is off**, and that path logs `development only` (`storageService.js:44`) | VERIFIED-REAL (production uses Cloudinary) |
| long-running tasks / timeouts | none; sharp processing is bounded by the 8 MB input cap | VERIFIED-REAL |
| sharp binary compatibility | `sharp@0.35.5` installed and exercised by the smoke test's image pipeline (`smoke.js` suite 9b) — **on this Windows x64 machine** | NOT VERIFIED for Vercel's Linux `nodejs20.x`/`nodejs22.x` runtime |
| body-size vs upload needs | 15 mb JSON limit vs Vercel's own request-body cap documented at `DEPLOYMENT.md §10` | see F-4-007 |
| web-push in `serverless` | `web-push` sends are awaited inside the notification POST handler; the payload is one HTTP request per subscription | PRESENT-UNTESTED — sending to N subscriptions inside one invocation could exceed the function timeout for large lists |

**F-6-006 — RATE LIMITER STATE IS PER-INSTANCE (MEDIUM, CONFIRMED).**
`Backend/middleware/rateLimiter.js` uses `express-rate-limit` with no `store` option, so the
counter lives in the function's memory. Behind Vercel's serverless instances each instance counts
separately, and counters reset on cold start. The `RateLimit-*` headers I measured
(`RateLimit-Limit: 5000; RateLimit-Remaining: 4982`) come from that in-memory counter.
Impact: `LOGIN_RATE_LIMIT_MAX = 10` is effectively "10 per instance per 15 min", not 10 total —
a brute-force attacker gets 10 attempts against every concurrent instance.
Recommended fix (NOT APPLIED): a shared store (Upstash/KV) or an edge-level limiter.

**F-6-007 — `sharp` ON THE VERCEL LINUX RUNTIME IS NOT VERIFIED (NOT VERIFIED).**
The pipeline passed on this Windows machine only. `DEPLOYMENT.md` documents no `sharp` platform
consideration. Report as unproven rather than assumed-working.

---

## 6.4 Cloudinary / sharp pipeline

| step | code | verdict |
|---|---|---|
| upload validation | `storageService.js:50-74` — mime allow-list, base64 shape, **8 MB** cap | VERIFIED-REAL |
| transformations | `imageProcessor.js:49-51` auto-orient + resize inside bounds, no upscaling; `:411` re-bound after processing; Cloudinary path adds `format:"png"` + `quality:auto` (`storageService.js:167`) | VERIFIED-REAL |
| deletion on record delete (orphans) | `logoController.js:157-160` `deleteBoth` removes `publicId` **and** `originalPublicId`; create/update roll back on failure | VERIFIED-REAL |
| `hasAlpha` / `aspectRatio` correctness | `imageProcessor.js:245` "Compute display metadata from the final RGBA buffer" → alpha comes from the real RGBA data, not metadata guessing; `:415` `ensureAlpha()` before the raw read | PRESENT-UNTESTED (no harness check asserts `hasAlpha`/`aspectRatio` numerically) |
| `backgroundStatus` confidence | documented at `PROJECT_NOTES.md §28` (`:1219`) and produced at `imageProcessor.js` | PRESENT-UNTESTED |
| `tone` classification | documented `PROJECT_NOTES.md §1225`; consumed by `productLogo.ts` (`light`/`dark`/else → `none`) | PRESENT-UNTESTED numerically, but exercised end-to-end by CHECK 76e (`tone:"none"` for a logo-less product) |

**F-6-008 — THE IMAGE PIPELINE HAS NO ASSERTED OUTPUT CONTRACT (LOW, CONFIRMED).**
`smoke.js` suite `9b. logo image processing pipeline` proves the round trip works (upload →
public list → hide → replace → delete), but no check asserts that `hasAlpha` is `true` exactly
when the source has transparency, nor that `aspectRatio` equals width/height. The frontend's
tone-aware staging depends on both. Recommended fix: add two smoke assertions comparing against a
known PNG-with-alpha fixture.

---

## 6.5 Logging — does anything log secrets?

Command:
```
grep -rn "console.(log|info|warn|error|debug)" Backend --include=*.js | grep -v scripts/ \
  | grep -iE "req.body|cookie|authorization|password|token|secret"
```
Result: **no matches.** (Exit 0, empty output.)

Additional targeted checks:

| risk | result |
|---|---|
| `morgan` access log | `server.js:45` `if (!env.isTest) app.use(morgan(env.logFormat))` — default format `combined` in production, which logs method, path, status, user-agent, referrer — **not** cookies, bodies or the `Authorization` header |
| error handler | `errorHandler.js:45-46` logs `method + originalUrl + status` and the **stack** to the server console — a stack can contain local variable *names* but not values; it is never sent to the client |
| `db.js` | logs only `[db] connected` / `[db] connection failed: ${error.message}` — a Mongo driver error message can contain the **host list** of a `mongodb+srv://` URI, though normally not the credentials |
| `env.js` | prints only variable **names** in its problem list, never values |
| `seed-prod.js` | explicitly extracts only the database **name** from the URI (`seed-prod.js:38-49`) and refuses to print the connection string |
| BFF | `authBff.ts` "Attribute-free and value-free — nothing is logged here" (`:166-169`) |
| auth | `auth.js` never logs; `authController` never logs the password |

**F-6-009 — MORGAN LOGS THE FULL URL INCLUDING QUERY STRINGS (INFO, CONFIRMED).**
`?detach=true` and any future token-in-query would land in the access log. Today no endpoint puts
a secret in the query string. Recorded as a constraint, not a live leak.

**Verdict: no password, cookie, token, JWT or VAPID private key is logged anywhere in the backend
source.** VERIFIED by grep.

---

## 6.6 Models vs migrations — schema changes with no migration script

`grep -rn "migrate|migration" Backend` → **no matches. There is no migration framework.**

| schema change introduced by a past task | migration script? | real-world effect |
|---|---|---|
| `Product.logoId` (new optional field) | none | backward compatible — legacy products simply project `logo: null` (smoke: `product without logoId is valid`) |
| `Service.shortDescription` / `highlights` / `category` / `accent` | none | **old documents lack them.** `seed-core.js` must be re-run (it is idempotent) or the fields stay absent in a pre-existing production DB |
| `Service.accent` / `category` → grouping + `serviceAccent()` | none | absent → `serviceAccent` returns `blue`, `serviceCategory` returns `null` → "ungrouped" (by design, `serviceCopy.ts:19-21`) |
| cache schema **v1 → v2** (frontend) | none (see F-4-002) | v1 entries are rejected and deleted, refilled from API/snapshot |
| `Notification` model (Task J) | none | new collection, created lazily by Mongoose |
| `PushSubscription` model | none | same |

**F-6-010 — NO MIGRATION STORY FOR EXISTING PRODUCTION DATA (MEDIUM, CONFIRMED).**
The code tolerates every missing field, but a production database seeded **before** Task K/L/M
will serve services **without** `shortDescription`, `category` and `accent` until
`npm run seed:prod` is re-run. The visible result is exactly the "Fast / Strategy / Pipelines"
symptom (F-4-004), because the fallback then runs on `description` instead of a designed line.
This is the single most likely cause of copy looking wrong in production after deploy.
Recommended fix (NOT APPLIED): document "re-run seed:prod after every schema-adding task" as a
mandatory deploy step (it is mentioned at `DEPLOYMENT.md:727` but not tied to a version).
