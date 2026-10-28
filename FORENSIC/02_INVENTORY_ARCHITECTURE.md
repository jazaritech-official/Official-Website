# FORENSIC 02 — Inventory & Architecture Map (Phase 2)

Read-only audit of the working tree at HEAD `19b41e28bb51187a4ab916e28cb5f6569a77365d`.
Every count below comes from a command quoted in this file.

---

## 2.1 Tracked tree inventory

Command: `git ls-files | wc -l` → **218 tracked files**.

| Top-level dir | tracked files |
|---|---|
| frontend | 153 |
| Backend | 60 |
| root files (.gitignore, DEPLOYMENT.md, PROJECT_NOTES.md, prompt.md, README.md) | 5 |

Command: `git ls-files | sed -E 's/.*\.([a-zA-Z0-9]+)$/\1/' | sort | uniq -c | sort -rn`

| extension | count |
|---|---|
| tsx | 79 |
| js | 55 |
| ts | 28 |
| png | 16 |
| mjs | 12 |
| md | 7 |
| json | 7 |
| svg | 5 |
| gitignore | 3 |
| css | 3 |
| ico | 1 |
| gitkeep | 1 |
| example | 1 |

Line counts per area (`git ls-files <dir> | xargs wc -l`, tracked text only):

| area | lines |
|---|---|
| frontend/components | 13627 |
| frontend/scripts | 8215 |
| frontend/app | 5893 |
| Backend/scripts | 2083 |
| Backend/controllers | 1659 |
| frontend/lib | 1327 |
| Backend/models | 768 |
| Backend/services | 767 |
| Backend/routes | 479 |
| Backend/utils | 377 |
| Backend/middleware | 283 |
| frontend/hooks | 507 |
| frontend/types | 415 |
| root *.md | 4663 (DEPLOYMENT 741, PROJECT_NOTES 3232, README 553, prompt 137) |

**F-2-001 — LARGE ASSETS (MEDIUM, CONFIRMED).** Ten tracked PNGs exceed 1 MB.
Command: `git ls-files | xargs stat -c%s` filtered `>1048576`.

| bytes | path |
|---|---|
| 3939107 | frontend/public/Primary Logo.png |
| 3939107 | frontend/public/brand/logo-stacked.png |
| 2535745 | frontend/public/Icon.png |
| 2535745 | frontend/public/brand/logo-icon.png |
| 2535745 | frontend/public/brand/app-icon-light.png |
| 2535745 | frontend/public/brand/app-icon-dark.png |
| 2480742 | frontend/public/Main Logo.png |
| 2218897 | frontend/public/Icons.png |
| 2076908 | frontend/public/Horizontal Logo.png |
| 2076908 | frontend/public/brand/logo-horizontal.png |

**F-2-002 — EXACT DUPLICATE MULTI-MB ASSETS (MEDIUM, CONFIRMED).** sha256 proves byte-identical
copies ship in the repo:

| sha256 (first 16) | identical files |
|---|---|
| bb18c5542cb8cf88 | Primary Logo.png = brand/logo-stacked.png |
| b422ba8e9700df2b | Icon.png = brand/logo-icon.png = brand/app-icon-light.png = brand/app-icon-dark.png |
| a2dfe000f3acd6af | Horizontal Logo.png = brand/logo-horizontal.png |

Total duplicated bytes from these three groups alone: 3939107 + (4 x 2535745) + 2076908 = 16 157 703 B
(note app-icon-dark/light/logo-icon/Icon are one 2 535 745-B value counted four times).
Also: the root-level "Primary Logo.png" / "Main Logo.png" / "Icons.png" / "Horizontal Logo.png" files
are NOT referenced by any source file (see 2.2).

**F-2-003 — MIXED LINE ENDINGS (LOW, CONFIRMED).** CRLF line counts (`grep -c $'\r'`) on tracked
text files: `PROJECT_NOTES.md` 3232 (all lines CRLF), `DEPLOYMENT.md` 741, `README.md` 553,
`frontend/app/globals.css` 5046, `frontend/scripts/verify-three.mjs` 5244,
`frontend/components/sections/HeroMark.tsx` 639, `StartProjectForm.tsx` 944, and more.
Most source files are CRLF. `Backend/` JS files and several frontend `.ts` files are LF.
The tree is a CRLF/LF mixture repo-wide; no file has a NUL byte
(command: `grep -qP '\x00'` over all tracked `.md/.js/.mjs/.ts/.tsx/.css/.json` → no matches).

**F-2-004 — NO TRUNCATED FINAL LINES DETECTED.** All 16 tracked `.js/.mjs` scripts pass
`node --check` (see FORENSIC/00 Phase 0.3). No parse failures anywhere in tracked JS.

---

## 2.2 Frontend map

### 2.2.1 Routes (`git ls-files frontend/app`)

| route | build mode (from `npx next build` route table) |
|---|---|
| `/` | static |
| `/_not-found` | static |
| `/admin/account`, `/admin/dashboard`, `/admin/logos`, `/admin/notifications`, `/admin/product-presets`, `/admin/products`, `/admin/submissions`, `/admin/team`, `/admin/visitors` | static |
| `/admin/login` | dynamic |
| `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/password` | dynamic |
| `/api/diag-session` | dynamic |
| `/apple-icon.png`, `/icon.png`, `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml` | static |

Total emitted routes: 22. There is **no** `app/error.tsx`, `app/not-found.tsx` (the built
`/_not-found` is Next's default), `app/loading.tsx`, or per-segment `error.tsx`/`loading.tsx`.
`app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` exist as real files.

### 2.2.2 Components, hooks, libs, styles, assets

- Components: 71 `.tsx` files under `frontend/components/`.
- Hooks: `useApiData`, `useAsync`, `usePushNotifications`, `useReducedMotion`, `useTheme`, `useTilt` (6).
- Lib: `api.ts`, `authBff.ts`, `imagePrep.ts`, `productLogo.ts`, `publicContent.ts`, `push.ts`,
  `serviceCopy.ts` (7).
- Types: `types/api.ts`. CSS: `app/globals.css`, `components/services/scenes/scenes.css`
  (plus an untracked stray `frontend/tmp-tile.css` on disk — see below).
- Public assets: 21 tracked files under `frontend/public/`.

### 2.2.3 Import graph — dead modules

Method: for every tracked `frontend/components/**/*.tsx`, count files under
`frontend/app|components|hooks` whose source contains `/<Basename>` (extensionless import path),
excluding the file itself.

**DEAD (0 importers):**

| file | evidence |
|---|---|
| `frontend/components/icons/index.tsx` | 0 importers (command above) |
| `frontend/components/motion/Marquee.tsx` | 0 importers (`LogoMarquee.tsx` does not import it) |
| `frontend/hooks/useTilt.ts` | 0 importers — Task L required "Remove tilt-card/useTilt from services" |

**F-2-005 — DEAD CODE KEPT (LOW, CONFIRMED).** `hooks/useTilt.ts` (58 lines, contains a
`requestAnimationFrame` loop), `components/motion/Marquee.tsx`, `components/icons/index.tsx` are
present and unreferenced. Everything else in `components/` has at least one importer.

**F-2-006 — STRAY WORKSPACE FILES (INFO, CONFIRMED).** Untracked/ignored files present on disk but
not in git: `frontend/tmp-tile.css`, `frontend/tsconfig.tsbuildinfo`, `.baseline-wt/frontend/`
(known leftover named in prompt.md §e), `.vercel/`, `.freebuff/`, `.env.local` (root),
`frontend/.env.local`, `Backend/.env`, `frontend/test-output/`, `frontend/.next/`, `node_modules/`.
`prompt.md` §e explicitly orders deletion of temp artifacts; `frontend/tmp-tile.css` survives.

---

## 2.3 Backend endpoint table

Mount chain (`Backend/server.js`): `app.use("/api", generalLimiter, apiRouter)` →
`routes/index.js`: `/health` (healthRouter), then `ensureDb`, then `/` (publicRouter),
`/auth` (authRouter), `/admin` (adminRouter).

`admin.routes.js:53` → `adminRouter.use(requireAuth)`; `admin.routes.js:57` →
`adminRouter.use("/team", requireRole("super_admin"), teamRouter)`.

### Public (no auth) — intentional

| method | path | extra middleware | mutating? |
|---|---|---|---|
| GET | `/api/health` | none | no |
| GET | `/api/logos` | — | no |
| GET | `/api/products` | — | no |
| GET | `/api/services` | — | no |
| POST | `/api/submission` | submissionLimiter, submissionRules | YES — public lead form (intentional) |
| POST | `/api/visitor-track` | visitorLimiter, visitorRules | YES — analytics beacon (intentional) |
| GET | `/api/push/public-key` | — | no |
| POST | `/api/push/subscribe` | pushLimiter, subscriptionRules | YES — opt-in (intentional) |
| POST | `/api/push/unsubscribe` | pushLimiter (see `public.routes.js:90`) | YES — opt-out (intentional) |

### Auth

| method | path | middleware |
|---|---|---|
| POST | `/api/auth/login` | loginLimiter, loginRules |
| POST | `/api/auth/logout` | none |
| GET | `/api/auth/me` | requireAuth |
| POST | `/api/auth/password` | sensitiveLimiter, requireAuth, changePasswordRules |

### Admin — all behind `requireAuth`

| method | path | extra |
|---|---|---|
| GET | `/api/admin/dashboard/stats` | — |
| GET/POST | `/api/admin/logos` | create: logoRules |
| PUT/DELETE | `/api/admin/logos/:id` | idRules; DELETE accepts `?detach=true` |
| PATCH | `/api/admin/logos/reorder`, `/logos/:id/visibility` | — |
| POST | `/api/admin/logos/upload`, `/logos/:id/reprocess`, `/logos/:id/revert`, `/logos/bulk-fix` | validation |
| GET/POST | `/api/admin/products` | productRules |
| GET/PUT/DELETE | `/api/admin/products/:id` | idRules + productUpdateRules |
| PATCH | `/api/admin/products/reorder` | — |
| GET/POST/PUT/DELETE | `/api/admin/product-type-templates[/:id]` | validation |
| GET | `/api/admin/submissions`, `/submissions/export`, `/submissions/:id` | idRules |
| PATCH/DELETE | `/api/admin/submissions/:id...` | status rules |
| GET | `/api/admin/visitors` (see `admin.routes.js:202`) | — |
| GET/POST/DELETE | `/api/admin/notifications[/:id]`, `/notifications/stats` | validation |
| * | `/api/admin/team/*` | `requireRole("super_admin")` at the mount |

**F-2-007 — MUTATING ENDPOINTS WITHOUT `requireAuth` (INFO, CONFIRMED — all intentional).**
Exactly three POSTs outside the admin/auth routers: `/api/submission`, `/api/visitor-track`,
`/api/push/subscribe` (+ `/api/push/unsubscribe`). Each is rate-limited and validated. No
unauthenticated mutating endpoint was found that is not on that list.

---

## 2.4 Models

| model | key fields / constraints |
|---|---|
| Admin | `email` required + unique; `password` required; role; isActive |
| Logo | `name` required; `url` (secureUrl) required; `publicId` required + **unique index** (`logoSchema.index({publicId:1},{unique:true})`) |
| Product | `name` required; `category` required; `logoId` → `ref: "Logo"` (nullable, backward compatible) |
| ProductTypeTemplate | `type` required + unique |
| PushSubscription | `endpoint` required + unique; `keys.p256dh` required; `keys.auth` required |
| Service | `title` required; `slug` required + unique; `icon` required; `description` required |
| Submission | `name` required; `service` required; referenceId required + unique + indexed |
| Visitor | two required fields (path/date dedupe) |
| Notification | `title` required; `message` required; `ref: "Admin"` |
| AuditLog | `action` required + indexed |

### Frontend-required fields vs model definitions

`frontend/types/api.ts` declares `logo: {id,url,displayName,alt,tone,hasAlpha,aspectRatio} | null`
for products (see `frontend/lib/productLogo.ts:6-7`). That is a **public projection computed by the
backend**, not a model column — confirmed by `productController` projecting it. `shortDescription`,
`category`, `accent`, `highlights` are declared on `Service` and are populated by
`Backend/scripts/seed-core.js:113-191` (14 services, all four fields present).

**F-2-008 — MODELS VS SEED (see also F-4-00x).** `Backend/scripts/seed-prod.js` contains **zero**
occurrences of `shortDescription|highlights|category|accent|logoId|tone|slug|title|description`
(command: `grep -nE ... Backend/scripts/seed-prod.js` → no output). It is a 121-line guard wrapper
that dynamically imports `scripts/seed-core.js` (`seed-prod.js:94`), so production seeding DOES get
the fields via seed-core. Not a gap — recorded because the naive grep looks alarming.

---

## 2.5 npm scripts → target files

### frontend/package.json

| script | target | file exists? |
|---|---|---|
| dev / build / start / lint | next / eslint | yes |
| prebuild, snapshot:content | scripts/snapshot-content.mjs | yes |
| audit:contrast | scripts/audit-contrast.mjs | yes |
| trace:logo | scripts/trace-logo.mjs | yes |
| build:icons | scripts/build-logo-assets.mjs | yes |
| check:secrets | scripts/check-no-secrets.mjs | yes |
| verify:bff | scripts/verify-bff.mjs | yes |

**F-2-009 — SCRIPTS NOT WIRED TO ANY npm SCRIPT (LOW, CONFIRMED).** Four tracked scripts have no
npm entry point and are run by hand only: `scripts/verify-three.mjs` (the main harness, ~5244
lines), `scripts/capture-products.mjs`, `scripts/capture-themes.mjs`, `scripts/tmp-hero-m.mjs`.
`tmp-hero-m.mjs` is a temp file that `prompt.md` §e orders deleted.

### Backend/package.json

`dev`, `dev:mem`, `start`, `seed`, `seed:prod`, `seed:mem`, `seed:mem:once`, `smoke`, `lint`,
`build` → all target files exist (`scripts/dev-memory.js`, `seed-core.js`, `seed-prod.js`,
`seed.js`, `smoke.js`, `syntax-check.js`). **No script points at a missing file.**

---

## 2.6 Env-var map (NAMES ONLY — no values were read)

### Backend (`Backend/config/env.js`)

Read via `readRequired` / `readOptional` / `readInt` / `readBool`:

`NODE_ENV`, `PORT`, `CLIENT_ORIGIN`, `MONGODB_URI` (required), `JWT_SECRET` (required),
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `JWT_COOKIE_NAME`,
`COOKIE_SECURE`, `COOKIE_SAMESITE`, `AUTH_DEBUG_HEADERS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `PUSH_MAX_FAILURES`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`,
`SEED_RESET_ADMIN_PASSWORD`, `DEMO_ADMIN_EMAIL`, `PUBLIC_API_URL`, `TRUST_PROXY`, `LOG_FORMAT`,
`JSON_BODY_LIMIT`, `VISITOR_DEDUPE_HOURS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`,
`LOGIN_RATE_LIMIT_MAX`, `SUBMISSION_RATE_LIMIT_MAX`, `VISITOR_RATE_LIMIT_MAX`,
`PUSH_RATE_LIMIT_MAX`, `SENSITIVE_RATE_LIMIT_MAX`.

Also read directly: `VERCEL` (`server.js:106`), `SMOKE_PORT` (`smoke.js:21`), `SEED_SAMPLE_CONTENT`.

### Frontend

Next-inlined `NEXT_PUBLIC_*`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_API_PROXY` (set by `next.config.ts` `env`), `NEXT_PUBLIC_COOKIE_NAME`.
Server/runtime: `BACKEND_ORIGIN`, `DIAGNOSTICS`, `NODE_ENV`.
Scripts only: `CHROME_PATH`, `API_BASE`, `NO_WEBGL`, `BFF_STUB_PORT`, `BFF_APP_PORT`,
`SNAPSHOT_API_BASE`, `CAPTURE_PORT`, `LOGO_DP_TOL`, `ADMIN_PASSWORD` (read, never printed),
`RATE_LIMIT_MAX`, `CONFIRM_PRODUCTION_SEED`.

### Documentation coverage

DEPLOYMENT.md §8 documents all Backend names above except `SENSITIVE_RATE_LIMIT_MAX` is present,
`PUSH_*` present — **`DIAGNOSTICS` and `BACKEND_ORIGIN` are NOT in the §8 frontend table**
(DEPLOYMENT.md:278-283 lists only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL`).
`BACKEND_ORIGIN` appears only at DEPLOYMENT.md:513 and :698; `DIAGNOSTICS` appears only in
README.md:489 and PROJECT_NOTES.md:2442/2554 — never in DEPLOYMENT.md.

**F-2-010 — UNDOCUMENTED-IN-DEPLOYMENT ENV VARS (MEDIUM, CONFIRMED).** `BACKEND_ORIGIN` and
`DIAGNOSTICS` are load-bearing for the frontend deploy but are absent from the DEPLOYMENT.md §8
frontend variable table. Evidence: `sed -n '278,286p' DEPLOYMENT.md` shows only two rows.

Names read but never documented anywhere: `SEED_SAMPLE_CONTENT` (read by `seed-prod.js`),
`NEXT_PUBLIC_COOKIE_NAME`, `LOGO_DP_TOL`, `CAPTURE_PORT`, `BFF_STUB_PORT`, `BFF_APP_PORT`.
Documented but never read: none found for the Backend list (every `env.js` name is consumed).

---

## 2.7 Dependencies

### frontend/package.json (11 declared)

`next@16.3.8`, `react@19.2.8`, `react-dom@19.2.8`; dev: `@tailwindcss/postcss@^4`,
`@types/node@^20`, `@types/react@^19`, `@types/react-dom@^19`, `eslint@^9`,
`eslint-config-next@16.3.8`, `tailwindcss@^4`, `typescript@^5`.
Installed (`npm ls --depth=0`): next 16.3.8, react 19.2.8, react-dom 19.2.8, tailwindcss 4.3.3,
typescript 5.9.3, eslint 9.39.5, @tailwindcss/postcss 4.3.3, @types/* installed.

**Zero animation/UI dependencies — RULE SATISFIED.** No framer-motion, gsap, three, lenis, etc.
(`npm ls --depth=0` output above is the complete list.)

**F-2-011 — CRITICAL VULNERABLE DEPENDENCY (HIGH, CONFIRMED).** `npm audit --omit=dev` in
`frontend/`:

```
next  16.0.0 - 16.4.0   Severity: critical
  Next.js: Unauthenticated Remote Code Execution in Image Optimization API when SVG files are used
  Next.js: Denial of Service in App Router using Server Actions
  Next.js: Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays
  fix available via `npm audit fix --force` → installs next@16.4.3 (outside stated range)
1 critical severity vulnerability
```
Command exit code 1. No `npm audit fix` was run (report-only, per ground rule).

**F-2-012 — HIGH VULNERABLE TRANSITIVE DEPENDENCY (HIGH, CONFIRMED).** `npm audit --omit=dev` in
`Backend/`:

```
body-parser  2.0.0 - 2.3.0   Severity: high
  body-parser vulnerable to Denial of Service via trailing bytes after a compressed request body
  fix available via `npm audit fix`
1 high severity vulnerability
```
Command exit code 1. Not fixed (report-only).

### Backend/package.json (19 declared)

`bcryptjs`, `cloudinary`, `compression`, `cookie-parser`, `cors`, `dotenv`, `express`,
`express-rate-limit`, `express-validator`, `helmet`, `jsonwebtoken`, `mongoose`, `morgan`,
`sharp`, `web-push`; dev `@eslint/js`, `eslint`, `globals`, `mongodb-memory-server`.
Installed versions match (express 5.2.1, mongoose 8.24.4, helmet 8.3.0, sharp 0.35.5).

Unused-declared: none found — every declared dependency is imported somewhere under `Backend/`
except `morgan` (used at `server.js:45`) and `compression` (used at `server.js:44`), both used.
Missing-declared: none (frontend imports only next/react; backend imports only the list above).

Duplicated majors between the two package.json files: `eslint` is declared as `^9` (frontend) and
`^10` (Backend) — two major versions of ESLint coexist in the repo. Not a runtime problem (separate
installs), recorded for completeness.
