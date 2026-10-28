# FORENSIC 04 — Correctness & Data-Flow Forensics (Phase 4)

---

## 4.1 Single source of truth — hard-coded business copy in the frontend

Command: `grep -rn -E "10k\+|140\+|99\.9|4\.9|users|customers|clients" frontend/app frontend/components`

### UNBACKED-CLAIM items (no backend field feeds them)

| # | exact text | file:line | backed by any data source? |
|---|---|---|---|
| U1 | `10k+` / "users served" | `components/sections/Hero.tsx:34` (`{ value: 10, suffix: "k+", label: "users served" }`) | **NO** — `Visitor` model counts site visits, not users; nothing renders from it here |
| U2 | `140+` / "products shipped" | `Hero.tsx:35` (`{ value: 140, suffix: "+", label: "products shipped" }`) | **NO** — the API returned **4** products in this audit (`GET /api/products` → 4 records) |
| U3 | `99.9%` / "platform uptime" | `Hero.tsx:36` | **NO** — no uptime source exists anywhere |
| U4 | `4.9/5` "client rating" | `Hero.tsx:113` | **NO** — no ratings model, no testimonials model |
| U5 | `10k+ users onboarded` (second occurrence) | `Hero.tsx:135-137` (`<Counter value={10} suffix="k+" /> … users onboarded`) | **NO** |
| U6 | Avatar initials `AK`, `MR`, `TS` with `bg-primary` / `#2f5f9e` / `#4a5a8f` | `Hero.tsx:118-124` | **NO** — hard-coded pseudo-people; `TeamManager`/`Admin` data is never used |

**F-4-001 — SIX UNBACKED SOCIAL-PROOF CLAIMS ON THE HOMEPAGE (HIGH, CONFIRMED).**
All six are rendered in the first viewport of `/`. Two of them (`140+ products shipped` vs. 4 real
products; `10k+ users onboarded` vs. a visitor counter that is not even wired here) are
demonstrably inconsistent with the site's own data. This is exactly the class of claim
`PROJECT_NOTES.md §6` ("Backend is the single source of truth for business content") forbids.
Recommended fix (NOT APPLIED): derive from `/api/dashboard/stats` or remove.

### Hard-coded business copy that IS legitimate

| item | file:line | verdict |
|---|---|---|
| Headline "Technology that moves your business forward." | `Hero.tsx:21-28` | brand copy — acceptable |
| Sub-paragraph "Jazari Tech designs, builds and operates…" | `Hero.tsx:94-97` | brand copy |
| "Trusted technology partner" badge | `Hero.tsx:74` | brand copy, but it is itself an unverifiable social-proof phrasing |
| Service/product/logo copy | none hard-coded | **VERIFIED** — services come from `GET /api/services`, products from `GET /api/products`, logos from `GET /api/logos` (CHECK 62/63: one public source feeds grid + hub + footer) |
| Contact details / team | none in the public components checked | no hard-coded contact block found (`grep` for phone/email in `frontend/app` returned only metadata) |

---

## 4.2 Resilience chain — traced end to end

Code path (`frontend/lib/publicContent.ts`):

1. `:221-256` live API fetch with timeout;
2. on failure → `:142-161` `readCache()`; `:146` rejects when `parsed.v !== CACHE_VERSION`;
   `:148`/`:152` `removeItem` on schema or TTL failure — **an invalid cache IS rejected and
   deleted**, then execution falls through;
3. `:184-206` `loadSnapshot()` (memoised, `/content-snapshot.json`, any failure → `null`);
4. `:263-266` snapshot validated with `validateList` before use;
5. otherwise the caller renders the designed EMPTY or ERROR state.

**Reachability was proven by execution, not just reading** — harness suite [15]:

| check | what it forced | result |
|---|---|---|
| CHECK 65 | API unreachable, cache present | `state:"loaded", cards:14` (cache layer) |
| CHECK 66 | no cache, API down | `state:"loaded", cards:14` (snapshot layer) |
| CHECK 67 | no cache + no snapshot + API down | `state:"error", hasRetry:true, blank:false` |
| CHECK 68 | corrupted cache JSON | `state:"error", discarded:true` |
| CHECK 69 | API 200 with `[]` | `state:"empty"` (distinct text) |

**Cache schema v2 migration from v1:** there is no migration function. A v1 envelope fails
`parsed.v !== 2` at `publicContent.ts:146`, is removed at `:148`, and the data is refetched.
That is the correct degradation, but it means **the first load after a deploy briefly loses the
offline fallback**. Recorded as F-4-002 (LOW, CONFIRMED).

**Stale snapshot:** TTL is enforced on the *cache* (`:34` "A stale cache is worse than none"),
not on the snapshot — the snapshot has no expiry and is used indefinitely if the API stays down.
`generatedAt` is written but never read. **F-4-003 (LOW, CONFIRMED).**

**Snapshot missing at build time:** `snapshot-content.mjs:99` — "no public data available and no
previous snapshot — nothing written", exit 0. The previous file is preserved. Build never fails.
If the file were absent entirely, layer 3 simply returns `null` and layer 5 (error) is reached.

---

## 4.3 Service copy quality — the short-line fallback

Function: **`restingLine(service, maxLength = 92)` in `frontend/lib/serviceCopy.ts:55-88`.**

Exact rule, in order:
1. `shortDescription` trimmed and non-empty → returned verbatim (`:56-57`);
2. normalise whitespace on `description`;
3. first sentence (split on `[.!?] `) if `<= maxLength` → returned as-is;
4. search `text.slice(0, maxLength)` for the last `. ! ? , ; : — –` boundary at index `>= 40`
   (`RESTING_MIN_CLAUSE`) → cut there + `…`;
5. else cut at the last space `> 40` → trim trailing punctuation;
6. **if that leaves fewer than 2 words**, take the next word boundary, else fall back to the
   first sentence.

### Executed against the real function (not a re-implementation)

Command: `node --experimental-strip-types --input-type=module -e "import('./lib/serviceCopy.ts') …"`
(6 inputs, real export, exit 0):

| # | input `shortDescription` | input `description` | **actual output** | length |
|---|---|---|---|---|
| 1 | `""` | `Fast delivery of enterprise platforms for modern teams across the globe and beyond the horizon.` | `Fast delivery of enterprise platforms for modern teams across the globe and beyond the…` | 87 |
| 2 | `""` | `Strategy` | `Strategy` | 8 |
| 3 | `""` | `Strategy that works for growing businesses everywhere today.` | `Strategy that works for growing businesses everywhere today.` | 60 |
| 4 | `Pipelines` | `Any description is ignored when shortDescription exists.` | `Pipelines` | 9 |
| 5 | `"   "` (whitespace) | `A` | `A` | 1 |
| 6 | `""` | `Pipelines` | `Pipelines` | 9 |

**F-4-004 — THE "IMPROVED SHORT-LINE FALLBACK" STILL PRODUCES THE ORIGINAL SYMPTOM (MEDIUM, CONFIRMED).**
Cases 2, 4, 5 and 6 return exactly the one-word values `Strategy`, `Pipelines`, `A`, `Pipelines` —
the very "Fast / Strategy / Pipelines" symptom the change was meant to remove. Root cause: the
≥2-word guard (`serviceCopy.ts:81-87`) only runs **after** step 4/5; steps 1 and 3 return early,
and step 1 returns whatever the backend supplies.
`serviceCopy.ts:50-54` claims "never returns a single dangling word" — that claim is **false** for
short inputs. **This is a documentation over-claim plus a real gap.**
Recommended fix (NOT APPLIED): apply the ≥2-word rule to the early-return paths, or fix the data
in `seed-core.js`.

**Does the Task M improvement exist?** PARTIAL — the helper exists, is shared by hero / index /
hub (`restingLine` used at `ServicePreviewCard.tsx:194` with `maxLength` 120), and the
word-boundary logic is real. The improvement is genuine but **incomplete**.

---

## 4.4 Seed / prod parity — fields the UI requires

Fields the frontend now requires on a **service**: `slug`, `title`, `description`,
`shortDescription`, `highlights`, `category`, `accent`, `sortOrder`, `isVisible`, `icon`.

`Backend/scripts/seed-core.js:113-191` populates, for all 14 services, `shortDescription`,
`highlights`, `category`, `accent` (verified live: `GET /api/services` →
`count 14, withShortDesc 14, withCategory 14`).

`Backend/scripts/seed-prod.js` does **not** write content itself; `seed-prod.js:94` dynamically
imports `scripts/seed-core.js` ("Behavior and data are shared … so the two commands can never
diverge"). So production seeding does receive the new fields.

**But note the production gate:** `seed-prod.js` only seeds *sample products* when
`SEED_SAMPLE_CONTENT=true` (default **OFF**). **F-4-005 (MEDIUM, CONFIRMED).** After a fresh
production deploy with default flags, `GET /api/products` will return **0** products while
services return 14 — the product section will show its EMPTY state. The frontend tolerates this
(EMPTY is a designed state, CHECK 69 proves it for services), but the owner should expect it.

Fields seed does NOT populate that the UI can render:

| field | UI use | seed value |
|---|---|---|
| `Product.logoId` | Showcase Tile artwork | **null** in seed → tile renders the monogram fallback (CHECK 76e measured `monogram:true, tone:"none"`) |
| `Product.productUrl` | Visit link | **empty string** → CHECK 76e3 measured `href:null` (the link is honestly omitted) |
| `Service.shortDescription` | resting line | populated for all 14 |
| logos | marquee | 2 logos seeded (CHECK 12/13/14 exercised 0/1/3/12) |

---

## 4.5 Product logo pipeline

| property | evidence | status |
|---|---|---|
| `logoId` is a reference, not a copy | `models/Product.js:36` `ref: "Logo"` | VERIFIED-REAL |
| public projection shape | `productLogo.ts:6-7` documents `{id,url,displayName,alt,tone,hasAlpha,aspectRatio}` | VERIFIED-REAL |
| 409 when deleting a referenced logo | `logoController.js:448-451` | VERIFIED-REAL — smoke passes |
| `?detach=true` unlinks then deletes | `logoController.js:448` | VERIFIED-REAL — smoke passes |
| product pointing at a deleted logo | prevented by the 409; a *hard-deleted* logo (DB bypass) would leave `logoId` dangling → `productLogo.ts` returns `null` and the tile falls back to a monogram | PRESENT-UNTESTED (no check exercises a dangling ref) |
| orphan logos (asset left in storage after record delete) | `logoController.js:157-160` `deleteBoth` removes `publicId` **and** `originalPublicId`; create/update roll back on failure (`:232`, `:237`) | VERIFIED-REAL |
| 409 `details.products` forwarded | `errors.js:37` | VERIFIED-REAL |
| smoke coverage | `smoke.js:690-749` — 12 checks incl. invalid `logoId` → 400 with field detail, missing `logoId` → 400, no-`logoId` product → `logo:null`, 409, detach | VERIFIED-REAL |

**Gap:** no automated check creates a product whose `logoId` points at a *removed* document
(bypassing the 409), so the dangling-reference path is **PRESENT-UNTESTED**.

---

## 4.6 Fixtures and test data that could reach production

Command: `grep -n -i "fixture" frontend/scripts/verify-three.mjs`

**F-4-006 — THE HARNESS WRITES FIXTURE LOGOS INTO WHICHEVER API IT IS POINTED AT (HIGH, CONFIRMED).**
`verify-three.mjs:113-137` `ensureLogos()`:
1. reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` (falling back to `Backend/.env`),
2. `POST ${API}/auth/login` to get a real admin cookie,
3. if `GET /api/logos` returns fewer than 2 items, **creates two logos literally named
   `"Showcase Fixture A"` and `"Showcase Fixture B"`** via `POST /api/admin/logos`.
Guard: only when `logos < 2`.

Exploit/impact sketch: run the harness against production (or against a DB seeded with fewer than
two logos) and two obviously-named test logos are inserted into the customer-facing slideshow.
This is precisely the contamination prompt.md §0(a) warned about.
Recommended fix (NOT APPLIED): require an explicit `HARNESS_ALLOW_WRITES=true`, and refuse to
write when `NODE_ENV === "production"`.

In this audit the guard did **not** fire: the in-memory database already had 2 logos, and
`API_BASE` pointed at `http://localhost:5001/api`. Verified by `GET /api/logos` returning 2 before
the run.

Other fixtures: `verify-three.mjs:2178-2185` synthesises logo arrays **in memory** and serves them
through request interception (`serveLogos`) — never persisted. `:4799` injects a DOM node
(`#nav-occlusion-probe`) — page-local only. **No other write-to-API fixture exists.**

`grep -rn -i "Showcase Fixture|CDP Verification" Backend frontend --include=*.js --include=*.ts`
→ the only hit is the harness above. **No production seed script creates fixtures.**

---

## 4.7 Time, locale, edge cases

| area | finding | evidence | status |
|---|---|---|---|
| Timezone | `DashboardClient.tsx` hint says "Since 00:00 UTC" — the dashboard buckets by UTC, not the visitor's locale | `DashboardClient.tsx:18` | PRESENT-UNTESTED |
| Dates | `sitemap.ts:8` `lastModified: new Date()` — regenerated on every build, harmless | | INFO |
| i18n / RTL | no i18n library, no `dir` attribute; `<html lang="en">` fixed | `layout.tsx` | INFO — single locale by design |
| Empty string vs undefined | validators use `optional({ values: "falsy" })` so `""` is treated as absent; `productLogo.ts` normalises missing → `null` | `admin.routes.js:64,73-78` | VERIFIED-REAL |
| Pagination limits | `notificationController.js:88` `.limit(50)`; `submissionController.js:100`/`visitorController.js:85` use a paginated `find(filter)` builder; `productController.js:119` paginated | | PRESENT-UNTESTED for max page size |
| Unbounded queries | `logoController.js:214`, `teamController.js:57`, `templateController.js:16`, `serviceController.js:7` have **no `.limit()`** — bounded only by collection size (logos/services are small, admins are small) | | LOW |
| Max payload | `express.json({ limit: env.jsonBodyLimit })` = **15 mb** default; `express.urlencoded({ limit: "1mb" })`; image decoder caps at 8 MB (`storageService.js:68`) | `server.js:46-47` | VERIFIED-REAL |
| Regex from user input | `serviceCopy.ts` boundary search uses fixed literals; `authCookie.js:21` `/^(\d+)\s*(s|m|h|d)?$/i` is applied to config, not user input; validators are `express-validator` built-ins | | **no ReDoS candidate found** |

**F-4-007 — 15 MB JSON BODY LIMIT WITH AN 8 MB IMAGE RULE (LOW, CONFIRMED).** The two limits are
inconsistent: a body can be 15 MB while a single image is rejected at 8 MB. `DEPLOYMENT.md §10`
documents Vercel's own request-body limit as the binding constraint in production. Recorded so the
owner knows which limit actually bites.

---

## 4.8 Error contract

Backend codes (`Backend/utils/errors.js` + `errorHandler.js`):

| code | status | produced by |
|---|---|---|
| `BAD_REQUEST` | 400 | `ApiError.badRequest`, ValidationError, CastError, malformed JSON |
| `UNAUTHORIZED` | 401 | `ApiError.unauthorized` (`auth.js:47,53,59`) |
| `FORBIDDEN` | 403 | `ApiError.forbidden` (`auth.js:64`, role gate) |
| `NOT_FOUND` | 404 | `ApiError.notFound`, `notFoundHandler` |
| `CONFLICT` | 409 | `ApiError.conflict`, duplicate key (11000) |
| `RATE_LIMITED` | 429 | `rateLimiter.js:18` |
| `PAYLOAD_TOO_LARGE` | 413 | `errorHandler.js:26`, `storageService.js:71` |
| `INTERNAL_ERROR` | 500 | `ApiError.internal`, unhandled |
| `SERVICE_UNAVAILABLE` | 503 | `ApiError.serviceUnavailable` |
| `CONFIG_MISSING` | 503 | **frontend only** — `lib/authBff.ts:62-66` |

Frontend mapping (`frontend/lib/api.ts`):

* `:62-71` `ApiError { status, code, details }`;
* `:81-87` `messageForStatus()` covers **401, 403, 404, 429, >=500**;
* `:151` `error?.message || messageForStatus(...)` — the backend's own message wins when present;
* `:142` network → `NETWORK_ERROR`; `:236` → `TIMEOUT`; `:186` → `ABORTED`;
* `LoginForm.tsx:44` maps `CONFIG_MISSING` to a dedicated message.

**F-4-008 — `BAD_REQUEST`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `SERVICE_UNAVAILABLE` have no
dedicated frontend message (MEDIUM, CONFIRMED).** For these the UI shows whatever
`error.message` the backend returned (which is authored copy, so the UX is acceptable) — but the
`details` field-level map is only consumed by the form (`StartProjectForm`), so an admin screen
receiving a 409 shows the raw message text. Evidence: `grep` for those codes in
`frontend/lib|components|app` returns matches only for `CONFIG_MISSING`.

**Raw backend message reaching users:** yes, by design, at `lib/api.ts:151` and `:210`. In
production the backend replaces 5xx bodies with a generic string (`errorHandler.js:44-46`), so the
exposure is limited to authored 4xx copy. See F-3-009.
