# PROJECT_NOTES.md — Jazari Tech Official

> Living technical memory for this repository. **Read this file first at the start of every
> session.** Append a dated changelog entry after every piece of work — never rewrite history.

---

## 1. Project Overview

Jazari Tech Official — company website + secure admin portal.

- **Public site:** premium, animated, accessible, SEO-friendly marketing site (Next.js App Router).
- **Admin portal:** JWT-protected content management (logos, products, templates, submissions, visitors).
- **Backend:** Express + Mongoose API — the **single source of truth** for all public content.

The frontend never holds independent product/service/logo data; everything renders from API responses.

## 2. Architecture

```
Browser ──> Next.js frontend (frontend/) ──typed API client──> Express API (Backend/) ──> MongoDB
                                                                        └──> Cloudinary (logo assets)
Admin browser ──> /admin (frontend) ──same API client + httpOnly JWT cookie──> /api/admin/* (backend)
```

- Backend validates all input, enforces auth, and owns every write.
- Frontend validation is UX only; backend validation is security.
- Admin auth: JWT stored in an **httpOnly, SameSite cookie** — never localStorage.

## 3. Tech Stack

| Layer     | Stack |
|-----------|-------|
| Frontend  | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/postcss`), ESLint 9 (eslint-config-next) |
| Backend   | Node.js ESM, Express 5, Mongoose 8, Helmet, CORS, express-rate-limit, express-validator, JWT (jsonwebtoken), bcryptjs, morgan, compression, cookie-parser, Cloudinary SDK |
| Database  | MongoDB |
| Assets    | Cloudinary (product/logo images) |
| Animation | Hand-written only: CSS keyframes, Web Animations API, IntersectionObserver, rAF. **Zero animation/icon/UI dependencies.** |
| 3D / WebGL | `three` + `@types/three` (public site only) — "Procedural WebGL/3D visual layer for the public website." Lazy-loaded chunk; never on `/admin`.

## 4. Folder Structure

```
Website/
├── frontend/
│   ├── app/                  # App Router (public + /admin)
│   ├── components/           # admin | brand | forms | icons | layout | motion | navigation | products | services | ui
│   ├── hooks/  lib/  types/  # use- hooks, api client, shared types
│   ├── public/brand/         # owner-supplied logo assets
│   ├── globals.css           # design tokens (light + dark)
│   ├── next.config.ts  postcss.config.mjs  tsconfig.json  eslint.config.mjs
├── Backend/
│   ├── config/ controllers/ middleware/ models/ routes/ services/ utils/ scripts/ uploads/
│   ├── server.js  package.json  .env.example  eslint.config.js
├── PROJECT_NOTES.md  README.md  .gitignore
```

## 5. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL
npm run dev                  # http://localhost:3000
npm run lint                 # eslint
npm run build                # production build
```

## 6. Backend Setup

```bash
cd Backend
npm install
cp .env.example .env         # fill in Mongo/JWT/Cloudinary/admin values
npm run seed                 # creates admin + templates + sample products
npm run dev                  # nodemon-style watch (node --watch), http://localhost:5000
npm start                    # production
npm run lint                 # eslint
npm run build                # syntax check over all backend files
```

Health check: `GET /api/health` → `{ success, data: { status, database, uptime, … } }`.

## 7. Environment Variables

**Frontend (`frontend/.env.local`)**

| Key | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | API base URL, e.g. `http://localhost:5000/api` |

**Backend (`Backend/.env`)** — see `Backend/.env.example` for the full annotated list.

| Key | Purpose |
|-----|---------|
| `PORT` | API port (default 5000) |
| `MONGODB_URI` | Mongo connection string |
| `JWT_SECRET` | JWT signing secret (32+ chars) |
| `CLIENT_ORIGIN` | Allowed CORS origin(s), comma separated |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Logo uploads |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seed script admin account |
| `TRUST_PROXY` | Proxy hops trusted for client IP (default `1`) |
| `VISITOR_DEDUPE_HOURS` | Visitor dedupe window (default 24 = one record/IP/day) |

Startup **fails fast with a clear message** if mandatory variables are missing; secret values are
never printed.

## 8. API Endpoint Table

All responses use one contract:

- Success: `{ "success": true, "data": …, "meta"?: … }`
- Error: `{ "success": false, "error": { "code", "message", "details"? } }`

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET  | `/api/health` | – | Liveness + DB state |
| GET  | `/api/logos` | – | Visible logos (sorted) |
| GET  | `/api/products` | – | Published products (sorted) |
| GET  | `/api/services` | – | Services list |
| POST | `/api/submission` | – | Start-Your-Project intake (rate limited, honeypot) |
| POST | `/api/visitor-track` | – | Visitor analytics (rate limited, deduped) |
| POST | `/api/auth/login` | – | Admin login → httpOnly JWT cookie (rate limited) |
| POST | `/api/auth/logout` | cookie | Clear session |
| GET  | `/api/auth/me` | cookie | Current admin |
| POST | `/api/auth/password` | cookie | Self-service change password (rate limited) |
| GET  | `/api/admin/team` | JWT + **super_admin** | List administrators |
| POST | `/api/admin/team` | JWT + **super_admin** | Create administrator |
| PATCH | `/api/admin/team/:id/role` · `/:id/status` | JWT + **super_admin** | Change role / activate-deactivate |
| POST | `/api/admin/team/:id/password` | JWT + **super_admin** | Reset an administrator's password |
| DELETE | `/api/admin/team/:id` | JWT + **super_admin** | Delete an administrator |
| GET/POST | `/api/admin/logos` | JWT | List / upload (preserve original → process → store) |
| PUT/DELETE | `/api/admin/logos/:id` | JWT | Update / replace (re-process) / delete (processed + original) |
| PATCH | `/api/admin/logos/reorder` · `/api/admin/logos/:id/visibility` | JWT | Ordering / visibility |
| POST | `/api/admin/logos/:id/reprocess` | JWT | Re-run pipeline from the preserved original (idempotent) |
| POST | `/api/admin/logos/:id/revert` | JWT | Restore the untouched original upload |
| POST | `/api/admin/logos/bulk-fix` | JWT | Process all logos from their originals (per-item isolation) |
| GET/POST | `/api/admin/products` | JWT | List / create |
| GET/PUT/DELETE | `/api/admin/products/:id` | JWT | Read / update / delete |
| PATCH | `/api/admin/products/reorder` | JWT | Ordering |
| GET/POST/PUT/DELETE | `/api/admin/product-type-templates`… | JWT | Smart default templates |
| GET | `/api/admin/submissions` (+`/:id`) | JWT | List / detail (search, filter, pagination) |
| PATCH | `/api/admin/submissions/:id/status` | JWT | New → Contacted → Closed |
| DELETE | `/api/admin/submissions/:id` | JWT | Delete |
| GET | `/api/admin/submissions/export` | JWT | CSV export (escaped) |
| GET | `/api/admin/visitors` | JWT | Paginated visitor analytics |
| GET | `/api/admin/dashboard/stats` | JWT | Real counts for dashboard cards |

## 9. Database Models

| Model | Key fields |
|-------|-----------|
| `Admin` | email, **name**, passwordHash, **role** (`admin` \| `super_admin`), **isActive**, lastLoginAt |
| `AuditLog` | actorId, actorEmail, action, targetId, targetEmail, metadata, ip, createdAt |
| `Logo` | name, displayName, secureUrl, publicId, alt, websiteUrl, **originalUrl, originalPublicId**, **width, height, aspectRatio, hasAlpha, dominantColors[], averageLuminance, tone, backgroundStatus**, sortOrder, isVisible |
| `Product` | name, logo, productUrl, category, highlightPoints[], isPublished, sortOrder |
| `ProductTypeTemplate` | type, highlightPoints[] |
| `Submission` | name, domain, phone, email, service, referenceId, visitorIp, status (`New`/`Contacted`/`Closed`) |
| `Visitor` | ip, normalizedIp, userAgent, page, referrer, visitDate, visitCount, lastVisitedAt |
| `Service` | title, slug, icon, description, sortOrder |

## 10. Authentication Architecture

- `POST /api/auth/login` → bcrypt compare → JWT signed with `JWT_SECRET`, `7d` expiry.
- JWT delivered as **httpOnly + SameSite cookie** (`jazari_admin`), `Secure` in production.
- `middleware/auth.js` (`requireAuth`) verifies the cookie (or `Authorization: Bearer`) on every
  `/api/admin/*` route — authorization lives on the backend, never behind a secret URL.
- **Roles:** `admin` (all existing admin capabilities) and `super_admin` (also team management). The
  JWT carries `role`, but it is **never trusted for authorization**: `requireAuth` re-reads the Admin
  document on every request, so demotion, deactivation and deletion take effect immediately. An
  inactive account is rejected with 403; a missing/deleted account with 401.
- **`requireRole(...roles)`** is the single reusable gate (mounted once: `adminRouter.use("/team",
  requireRole("super_admin"), teamRouter)`). Controllers never duplicate the authorization rule.
- **Seed/Super Admin:** the configured `ADMIN_EMAIL` account is promoted to `super_admin` and activated
  idempotently; its password is **preserved** unless `SEED_RESET_ADMIN_PASSWORD=true`. A legacy/demo
  account (`DEMO_ADMIN_EMAIL`, default `admin@jazaritech.com`) is deactivated (never deleted) unless it
  is the configured account. Legacy roles (`editor`, `super-admin`) are migrated in the seed.
- **Self-service password change:** `POST /api/auth/password` (rate limited) verifies the current
  password, enforces the shared strength policy and re-issues the session cookie.
- **Safety rules (server-side):** a Super Admin cannot demote/deactivate/delete themselves; the last
  active Super Admin can never be removed. Enforced in `controllers/teamController.js` — never by the
  frontend guard.
- **Audit log:** `models/AuditLog.js` + `utils/audit.js` record admin created / role changed /
  activated / deactivated / password reset / deleted / password changed (fire-and-forget, no secrets).
- Passwords are never returned by any endpoint, never logged and never stored in the audit trail.
- Login rate limited; identical generic error for unknown email vs wrong password (no enumeration).

## 11. Cloudinary Architecture

- Server-side uploads only; credentials never reach the browser.
- Admin sends a validated base64 data URI → backend stores the **untouched original**
  (`jazari/logos/originals`, `quality: auto:best`), runs the image pipeline, and stores the
  **processed PNG** (`jazari/logos/processed`, explicit `format: png` so transparency survives).
- Mongo stores the processed `secureUrl`+`publicId` **and** the preserved `originalUrl`+`originalPublicId`.
- Delete order: storage assets first (processed + original), then the Mongo record; a storage failure
  aborts and keeps state consistent. Delete never touches shared/other assets.

## 12. Visitor Tracking

- `POST /api/visitor-track { page, referrer }` with `credentials: include`.
- `utils/ip.js` → `getClientIp()` honours `TRUST_PROXY` hops, extracts from `x-forwarded-for`,
  handles IPv4, IPv6, IPv4-mapped IPv6, and normalizes (`normalizeIp`) for dedupe.
- Dedupe: one document per normalized IP per `VISITOR_DEDUPE_HOURS` window (default 24 h) —
  repeats increment `visitCount` and refresh page/referrer/userAgent/`lastVisitedAt`.
- Footer shows a discreet privacy notice: "We log visits for analytics and security."

## 13. Design System

- Central CSS custom properties in `frontend/app/globals.css` — components never hardcode colors.
- Rounded-2xl cards, thin borders, soft shadows, high whitespace, precise spacing scale.
- White dominates light mode; navy/blue carry identity; green is a micro-accent only.

## 14. Color Tokens

| Token | Light | Role |
|-------|-------|------|
| `--color-primary` | `#212C65` Deep Navy | Wordmark "Jazari", primary surfaces |
| `--color-accent` | `#3D76BB` Technology Blue | Primary interactive/CTA |
| `--color-growth` | `#95C93D` Growth Green | **Micro-accent only** (status, dots, success) |
| `--color-slate` | `#A7B3C8` Official Slate | Secondary text |
| `--color-bg` | `#FFFFFF` | Background |

Dark mode derives from navy-black surfaces (never pure black), blue primary, slate-muted text.
Themes: **System (default) / Light / Dark**, persisted in `localStorage`, applied by an inline
no-flash script before first paint.

## 15. Typography

- `next/font` Geist Sans (display + body) and Geist Mono (code/data).
- Scale: display / heading / body / small / label tokens.

## 16. Animation Conventions

- Reusable primitives in `components/motion/`: scroll reveal, stagger, counters, marquee, tilt,
  parallax, navbar transform, scroll progress — IntersectionObserver + rAF only.
- Animate `transform`/`opacity`; never width/height/box-shadow chains; cancel work off-screen.
- `prefers-reduced-motion: reduce` disables parallax, magnetic effects and continuous motion.
- **Motion tokens** (globals.css `:root`): `--dur-fast/normal/slow` + `--motion-fast/normal/slow`,
  `--ease-out/in-out/standard/emphasis/spring-soft`, and the first-load timeline
  (`--intro-logo/nav/headline/word-step/sub/cta/trust/counters-delay`). One system, no duplicates.
- **First-load choreography** is CSS-only and JS-gated: an inline `<head>` script adds `html.js` and,
  only when motion is allowed, `html.js-intro`. Without JS — or under reduced motion — `js-intro` is
  absent so every element (including `.reveal`) is fully visible. Content is never JS-dependent and
  there is no blocking preloader. Total story ≈1.5 s (headline word-by-word masked slide-up; the 3D
  assembly is `ASSEMBLY_DURATION` 1.1 s).

## 17. Icon System

- Custom inline SVG React components in `components/icons/` (no icon library).
- Uniform API: `size`, `className`, `aria-label`, `animated`, `variant`.
- Interaction states driven by CSS classes/data attributes, reusable across site + admin.

## 18. Accessibility Conventions

- Semantic HTML, single `h1` per page, ordered headings, landmarks.
- Keyboard operable; visible focus rings; `aria-expanded`/`aria-controls` on menus.
- Dialogs: `role="dialog"`, focus trap, Escape to close, focus restoration.
- Status never conveyed by color alone; WCAG-conscious contrast in both themes.

## 19. Performance Conventions

- Server components by default; client components only for interactivity.
- `next/image` + `next/font`; no layout shift; below-the-fold lazy content.
- Zero added frontend dependencies; CSS-first animations; no unnecessary hydration.

## 20. Feature Checklist

- [x] Full quality checklist → see **Quality Checklist in README.md** §7 (security, data, frontend correctness, experience, accessibility, performance/SEO, verification).

## 21. Done

- Phase 1 — repository audit, backend foundation (config, security middleware, health route, lint/build).
- Phase 2 — 7 models, full public/admin API, seed script, e2e smoke test.
- Phase 3 — Cloudinary storage service + logo upload/replace/delete lifecycle.
- Phase 4 — frontend design system, themes, icon system, motion primitives.
- Phase 5 — public site (navbar, hero, marquees, product cards, services, brand statement, footer).
- Phase 6 — 4-step Start Your Project form + success modal with reference ID.
- Phase 7 — admin portal (login, shell, dashboard, logos, products/templates, submissions, visitors).
- Task B Phase 2 — Super Admin backend (roles, isActive, requireRole, DB re-check, team API, audit log).
- Task B Phase 3 — admin `/admin/team` + `/admin/account` (super-admin gating, role badge, change password).
- Task B Phase 4 — Main Logo rollout (trimmed transparent asset, live wordmark, white plate removed).
- Task B Phases 5–6 — hero layout rebalance + Three.js logo rebuilt as straight extruded ribbons.
- Task B Phases 7–8 — motion tokens, first-load choreography, site-wide polish (glow, nav, buttons…).
- Task B Phases 9–10 — performance/a11y/responsive audit + harness extensions and screenshots.
- **Task C** — premium “Our Products” logo-only showcase + a professional, reversible logo image
  pipeline (preserve original → border flood-fill background removal → metadata/tone → reprocess /
  revert / bulk fix), admin Logos Manager upgrades (checkerboard before/after, toggles, badges, bulk
  fix, display name, website URL), theme legibility, interaction/motion polish, a11y/perf, and a 15-check
  logo harness. See §28.
- 3D Phase 1 — repo audit, `three@0.186.1` + `@types/three@0.186.0` installed (only new deps).
- 3D Phase 2 — foundation: renderer/RAF/quality/theme/fallback/lazy loading + route isolation.
- 3D Phase 3 — materials, PMREM environment, studio lighting, procedural ribbon diamond.
- 3D Phase 4 — assembly/idle/parallax/scroll/hover + support objects + contact shadow.
- 3D Phase 5 — hotspot projection + SVG connector + backend-data glass card.
- 3D Phase 6 — composition + dimensional z-stagger polish.
- 3D Phase 7 — CSS 3D card tilt (services/products) + CSS-only ambient Brand Statement field.
- 3D Phase 8 — optional intro: deliberately skipped per spec guardrails (rationale logged).
- 3D Phase 9 — CDP verification harness: 47/47 + NO_WEBGL 7/7 (perf/memory/mobile/low-end).
- 3D Phase 10 — a11y + regression + form E2E; fixed Next 16 private-IP image-optimizer 400.

## 22. In Progress

- None.

## 23. Planned

- Deployment handoff: real Cloudinary credentials + production MongoDB/env (owner-side).
- Optional: revisit branded intro only with real Lighthouse data.

## 24. Known Issues

- **SwiftShader X4122 shader warning** appears only under headless *software* WebGL (double-precision
  compiler noise from three's stock shaders); not produced by app code and absent on hardware GPUs.
- **Firefox/Safari not empirically tested** (CLI has Chromium only). All APIs used are baseline; recorded
  as code-reviewed compatibility, not measured.
- **Lighthouse not runnable here** — no score is claimed. Bundle facts are reported instead (see §26.17).
- Synthetic sustained-FPS downgrade could not be forced under SwiftShader; FPS monitor verified by review.
- Dev-only: `CLIENT_ORIGIN` includes `http://localhost:3001` for the production-preview harness.
- **Task C:** logos with a baked opaque/complex background (e.g. Irhas'Inn: a black field inside a gold
  frame) are **not** force-cleaned — they are preserved and flagged `needs-transparent-png` and should
  be replaced with a genuinely transparent PNG by the owner.
- **Task C:** `Backend/.env` sets `NODE_ENV=production`; running the backend smoke test therefore needs
  `NODE_ENV=test` (the harness/smoke set it for the spawned server). No secret values are recorded here.
- The `prefers-reduced-motion` theme-legibility harness check is vacuous when no light-tone logo exists
  in the dataset (asserted but not exercised).

## 25. Dated Changelog

<!-- append new entries below this line -->

## 2026-10-01

### Completed
- Repository audit: frontend is a clean Next.js 16 + Tailwind v4 scaffold (config preserved), `Backend/` was empty.
- Backend foundation: ESM Express 5 app with validated config layer (`config/env.js`), MongoDB connection helper, Helmet, strict CORS (credentials + explicit `CLIENT_ORIGIN`), compression, morgan logging, cookie parsing, `trust proxy` control, general rate limiter, centralized 404/error middleware and shared JSON response contract.
- Scripts: `npm run dev` (`node --watch`), `npm start`, `npm run lint` (ESLint 10 flat config), `npm run build` (syntax check over all backend files), `npm run seed` (added in Phase 2).
- Created `Backend/.env.example`, `frontend/.env.example`, `frontend/.env.local` (local dev value), root + backend `.gitignore`, `uploads/.gitkeep`.
- Created this living document `PROJECT_NOTES.md`.

### Files Changed
- Backend/package.json, Backend/eslint.config.js, Backend/server.js
- Backend/config/env.js, Backend/config/db.js
- Backend/middleware/errorHandler.js, Backend/middleware/rateLimiter.js
- Backend/routes/index.js, Backend/routes/health.routes.js
- Backend/utils/apiResponse.js, Backend/utils/errors.js, Backend/utils/asyncHandler.js
- Backend/scripts/syntax-check.js, Backend/.env.example, Backend/.gitignore
- frontend/.env.example, frontend/.env.local, .gitignore, PROJECT_NOTES.md

### Verification
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (compiled, TypeScript clean, 4 static pages)
- `Backend`: `npm run lint` ✅ (after removing one unused import), `npm run build` ✅ (12 files syntax-checked)

### Follow-up
- Backend runtime still needs a reachable MongoDB before it can serve traffic (see Phase 2).

## 2026-10-01 — Phase 2: Models + API

### Completed
- 7 Mongoose models: `Admin` (bcrypt helpers, no hash leakage), `Logo`, `Product`, `ProductTypeTemplate`, `Submission` (phone/email rule + server-generated `referenceId`), `Visitor` (dedupe key), `Service` (services now live in the database).
- Public API: `GET /api/logos`, `/api/products`, `/api/services`, `POST /api/submission` (honeypot + duplicate-window + rate limit), `POST /api/visitor-track` (IP normalization + window dedupe).
- Auth API: `POST /api/auth/login` (generic 401 + timing-equalized), `/logout`, `GET /api/auth/me` — JWT in httpOnly cookie.
- Admin API: products CRUD + reorder, product-type templates CRUD, submissions list/detail/status/delete/CSV export, visitors list, dashboard stats (14-day SVG-ready series). Every `/api/admin/*` route is guarded by `requireAuth` (cookie or bearer).
- Validation via express-validator + `validate` middleware → `{code, message, details}` field errors; `utils/ip.js` (getClientIp/normalizeIp incl. IPv6 + IPv4-mapped), `utils/csv.js` (RFC escaping + formula-injection guard), `utils/referenceId.js`.
- Seed script (`npm run seed`): idempotent admin, 8 product-type templates, 14 services with professional copy, 4 sample products only when the collection is empty. Never seeds fake traffic.
- Verification tooling: `mongodb-memory-server` (devDependency) powers `npm run dev:mem`, `npm run seed:mem` and the new end-to-end `npm run smoke` test (real HTTP against a real server + in-memory DB).

### Files Changed
- Backend/models/*.js (7 models), Backend/controllers/*.js (8 controllers)
- Backend/middleware/auth.js, Backend/middleware/validate.js
- Backend/routes/{index,public.routes,auth.routes,admin.routes}.js
- Backend/utils/{ip,csv,referenceId}.js, Backend/scripts/{seed,smoke,dev-memory}.js

### Verification
- `npm run lint` ✅, `npm run build` ✅ (38 files)
- `npm run smoke` ✅ **44/44 assertions** (health, public content, intake incl. honeypot/dupes, visitor dedupe, auth incl. forged-cookie 401, product CRUD, submissions + CSV, dashboard, logout)

### Follow-up
- Cloudinary uploads untestable without owner credentials → local storage driver added in Phase 3 (dev only).

## 2026-10-01 — Phase 3: Cloudinary uploads + logo CRUD

### Completed
- `services/storageService.js`: image validation (MIME allow-list, 8 MB cap, data-URI parsing), Cloudinary driver (1280×720 `crop: limit`, `quality: auto:best`, `fetch_format: auto`, stores `secure_url` + `public_id`) and a **development-only local driver** writing to `Backend/uploads` served from `/api/uploads` (production refuses to boot without Cloudinary).
- Logo endpoints: `POST /api/admin/logos` (upload → DB, with rollback on DB failure), `PUT /:id` (metadata and/or image replacement, old asset cleaned up), `DELETE /:id` (storage first, then DB), reorder, visibility, public list respects `isVisible` + `sortOrder`.

### Files Changed
- Backend/services/storageService.js, Backend/controllers/logoController.js, Backend/routes/admin.routes.js, Backend/server.js, Backend/config/env.js, Backend/.env.example, Backend/scripts/smoke.js

### Verification
- `npm run lint` ✅, `npm run build` ✅ (39 files)
- `npm run smoke` ✅ **53/53 assertions** (adds upload → public visibility → hide → replace → delete → unauthenticated 401)

### Follow-up
- Real Cloudinary credentials must be pasted into `Backend/.env` before production launch; upload path then uses the Cloudinary driver automatically.

## 2026-10-01 — Phase 4: Design system, themes, icons, motion

### Completed
- `globals.css`: complete Jazari token system (colors, typography, spacing, radius, shadow, motion, z-index) with light + dark palettes derived from navy (no pure black), `@custom-variant dark`, base layer (focus rings, selection), component layer (container, section, card, glass, buttons, badges, fields, skeletons, tables), animation layer (reveal/stagger/marquee/icon states/float/hotspot/shine/spinner) and a `prefers-reduced-motion` override.
- Theme system: no-flash inline `<head>` script (official Next 16 pattern), `useTheme` built on `useSyncExternalStore` (localStorage + media query + cross-component event), 3-way Light/Dark/System `ThemeToggle` with radiogroup semantics.
- Icon system: 49 hand-drawn inline SVG icons (`components/icons/`), uniform API (`size`, `aria-label`, `animated`, `variant`), CSS-driven animation states via `data-anim`, and a registry mapping backend Service `icon` keys → components.
- Motion primitives: `Reveal` (IntersectionObserver, variants, stagger delays, unmount cleanup), `Counter` (rAF count-up, reduced-motion aware), `Marquee` (pure CSS, duplicated group, pause on hover, edge mask).
- UI primitives: `Button`, `Spinner`/`Skeleton`/`SkeletonText`, `Modal` (portal, focus trap, Escape, scroll lock, focus restore), `EmptyState`, `Badge` (never colour-only status).
- Brand: `Logo` component rendering the supplied `public/brand/*` assets with a dark-mode light plate (never filters/inverts artwork).
- API layer: `types/api.ts` contract types + `lib/api.ts` single typed client (base URL, credentials, envelope parsing, `ApiError` with field details, XHR upload progress, CSV download helper).
- `next.config.ts`: remote image patterns derived from `NEXT_PUBLIC_API_URL` + Cloudinary; layout metadata (title template, OG/Twitter, robots, icons, themeColor).

### Verification
- `npm run lint` ✅ (0 problems; fixed strict react-hooks set-state-in-effect/refs rules), `npm run build` ✅ (TypeScript clean)

### Follow-up
- Homepage sections are built in Phase 5.

## 2026-10-02 — Phase 5: Public site

### Completed
- `app/page.tsx` with the exact required section order: Navbar → Hero → Products Logos (marquee) → Products Cards → Services → Start Your Project → Brand Statement → Footer.
- `Navbar`: glass pill, scroll shrink + progress hairline, mobile drawer with Escape/focus/outside-click handling, skip link, theme toggle slot.
- `Hero`: text-gradient headline (`text-display`), animated counters, rating + avatar chip, orbit rings, floating brand tiles, glass preview card with connector/hotspot, rAF parallax (passive listeners, disabled under reduced motion), supplied brand-icon motif.
- `LogoMarquee`: two counter-scrolling rows driven by the logos API, skeletons, empty/error states. `ProductCards`: backend-driven cards with category icon map, monogram fallback, highlight points, external Visit link.
- `ServicesGrid` + footer `ServiceLinks`: rendered from `GET /api/services`. `BrandStatement` with shine sweep.
- `VisitTracker`: `sendBeacon` visitor tracking, skips `/admin` routes. `robots.ts` + `sitemap.ts` generated.

### Files Changed
- frontend/app/page.tsx, app/robots.ts, app/sitemap.ts
- frontend/components/navigation/Navbar.tsx, components/sections/{Hero,BrandStatement}.tsx
- frontend/components/products/{LogoMarquee,ProductCards}.tsx, components/services/ServicesGrid.tsx
- frontend/components/layout/{Footer,ServiceLinks}.tsx, components/tracking/VisitTracker.tsx

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes)

## 2026-10-02 — Phase 6: Start Your Project form

### Completed
- `StartProjectForm`: 4-step flow (name → work → contact → service) with per-step validation, phone-OR-email rule, services fetched from the backend as radio chips, `website` honeypot field, double-submit guard, focus moved to the step heading on advance, retryable service-load error state.
- `SuccessModal`: stroke-draw checkmark, 12 fixed brand-palette confetti pieces, server-generated reference ID (`JT-YYYYMMDD-XXXXXX`) with one-click copy, Done button; portal + focus trap + Escape per Modal primitive.
- `globals.css` gained `step-enter`, `confetti-piece` component classes and `jt-step-in`/`jt-confetti`/`jt-ring-pulse` keyframes (all brand palette, no new deps).

### Files Changed
- frontend/components/forms/{StartProjectForm,SuccessModal}.tsx, frontend/app/globals.css

### Verification
- `npm run lint` ✅, `npm run build` ✅

## 2026-10-02 — Phase 7: Admin portal

### Completed
- `app/admin/login/page.tsx`: client validation, generic error message (no credential leakage), show/hide password, link back to `/`. `app/admin/layout.tsx` sets `robots: noindex`.
- `AdminShell`: auth guard via `api.auth.me()`, desktop sidebar + mobile drawer, top bar with theme toggle and logout; `(portal)/layout.tsx` wraps all protected pages.
- Pages: Dashboard (KPI counters + 14-day SVG-ready series), Logos (upload with progress/abort, reorder, visibility, replace/delete), Products (create/edit with product-type template defaults), Templates, Submissions (detail, status transitions, CSV export), Visitors (dedupe stats). Shared `Pagination`, `ConfirmDialog`, table/empty/skeleton states.
- `hooks/useAsync.ts` rewritten for strict lint (initial load in mount effect with active flag; `run()` only from event handlers). `lib/api.ts`: list endpoints accept `AbortSignal`; `requestWithProgress` gained `UploadOptions {onProgress, signal}`. `useApiData` gained `setData`.

### Files Changed
- frontend/app/admin/** (login + 6 portal pages, 2 layouts)
- frontend/components/admin/{AdminShell,DashboardClient,LogosManager,ProductEditor,ProductsManager,TemplatesPanel,SubmissionsManager,VisitorsManager,Pagination,ConfirmDialog}.tsx
- frontend/hooks/{useAsync,useApiData}.ts, frontend/lib/api.ts

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes: / + 7 admin + robots + sitemap + 404)

## 2026-10-02 — Type-scale fix (Tailwind v4 @theme)

### Completed
- Investigated `text-display`/`text-h1`/`text-h2`/`text-h3`/`text-body-lg`: the `--text-*` vars lived only in `:root`, so Tailwind v4 never generated the utilities (compiled CSS had no `.text-display`/`.text-h3`) and every headline silently fell back to inherited size.
- Moved the custom type scale into the `@theme inline` block with explicit `--text-*--line-height` companions; `:root` keeps only the raw `--text-sm`/`--text-xs` overrides used by component classes.
- Confirmed in compiled CSS: `.text-display{font-size:clamp(2.5rem,1.6rem + 3.4vw,4.5rem);line-height:var(--tw-leading,1.05)}` and `.text-h3{...}` now emit.

### Verification
- `npm run lint` ✅, `npm run build` ✅ (12 routes), compiled CSS grep ✅

## 2026-10-02 — Phases 8–10: Tracking verification, full-stack smoke, docs

### Completed
- **Visitor tracking verified live**: `POST /api/visitor-track` first hit → `deduplicated:false`, second hit from same IP → `deduplicated:true`; dashboard reports `todayUnique`, `totalVisits` and a 14-day series. `VisitTracker` beacon fires on the public site and skips `/admin`.
- **Full-stack verification** (backend `dev:mem` in-memory Mongo + seeded data + frontend dev server):
  - Public: products/services/logos endpoints serve seeded content; homepage renders (200, all 8 sections present in HTML); robots/sitemap 200 with canonical `https://jazaritech.com`; unknown route → 404.
  - Intake: `POST /api/submission` → `JT-20261002-D7LXCB` reference ID.
  - Admin: login sets `jazari_admin` httpOnly cookie → `/auth/me` ok → wrong password → 401 → `GET /api/admin/dashboard/stats` returns real counts (4 products, submissions by status, visitor series) → submissions list + CSV export (`text/csv`, BOM, formula-injection guard on phone `'+…`) → logout clears cookie → subsequent admin call 401.
  - Logos: JSON data-URI upload → local storage driver writes `Backend/uploads/logo-*.png` → public list shows it → delete removes it (storage then DB).
  - Unauthenticated `/api/admin/*` → 401.
- **Phase 10 docs**: root `README.md` written — overview, env-var tables for both apps, exact two-terminal startup commands (incl. no-MongoDB `dev:mem` flow and the capital-B `Backend` directory), scripts reference, API summary, the full Quality Checklist (now ticked in §20), and production notes.
- Note: one initial curl 404 on `/api/admin/dashboard` was a **test-path typo** — the real route is `/api/admin/dashboard/stats`, which both the frontend and smoke test use correctly.

### Verification
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes), dev CSS contains `.text-display`/`.text-h3` ✅
- `Backend`: `npm run lint` ✅, `npm run build` ✅ (39 files), `npm run smoke` ✅ **53/53 assertions**

### Follow-up (owner)
- Paste real Cloudinary credentials into `Backend/.env` before production (local driver is dev-only).
- Set production `JWT_SECRET`, `MONGODB_URI`, `COOKIE_SECURE=true`, and point `CLIENT_ORIGIN`/`NEXT_PUBLIC_API_URL` at the deployed hosts.
- Replace seed/sample content and upload the real brand logos via `/admin/logos`.

## 2026-10-02 — 3D Phase 1: Repository audit + Three.js dependency

### Completed
- Full re-audit before starting the Three.js enhancement: hero (`components/sections/Hero.tsx` with decorative visual column, orbit rings, floating tiles, glass card), theme system (`useTheme` + `useSyncExternalStore`), motion primitives (`Reveal`/`Counter`/`Marquee`), icon registry, API client (`api.services()` is a cached GET → safe to reuse from the hero without duplicate network requests), page structure (server `app/page.tsx` composing client sections), strict ESLint (eslint-config-next core-web-vitals + typescript).
- Installed the ONLY two permitted new frontend dependencies: `three@0.186.1` (dependency) and `@types/three@0.186.0` (devDependency). Nothing else added; backend untouched.
- No `components/three/` existed before this task — the interrupted session left no partial work.

### Verification
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes) with three installed but not yet imported.

### Plan (actual repository names)
- `components/three/` module folder; `Hero` gains a `HeroScene` slot inside the existing visual column; `HeroScene` lazily loads `SceneCanvas` via `next/dynamic` + `ssr: false` so `three` lands in an async chunk used only by `/`.

## 2026-10-02 — 3D Phase 2: Three.js foundation

### Completed
- `components/three/` created: `types.ts` (QualityTier/SceneTheme/SceneStatus/ScenePhase/EngineHandle — type-only, erased at build), `helpers/webgl.ts` (capability probe that releases its throwaway context), `helpers/math.ts` (lerp/damp/smoothstep/easeOutCubic/seededNoise), `helpers/disposeScene.ts` (traversal disposal of geometry/material/textures with documented ownership), `helpers/projection.ts` (allocation-free world→container pixel projection), `quality.ts` (HIGH/MEDIUM/LOW budgets + device-based `detectInitialTier` + bounded-window FPS monitor with hysteresis/cooldown, downgrade-only), `theme.ts` (brand constants + light/dark `ScenePalette` + live `--background` read for fog).
- `engine.ts`: ONE WebGLRenderer (alpha, antialias, `powerPreference: high-performance`, DPR cap per tier, ACES tone mapping), one RAF loop with clamped delta, passive hero-range scroll listener, in-place `setTheme`/`setTier`/`setReducedMotion`, full `dispose()` (cancel RAF → `disposeObject(scene)` → `renderer.dispose()` → `forceContextLoss()` → remove canvas). Temporary probe mesh validates the pipeline (replaced by the ribbon diamond in Phase 3).
- `SceneCanvas.tsx`: init effect (WebGL check → tier detect → try/catch engine create → silent fallback), IntersectionObserver pause (120 px rootMargin), `visibilitychange` pause, ResizeObserver, `webglcontextlost` (preventDefault + pause + fallback) / `webglcontextrestored` (resume same engine — no duplicates), Strict Mode-safe cleanup that reports fallback before flipping its guard. Theme/reduced-motion updates land via separate effects that mutate the live engine — the scene is never recreated.
- `HeroScene.tsx`: eagerly imported by `Hero`; loads `SceneCanvas` through `next/dynamic` + `ssr:false` with an `.catch(() => () => null)` guard (chunk failure ⇒ static fallback stays), bridges the existing `useTheme` + new `useReducedMotion` hook, and writes scene status straight to the hero container's `data-scene` attribute (no React re-renders).
- `Hero.tsx` integration: existing visual column kept intact but wrapped in `.hero-decor` (aria-hidden), `data-scene="fallback"` on the container, `<HeroScene hostRef={visualRef} />` appended. `globals.css` §7: `.hero-decor`/`.hero-scene` crossfade rules + `pointer-events:none` (canvas can never block navbar/CTAs/forms/scroll); reduced-motion section renumbered §8.
- `hooks/useReducedMotion.ts`: useSyncExternalStore wrapper mirroring `useTheme`.

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes).
- **Bundle isolation (build output, measured)**: three lives in one chunk (`36q0w8b05oakh.js`), referenced only by the async SceneCanvas chunk (`3ahsfd7k123_f.js`), which + the HeroScene page chunk (`045v5stj6duvf.js`) appear in **home HTML only — 0 of 6 admin HTML files reference any of them**.

## 2026-10-02 — 3D Phase 3: Materials, environment, lighting, ribbon diamond

### Completed
- `materials.ts`: tier-aware factories — `createRibbonMaterial` (MeshPhysicalMaterial with clearcoat on HIGH/MEDIUM, MeshStandard on LOW; no transmission on logo pieces), `createLeafMaterial` (Growth Green + 0.08 emissive micro-glow), `createSupportMaterial`, `createSoftMaterial`.
- `environment.ts`: procedural `RoomEnvironment` baked once through `PMREMGenerator` (no HDRI downloads), immediate disposal of room + pmrem, RT owned/disposed by the module; theme differences apply via `scene.environmentIntensity` (never re-bakes).
- `lighting.ts`: 4-light studio rig (hemisphere fill, key, technology-blue rim, tiny green accent point), **zero shadow casters**, `apply()` restyles colors/intensities in place.
- `createRibbonPieces.ts`: fully procedural Jazari ribbon diamond — four annular-sector ribbons (radius 1.16, width 0.42, 76° span → 14° cardinal gaps, extruded 0.3 with 0.045 bevel + rounded quadratic caps) with 4-fold rotational symmetry bulging on the diagonals (diamond silhouette), piece colors navy/blue/navyDeep/blueDeep, ±0.055° X tilts, plus a tiny extruded green leaf at top-right (hotspot anchor). Assembly start offsets (radial push + rotational skew) exported as specs for Phase 4.
- `engine.ts`: probe replaced by environment + lighting + ribbon composition group; `setTheme` now updates fog/exposure/lighting/environment-intensity in place; `ScenePhase` state machine introduced (`assembling` → `idle`); scroll range drives composition drift; disposal order: ribbon → lighting → environment RT → scene → renderer → forceContextLoss.
- `@types/three@0.186` renamed `ExtrudeGeometryParameters` → `ExtrudeGeometryOptions` (adapted).

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes).

## 2026-10-02 — 3D Phase 4: Hero scene motion (assembly, idle, parallax, hover, objects)

### Completed
- `animation.ts` (`createAnimator`): assembly state machine (`assembling → idle`, `ASSEMBLY_DURATION` 1.4 s, per-piece 0.08 stagger, easeOutCubic, leaf settles last from a delayed offset) driven by elapsed time only — never restarts on re-render; reduced motion snaps progress to 1. Idle hierarchy: ribbon slow rotation + breath, per-piece float/wobble, gear spins in-plane, supports bob at individual rhythms, points drift ultra-slow. Pointer parallax with depth hierarchy (composition 0.09 → supports extra 0.07/0.14 → camera 0.16, all exponentially damped). Scroll: composition drift/shrink over the 600 px hero range. Every frame recomputes transforms from BASE + contributions — no incremental mutation, so reduced-motion/theme flips can't drift (spec §64).
- `interaction.ts`: pointer listeners on the hero container (canvas stays `pointer-events:none`), fine-pointer detection, damped -1..1 state, throttled raycast (70 ms min interval, 160 ms idle refresh, only after movement) against ribbon + visible supports.
- `createTechObjects.ts`: five procedural supports with art-directed positions — chip (rounded box + die + micro green status point), cloud (sphere lobes), shield (extruded curve), gear (torus + 8 teeth), data cluster (spheres + line segments) — plus a runtime-canvas radial-gradient **fake contact shadow** (tinted per palette, no shadow maps) and a 140-point atmospheric field. `setSupportCount`/`setParticleVisibility` drive tier budgets; `userData.baseScale` supports hover scaling.
- `engine.ts`: single loop now = interaction damping → animator (sole spatial writer) → render → post-render anchor projection + hover poll (fresh matrices) → eased hover feedback (scale pop + emissive lift via `userData.baseEmissive`, leaf excluded from scale since the animator owns it). Responsive camera fit (`max(8.2, 9.05/aspect)`), tier budget application (support counts, particles, hover/parallax), dispose also tears down interaction.
- `materials.ts`: emissive hooks added for hover (`baseEmissive` in `userData`); leaf keeps its permanent 0.08 micro-glow.

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes).
- **Headless Chrome runtime check** (dev server, SwiftShader WebGL): `data-scene="webgl"` present in dumped DOM (engine reached first frame + crossfade fired), exactly **one `<canvas>`** after React Strict Mode double-mount, **no JS errors / no hydration errors / no React warnings**. Only log: a SwiftShader X4122 double-precision shader-compile warning (software rasterizer noise, not emitted by app code; absent on hardware GPUs — recorded under Known Issues).

## 2026-10-02 — 3D Phase 5: Hotspot + connector + glass card (backend data)

### Completed
- `HeroScene.tsx` now owns the full HTML overlay: SVG connector (container-level, `pointer-events:none`), pulsing hotspot (Growth-Green core + navy/blue ring via `.hero-hotspot`), and the glass preview card. Fragment structure keeps the card **outside** the `aria-hidden` scene layer (accessible HTML) while canvas/connector/hotspot stay decorative.
- **Backend-driven content**: card renders `GET /api/services` data through the existing `useApiData` + `cached()` client — the same in-flight promise the Services section consumes, so **no duplicate network request**. `pickFeatured()` deterministically prefers a software/AI discipline, falls back to the first service; skeleton while loading; renders nothing on error/empty (never fake data, never a new endpoint).
- **Projection**: engine projects the leaf's world position every frame → `onAnchor(x, y, visible)` → DOM writes only (hotspot `translate3d`, connector quadratic `d` from hotspot to card `offsetLeft/offsetTop+20`). No React re-renders anywhere in the loop.
- **Fallback placement**: without WebGL the overlay sits at a static position beside the card (recomputed on `resize`) — the design language is identical in both modes; `placeDefault()` also re-arms if the engine reports fallback (context loss).
- **Responsive**: connector hidden ≤640 px (card and hotspot remain); hotspot reveals only after first placement (no top-left flash); card keeps `bottom-4 right-0` inside the visual column — never over headings/CTAs/nav.
- `Hero.tsx`: old static "Delivery pulse" card/connector/hotspot block removed (decorative placeholder superseded by the backend-data overlay); orbit rings, tiles and brand-icon tile remain as the fallback.

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes).
- **Headless Chrome**: `Featured service` card rendered with real API data; hotspot inline `translate3d(317.9px, 2.2px, 0)` — matches the analytically predicted projection of the leaf's assembly-start pose (predicted 317.7 px); connector `d="M 317.9 2.2 Q … 208.0 263.0"` terminates exactly at the card corner (offsetLeft 448−240=208, offsetTop 243+20=263); **zero console errors**.

## 2026-10-02 — 3D Phase 6: Composition + material/motion polish

### Completed
- Composition pass on the five supports: data cluster relocated to top-centre and pushed deeper (z −2.0) — it previously crowded the cloud in the top-right and sat near the hotspot projection path. Final art direction: chip top-left, cloud top-right, shield left, gear bottom-left, data top-centre/deep; bottom-right intentionally empty (glass card lives there).
- Ribbon pieces now carry an alternating ±0.055 z-stagger in their assembled targets — the diamond reads as woven/dimensional under rotation instead of a flat ring (targets are captured by the animator, so assembly still converges onto them).
- Fixed the animator to lerp toward the *captured* target position rather than a hardcoded origin (the z-stagger would otherwise have been erased at assembly completion).
- Reviewed (unchanged, values were sound): lighting ratios, fog range 9→24 (main composition unfogged, supports ~5% haze, atmosphere points 13–23% — natural depth ramp), motion hierarchy (ribbon 0.05 rad/s < supports < gear 0.23 rad/s < hotspot pulse < card static), material tiers, reflections budget per tier.

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes).

## 2026-10-02 — 3D Phase 7: Services/Products CSS depth + ambient Brand Statement

### Completed
- `hooks/useTilt.ts`: pointer-follow 3D tilt — writes `--tilt-x`/`--tilt-y` custom properties directly to the DOM (zero React renders), rAF-throttled (one update/frame, pointer values copied before the frame), auto-disabled on coarse pointers and under reduced motion, full listener cleanup.
- `globals.css` §7b: `.tilt-card` (perspective 950° + rotateX/rotateY from the custom properties, declared *after* `.card-hover:hover` so it wins the specificity tie and re-adds the −4 px lift), `.tilt-depth` (translateZ 18 px icon elevation). No new animation dependency — pure CSS transform.
- Wired into `ServiceCard` (ServicesGrid) and `ProductCard` (ProductCards): `tilt-card` on the article + `tilt-depth` on the existing animated icon spans. Existing Reveal entrances, `group-hover` icon nudges and animated SVG icons untouched.
- Brand Statement ambient field (§7c): **CSS-only** — five drifting dots (technology blue + exactly one Growth-Green micro point) and one 110 s dashed orbital ring, all reusing the existing `float-slow`/`float-medium`/`jt-spin` keyframes at `opacity ≤ 0.55`, `aria-hidden`, behind content (`-z-10`). Deliberately *not* WebGL: spec §36 gives performance priority, and a second full-screen renderer on a below-fold section was not justified — compositor-only CSS achieves the same read for zero JS cost (off-screen paint cost ≈ 0).

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes).

## 2026-10-02 — 3D Phase 8: Branded intro — DELIBERATELY SKIPPED

### Decision
Per the spec's own guardrails ("only implement if performance remains excellent", "if the implementation
harms performance: DO NOT IMPLEMENT IT", "never blocks LCP"), the optional session intro overlay was **not built**:

1. An overlay shown on first paint risks becoming the LCP element or delaying paint of the hero H1 — the
   spec forbids both, and Lighthouse cannot be run in this CLI environment to prove the 90+ budget holds.
2. The core hero already delivers the same branded moment — ribbon pieces assemble into the Jazari diamond
   on first render (behind, not over, the content), so the intro would be redundant.
3. The hero takes priority over an optional flourish, exactly as the spec instructs.

This is an intentional no-op, not an omission. Revisit only with real Lighthouse data.

## 2026-10-02 — 3D Phase 9: Performance + memory + mobile + low-end verification

### Completed
- **`frontend/scripts/verify-three.mjs`** — dependency-free CDP harness (Node built-in WebSocket + headless Chrome) with two modes:
  - **normal**: 27 checks — scene activation; one canvas; live tier marker; backend card data; RAF/visibility environment sanity; idle motion; context loss → fallback → restore → resume (one canvas, no duplicates); `prefers-reduced-motion` emulated → composition provably static (<1.5 px/700 ms) while running; 390×844 mobile+touch emulation → degraded tier + real canvas dimensions; **runtime admin isolation** (zero three-chunk resources, zero canvases); 3× SPA round-trips (footer Link → history.back) with post-GC heap bound.
  - **`NO_WEBGL=1`**: 7 checks — `--disable-webgl --disable-webgl2` → `data-scene` stays `fallback`, zero canvases, fallback opacity 1, overlay card + backend content + heading all intact, clean console (spec TEST 14).
- Canvas now exposes `data-quality` (live tier) for inspection/tuning; `setTier` keeps it current.
- Engine pause/resume machinery proven in practice: the harness initially caught the engine *correctly* frozen while the hero was below the fold (IntersectionObserver pause, spec §45) — resuming on scroll; the test was fixed to bring the hero into view rather than the code being weakened.
- FPS monitor (bounded 3 s windows, 2 consecutive poor windows < 42 FPS, 10 s cooldown, downgrade-only) verified by code review — sustained low FPS cannot be forced reliably under SwiftShader, so no synthetic claim is made.
- LOW tier device path verified by code review (mobile emulation legitimately resolved to MEDIUM on this 8-core host: `cores≥8 && memory≥6`).

### Verification
- `npm run lint` ✅ (0 problems incl. the harness), `npm run build` ✅.
- **`node scripts/verify-three.mjs` → 27/27 passed** (heap 16.1 MB → 15.8 MB after GC across 3 remount cycles).
- **`NO_WEBGL=1 node scripts/verify-three.mjs` → 7/7 passed.**
- Environment note: `Backend/.env` `CLIENT_ORIGIN` gained `http://localhost:3001` (dev-only, gitignored) so the production-preview port passes CORS; server restarted via `npm run dev:mem -- --seed`.

## 2026-10-02 — 3D Phase 10: Accessibility, cross-browser, regression

### Completed
- Harness extended with three suites (now 47 checks in normal mode):
  - **[8] Accessibility**: canvas + whole scene layer `aria-hidden="true"`; canvas has no `tabindex` (never steals focus); hotspot/connector decorative; glass card proven *outside* any `aria-hidden` subtree with real text; skip link present; exactly one `<h1>`; `main`/`nav`/`footer` landmarks.
  - **[9] Homepage regression**: all eight sections present (home/products/services/start/brand/footer anchors), marquee (2 rows, 4 imgs from API), 4 product cards, **14 service cards**, form, hidden admin entry — with a clean console.
  - **[10] Form E2E (spec TEST 28)**: drives the real 4-step intake through CDP (native setter + input events) → service chip → submit → **server reference `JT-20261002-6JNRVW`** in the success modal; no console errors (honeypot untouched).
- **Real bug found & fixed by the harness**: logo images from the local storage driver returned Next's `"url" parameter is not allowed` 400 — Next 16's SSRF guard blocks upstream hosts resolving to *private IPs* (localhost → 127.0.0.1) and reuses the pattern-mismatch message. Fixed in `next.config.ts` with `images.dangerouslyAllowLocalIP: true` (only `remotePatterns`-approved hosts are ever fetchable; production points `NEXT_PUBLIC_API_URL` at the real API host). Optimizer now 200; local-driver logos actually render for the first time.
- Keyboard/focus review: no interactive elements were added or reordered — canvas/connector/hotspot are `aria-hidden` + non-focusable; tilt/hover effects are pointer-only; reduced-motion disables all of them (verified in [4]).

### Cross-browser statement (honest)
- **Verified in Chromium** (headless Chrome 140-era, production build) — plus Edge is the same engine.
- Firefox/Safari: not runnable in this CLI. APIs used (WebGL2, ResizeObserver, IntersectionObserver, `matchMedia().addEventListener`, CSS `color-mix`, custom properties) are all baseline-supported in current versions; no experimental/flagged APIs are used. Not empirically tested — recorded as code-reviewed compatibility only.

### Verification
- `npm run lint` ✅ (0 problems), `npm run build` ✅.
- **`node scripts/verify-three.mjs` → 47/47** · **`NO_WEBGL=1` → 7/7**.

## 26. 3D / Three.js Architecture

The public homepage hero carries a procedural WebGL layer as **progressive enhancement** on top of
the existing static fallback. React only manages lifecycle; every Three.js concern lives in
`frontend/components/three/`.

1. **three version**: `0.186.1` (dependency) · **@types/three**: `0.186.0` (devDependency).
2. **Why Three.js**: premium, dimensional "product-shot" reading of the Jazari ribbon-diamond mark —
   cinematic depth/material quality the CSS system cannot express. Allowed exception to the
   zero-dependency rule; nothing else was added (no r3f/drei/gsap/framer/postprocessing).
3. **Dynamic loading**: `Hero` (eager) → `HeroScene` (eager, small) → `next/dynamic` + `ssr:false` →
   `SceneCanvas` + engine + `three` in one async chunk; import guarded with `.catch(() => () => null)`
   so a chunk failure silently leaves the fallback up.
4. **Route isolation**: only `/` mounts HeroScene. Build manifests: home HTML references the scene
   chunks, **0 of 6 admin pages do**; runtime harness confirms admin loads zero three-chunk resources.
   No `components/index.ts` barrel exists; nothing global imports three.
5. **Scene structure**: `scene → {fog, environment, lighting.rig}` and `composition → {ribbon.group,
   supports.group}`. Composition carries scroll + primary parallax; supports carry an extra parallax
   layer; the animator is the single writer of all spatial state.
6. **Renderer configuration**: `alpha:true` (page token background shows through), `antialias:true`,
   `powerPreference:"high-performance"`, `stencil:false`, DPR `min(devicePixelRatio, tierCap)`,
   ACESFilmic tone mapping with palette exposure. Exactly one renderer, one RAF loop, clamped delta.
7. **Quality tiers**: `high | medium | low | static` — device detection (cores/deviceMemory/pointer/
   viewport) picks the start tier; `quality.ts` `QUALITY` holds budgets; canvas exposes live tier as
   `data-quality`.
8. **Object counts**: ribbon = 4 arc pieces + 1 leaf (always); supports = 5/3/1 (chip, cloud, shield,
   gear, data); atmosphere points = 140/70/0; lights = 4; contact shadow = 1.
9. **Material strategy**: `MeshPhysicalMaterial` (clearcoat, no transmission) on HIGH/MEDIUM,
   `MeshStandardMaterial` on LOW; `userData.baseEmissive` powers hover emissive lift; leaf keeps a
   permanent 0.08 emissive micro-glow.
10. **Environment strategy**: `RoomEnvironment` baked once through `PMREMGenerator` (no HDRI files),
    RT owned by `environment.ts`; theme/tier differences via `scene.environmentIntensity` — never re-baked.
11. **Theme mapping**: existing `useTheme` is the only source of truth → `theme.ts` `BRAND`/`PALETTES`
    (exact globals.css tokens) + live read of `--background` for fog. `setTheme` mutates fog, exposure,
    lights, shadow tint and environment intensity **in place** — no scene recreation.
12. **WebGL fallback**: `supportsWebGL()` probe (releases its throwaway context) → `data-scene`
    attribute crossfades `.hero-decor` (static) ↔ `.hero-scene` (WebGL). Fallback preserves dimensions
    (zero CLS), keeps the hotspot/connector/card overlay in its static placement.
13. **Context-loss handling**: `webglcontextlost` → `preventDefault`, pause RAF, report fallback;
    `webglcontextrestored` → resume the *same* engine (no duplicates). If unsafe, fallback persists.
14. **Cleanup/disposal**: unmount cancels RAF, disconnects IO/RO, removes listeners, `disposeObject`
    traversal (geometry/material/textures), PMREM RT, `renderer.dispose()`, `forceContextLoss()`,
    canvas removed — Strict Mode double-mount proven safe (exactly one canvas after 3 remount cycles).
15. **Reduced motion**: assembly snaps to completed, idle/parallax/scroll amplitudes → 0 (still one
    running loop so hover/fallback stay responsive), tilt hook disabled, CSS animations neutralized by
    the global override. Proven static to <1.5 px/700 ms while the engine runs.
16. **Mobile**: coarse/small viewport → LOW/MEDIUM tier, DPR ≤1.25–1.5, no pointer parallax/raycast,
    fewer objects, connector hidden ≤640 px, camera pulls back (`max(8.2, 9.05/aspect)`) to fit.
17. **Performance decisions**: no postprocessing, no external assets, no shadow maps (fake canvas
    contact shadow), throttled raycast (70 ms), IO + visibilitychange pausing, hero-range scroll only,
    bounded-window FPS monitor (downgrade-only, hysteresis). **Bundle facts**: home initial JS
    667 KB raw / **206 KB gz** (10 scripts, no three); admin initial 630 KB raw / 196 KB gz (no three);
    three async chunk **595 KB raw / 149 KB gz**, fetched only when the hero scene actually loads.
18. **Add a new 3D object**: write a builder in `createTechObjects.ts` (procedural only), add an entry
    to `SUPPORT_POSITIONS`/`SUPPORT_SCALES`, push it into `builders` — tier visibility and raycast
    targeting pick it up automatically.
19. **Tune object count**: `quality.ts` → `QUALITY[tier].supportCount` / `.particleCount`.
20. **Tune quality**: `quality.ts` (`QUALITY`, `detectInitialTier`, `createFpsMonitor` thresholds).
21. **Tune colors**: `theme.ts` (`BRAND`, `PALETTES`) — sourced from globals.css tokens; never inline.
22. **Tune everything else**: ribbon geometry → `createRibbonPieces.ts` constants; piece targets →
    `RIBBON_PIECES`/positions there; support placement → `SUPPORT_POSITIONS`; animation speeds →
    `animation.ts` (`ASSEMBLY_DURATION`, amplitudes); pixel ratio → `quality.ts`; hotspot/card →
    `HeroScene.tsx` + `.hero-hotspot`/`.hero-connector` in globals.css.

## 2026-10-02 — 3D Phase 11: Final documentation + verification

### Completed
- §26 "3D / Three.js Architecture" added (all 22 required topics: versions, rationale, lazy loading,
  route isolation, scene graph, renderer, tiers, counts, materials, environment, theme bridge,
  fallback, context loss, disposal, reduced motion, mobile, performance + bundle facts, and the five
  tuning guides). Tech Stack table already carries the `three`/`@types/three` rows with the required
  reason string. README §9 covers public-only scope, quality tiers, WebGL troubleshooting and commands.
- Bundle impact measured from the production build (no estimates): three = 595,110 B raw /
  149,015 B gz in its own async chunk; home initial 667,111 B raw / 205,936 B gz; admin initial
  629,847 B raw / 196,096 B gz — **neither route's HTML references the three chunk**.

### Final verification
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes).
- `node scripts/verify-three.mjs` ✅ **47/47** · `NO_WEBGL=1 node scripts/verify-three.mjs` ✅ **7/7**.
- `Backend`: `npm run lint` ✅, `npm run build` ✅ (39 files), `npm run smoke` ✅ **53/53** — no backend
  file was modified for the 3D work (only the dev-only gitignored `CLIENT_ORIGIN` env value gained
  `http://localhost:3001`).

### Honest limitations
- Lighthouse unavailable in this CLI → no Lighthouse score claimed.
- Firefox/Safari unavailable → Chromium-verified; others code-reviewed only.
- SwiftShader X4122 warning (headless software GL) documented under Known Issues; not app-originated.

## 2026-10-02 — Task B Phase 1: Audit + Main Logo inspection

### Completed
- Re-read `PROJECT_NOTES.md` / `README.md`, re-inspected the real repository (frontend + `Backend`), all
  package.json files, the theme/token system (`globals.css` + `useTheme`), the `Logo` component, the
  `components/three/*` module, `verify-three.mjs`, and the backend auth/Admin/seed/routes code.
- **Main Logo.png inspected by decoding the PNG pixels** (no guessing): `public/Main Logo.png` is
  **4096×4096 RGBA with genuine alpha** — corners *and* centre are fully transparent (61.4% fully
  transparent, 0.19% fully opaque, 38.4% partial from the soft glow/anti-aliasing). Content bbox
  (alpha>200) = 3847×3742 — a near-square **hollow rotated-square diamond** of straight ribbon bands,
  built from the brand blues, with a **green triangular leaf along the top-right** and a **darker
  overlapping fold**. The existing 3D annular-arc ribbon is confirmed wrong vs. the real mark.
- Asset inventory: `brand/logo-horizontal.png` = owner `Horizontal Logo.png`; `brand/logo-stacked.png` =
  `Primary Logo.png`; `brand/logo-icon.png` = `app-icon-dark.png` = `app-icon-light.png` = `Icon.png`
  (identical bytes — i.e. the light/dark app icons are not actually different).
- Confirmed the offending white plate: `Logo.tsx` adds `dark:rounded-xl dark:bg-white dark:px-2.5
  dark:py-1.5` when `plate` is on (default) for lockup variants — visible in the navbar/footer/admin.
- Backend reality vs. spec: `Admin.role` enum was `admin|editor|super-admin`, no `isActive`, no `name`;
  the seed **overwrote** `passwordHash` on every run and forced `role: "admin"`; `requireAuth` re-read
  the document but did not check `isActive`/role; `/auth/me` returned only `{id,email,role}`.
- **Baseline** (Task A final, unchanged since): frontend lint 0 problems + build 12 routes; backend lint
  + build 39 files + smoke **53/53**; three harness **47/47** + NO_WEBGL **7/7**.

### Security remediation (flag)
- The tracked `Backend/.env.example` contained real-looking credentials (Mongo URI, JWT secret,
  Cloudinary keys, admin email/password). It is now a **placeholder-only template** (added
  `ADMIN_NAME`, `SEED_RESET_ADMIN_PASSWORD`, `DEMO_ADMIN_EMAIL`, `SENSITIVE_RATE_LIMIT_MAX`). The live
  gitignored `Backend/.env` is untouched. **Owner action:** rotate any credential that was previously
  committed (values are never reproduced here).

### Files Changed
- `Backend/.env.example`, `PROJECT_NOTES.md`

## 2026-10-02 — Task B Phase 2: Backend Super Admin foundation

### Completed
- `Admin` model: added `name`; role enum is now `admin | super_admin` (legacy `editor` → `admin`,
  `super-admin` → `super_admin` migrated idempotently in the seed); added `isActive` (default true);
  `toPublic()` now returns `id, email, name, role, isActive, lastLoginAt, createdAt, updatedAt` and
  never the hash.
- `requireAuth` now **re-reads the Admin document on every request** and rejects deactivated accounts
  (403) and unknown/deleted accounts (401) — JWT role claims are never trusted for authorization.
  Added the reusable **`requireRole(...roles)`** middleware (mounted after `requireAuth`).
- `/api/auth/me` returns the safe current-user object including `role` and `isActive`.
- Login rejects deactivated accounts (403) after a valid password check; login still returns a generic
  401 for wrong password / unknown email (no enumeration).
- **Self-service change password**: `POST /api/auth/password` (`currentPassword` + `newPassword`),
  rate-limited, verifies the current password, enforces the shared strength policy, re-issues the
  session cookie and never returns or logs a password.
- **Team management** (`/api/admin/team`, gated by `requireRole("super_admin")`): list, create, edit
  role, activate/deactivate, reset password, delete. Emails normalized + unique; passwords validated
  and **never returned**; sensitive routes rate-limited (`sensitiveLimiter`).
- **Server-side safety rules**: a Super Admin cannot demote/deactivate/delete themselves; the last
  active Super Admin can never be demoted/deactivated/deleted (enforced in `teamController.js`, not by
  the frontend guard).
- **Audit log** (`models/AuditLog.js` + `utils/audit.js`): append-only, fire-and-forget records for
  admin created / role changed / activated / deactivated / password reset / deleted / password changed.
  Records actor, action, target, safe metadata and IP — never passwords or hashes.
- **Idempotent seed**: the configured `ADMIN_EMAIL` account is promoted to `super_admin` and activated;
  its password is **preserved** unless `SEED_RESET_ADMIN_PASSWORD=true` (then it is reset and this is
  logged safely). A legacy/demo account (`DEMO_ADMIN_EMAIL`, default `admin@jazaritech.com`) is
  **deactivated** (never deleted) unless it is the configured account.

### Files Changed
- `Backend/models/Admin.js`, `Backend/models/AuditLog.js`, `Backend/utils/password.js`,
  `Backend/utils/audit.js`, `Backend/middleware/auth.js`, `Backend/middleware/rateLimiter.js`,
  `Backend/config/env.js`, `Backend/controllers/authController.js`, `Backend/controllers/teamController.js`,
  `Backend/routes/auth.routes.js`, `Backend/routes/team.routes.js`, `Backend/routes/admin.routes.js`,
  `Backend/scripts/seed.js`, `Backend/scripts/smoke.js`, `Backend/.env.example`

### Verification
- `Backend`: `npm run lint` ✅, `npm run build` ✅ (44 files), `npm run smoke` ✅ **81/81** (adds 28
  Super Admin assertions: promotion, role in JWT, DB re-check, inactive/deleted loss of access, normal
  admin retains access + blocked from team, self/last-super-admin protection, password never returned,
  idempotent non-destructive seed).
- Credentials were never printed, echoed or written to any file. Safe statement: *Super Admin
  authentication verified successfully using the configured environment credentials.*
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (12 routes) — no frontend change yet.

## 2026-10-02 — Task B Phase 3: Admin portal — Team + Account

### Completed
- `/admin/team` (`components/admin/TeamManager.tsx`): administrator list, create, edit role, activate /
  deactivate, reset password, delete — with loading, error, empty and success states, safe confirmation
  dialogs and password fields that never echo a value back. Self and last-Super-Admin actions are
  disabled in the UI, but the backend remains the real boundary.
- `/admin/account` (`components/admin/AccountPanel.tsx`): profile summary (name, email, role badge,
  status) + change-password form.
- `AdminShell`: sidebar Team item is rendered **only for `super_admin`**; a frontend route guard
  redirects normal admins away from `/admin/team`; the top bar now shows the current user's name/email
  and a **text** role badge (“Super Admin” / “Admin”, never colour-only). Added an Account link.
- `types/api.ts` + `lib/api.ts`: `AdminRole`, `AdminTeamMember`, `admin.team.*` and
  `auth.changePassword` (single API client preserved — no second client).

### Files Changed
- `frontend/types/api.ts`, `frontend/lib/api.ts`, `frontend/components/admin/AdminShell.tsx`,
  `frontend/components/admin/TeamManager.tsx` (new), `frontend/components/admin/AccountPanel.tsx` (new),
  `frontend/app/admin/(portal)/team/page.tsx` (new), `frontend/app/admin/(portal)/account/page.tsx` (new)

### Verification
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (14 routes incl. `/admin/team`, `/admin/account`).
- Live check against the running API: configured account `role=super_admin`, `isActive=true`,
  `GET /api/admin/team` → 200, no password hash in any payload. Safe statement only — *Super Admin
  authentication verified successfully using the configured environment credentials.*

## 2026-10-02 — Task B Phase 4: Main Logo rollout

### Completed
- `scripts/build-logo-assets.mjs` (new, dependency-free): decodes `public/Main Logo.png` (4096×4096
  RGBA, genuine transparency), trims to the alpha bounding box (+3% padding), alpha-weighted box
  downsamples and re-encodes compact RGBA PNGs → `public/brand/logo-main.png` (512×501, 172 KB) and
  `public/brand/app-icon-main.png` (512×512, 121 KB). Owner originals are untouched.
- `Logo.tsx` rewritten: the mark plus **live HTML wordmark** (`Jazari` navy / light in dark mode,
  `Tech` Technology Blue, `OFFICIAL` Official Slate wide-tracked). **The dark-mode white plate is gone**
  (`plate` prop removed entirely). Variants: `full`, `compact`, `mark`.
- Rolled out to navbar (compact), mobile drawer (shares the navbar logo), footer (full), admin login
  (full), admin sidebar (compact), admin loading state (mark), hero brand tile (mark). Favicon/app icon
  metadata now points at `/brand/app-icon-main.png`. Horizontal/stacked/icon PNGs remain in `public/`
  but are no longer referenced by the UI (OG/Twitter images still use the wide lockup).

### Files Changed
- `frontend/scripts/build-logo-assets.mjs` (new), `frontend/public/brand/logo-main.png` (new),
  `frontend/public/brand/app-icon-main.png` (new), `frontend/components/brand/Logo.tsx`,
  `frontend/components/navigation/Navbar.tsx`, `frontend/components/layout/Footer.tsx`,
  `frontend/app/admin/login/page.tsx`, `frontend/components/admin/AdminShell.tsx`,
  `frontend/components/sections/Hero.tsx`, `frontend/app/layout.tsx`

### Verification
- `npm run lint` ✅, `npm run build` ✅ (14 routes). Harness checks: “Main Logo asset exists”, “Main Logo
  asset is used in the navbar”, “no white plate behind the logo” (light **and** dark), “Main Logo used
  on the admin login screen” — all pass. Screenshots confirm no white rectangle in either theme.

## 2026-10-02 — Task B Phases 5–6: Hero rebalance + Three.js logo rebuild

### Completed
- **Hero layout** (Phase 5): headline moved from `text-display` to the existing `text-h1` token, tighter
  vertical rhythm (`pt-28/32`, `mt-5/6/7`) — **2 lines at 1366×768**. Harness proves headline,
  subheading, both CTAs and the trust chip are above the fold at 1366×768 (and by construction at
  1440×900 / 1920×1080), and that the primary CTA is above the fold at 390×844.
- **3D logo rebuild** (Phase 6): `createRibbonPieces.ts` replaced annular arcs with **four straight
  extruded ribbon bands** (`THREE.Shape` + `ExtrudeGeometry`) forming a rotated-square diamond — flat
  outer edges, rounded outer corners only, gaps at all four vertices, alternating z-stagger. The
  top-right band carries a **lighter-blue fold triangle**, the lower-right band a **darker overlapping
  fold**, and a **Growth-Green leaf** (one rounded corner) sits at the top-right as the hotspot anchor.
  No annular arcs, no torus, no generic X.
- Composition: logo enlarged (inradius 1.15), supports scaled to ~1.2–1.45× and recomposed with depth
  staging (chip top-left, cloud top-right, shield right, gear bottom-left, data top-centre deep) so the
  right side is populated; bottom-right stays clear for the glass card. Camera fit retuned
  (`MIN_CAMERA_Z` 9.0 / `FIT_CAMERA_Z` 9.3); assembly shortened to 1.1 s.

### Files Changed
- `frontend/components/sections/Hero.tsx`, `frontend/components/three/createRibbonPieces.ts`,
  `frontend/components/three/createTechObjects.ts`, `frontend/components/three/engine.ts`,
  `frontend/components/three/animation.ts`

### Verification
- `npm run lint` ✅, `npm run build` ✅. Harness: scene activates, one canvas, idle motion alive,
  reduced-motion static, context loss/restore, mobile tier, screenshots. Screenshot pixel analysis of
  the light desktop render shows the diamond bands with gaps, the green leaf top-right and supports
  populating both sides of the frame.

## 2026-10-02 — Task B Phases 7–8: Motion tokens, first load, site-wide polish

### Completed
- **Motion tokens** added to `:root` (aliases + richer easings + the intro timeline). Single system.
- **First-load choreography** (≈1.5 s total, CSS-only): inline `<head>` script adds `html.js` and (only
  when motion is allowed) `html.js-intro`. Logo → navbar → headline (word-by-word masked slide-up) →
  subheading → CTAs (staggered) → trust chip → counters, plus the 3D assembly. `.reveal` hidden state is
  now gated on `.js-intro`, so **without JS or under reduced motion all content is visible from first
  paint**; there is no blocking preloader and the HTML stays server-rendered.
- **Site-wide polish**: navigation underline, primary/accent button highlight sweep, section-heading
  accent line (`.heading-rule`, drawn on reveal) in Services / Products / Start-Your-Project, admin page
  entrance + table-row stagger (`.admin-enter`), footer reveal, and a **desktop-only pointer glow**
  (`PointerGlow`, rAF, fine-pointer only, off under reduced motion, `pointer-events:none`, z-0 behind
  `main`/`footer`). Existing scroll progress, marquee, tilt cards and icon system preserved.
- New `Reveal` variants: `fade-scale`, `blur-in` (existing variants unchanged).

### Files Changed
- `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`,
  `frontend/components/motion/PointerGlow.tsx` (new), `frontend/components/motion/Reveal.tsx`,
  `frontend/components/sections/Hero.tsx`, `frontend/components/navigation/Navbar.tsx`,
  `frontend/components/layout/Footer.tsx`, `frontend/components/admin/AdminShell.tsx`,
  `frontend/components/services/ServicesGrid.tsx`, `frontend/components/products/ProductCards.tsx`,
  `frontend/components/forms/StartProjectForm.tsx`

### Verification
- `npm run lint` ✅, `npm run build` ✅. Harness: intro ran (`js-intro` present) and the headline ends
  fully visible; **reduced motion bypasses the choreography** (`js-intro` absent) and content is visible.

## 2026-10-02 — Task B Phases 9–10: Performance/a11y audit + harness & screenshots

### Completed
- `verify-three.mjs` extended (existing checks preserved and strengthened) with a **brand/layout/first-load
  suite**: Main Logo asset exists + is used + no white plate (both themes), headline ≤3 lines at
  1366×768, both CTAs + subheading + trust content above the fold at 1366×768 and 390×844, static
  fallback exists, first-load completes, reduced motion bypasses the intro, admin login uses the Main
  Logo — plus **screenshots**. The harness no longer hardcodes any credential (it reads
  `../Backend/.env` when present; credentials are never printed).
- **Screenshots** written to `frontend/test-output/screenshots/` (gitignored):
  `home-light-desktop-1366x768.png`, `home-dark-desktop-1366x768.png`,
  `home-light-mobile-390x844.png`, `home-dark-mobile-390x844.png`,
  `home-reduced-motion-1366x768.png`, `admin-login-light-1366x768.png`.
- Performance/a11y/responsive audit: admin still loads **zero three-chunk resources** and has zero
  canvases; 3× SPA round-trips keep exactly one canvas with a bounded heap; mobile resolves to the
  MEDIUM/LOW tier with real canvas dimensions; canvas is `aria-hidden`, non-focusable and never blocks
  the UI; one `h1`; landmarks intact; reduced-motion path is lightweight (no particle/parallax work).

### Verification
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (14 routes).
- `node scripts/verify-three.mjs` ✅ **64/64** · `NO_WEBGL=1 …` ✅ **9/9**.
- `Backend`: `npm run lint` ✅, `npm run build` ✅ (44 files), `npm run smoke` ✅ **81/81**.
- **Bundle facts (measured):** three async chunk 595,574 B raw / 149,799 B gz; home initial 668,171 B
  raw / 206,228 B gz (+1,060 B raw vs Task A); admin initial 630,394 B / 196,212 B gz (+547 B raw);
  `/admin/team` initial 637,464 B / 197,960 B gz. The home HTML still references the three chunk; the
  admin HTML does not.

## 27. Super Admin, Brand & Motion Architecture

1. **Roles**: `admin`, `super_admin` (`models/Admin.js`). `isActive` gates access immediately.
2. **Authorization**: `requireAuth` re-reads the Admin document every request; `requireRole(...roles)`
   is mounted once for `/api/admin/team`. The frontend guard is UX only.
3. **Team API**: list / create / role / activate-deactivate / reset-password / delete, rate limited
   (`sensitiveLimiter`), emails normalized + unique, passwords validated and never returned.
4. **Safety**: self-protection and last-active-Super-Admin protection live in `teamController.js`.
5. **Audit**: `AuditLog` (+ `recordAudit`) — actor, action, target, safe metadata, IP; no secrets.
6. **Seed**: promote + activate `ADMIN_EMAIL`; preserve its password unless `SEED_RESET_ADMIN_PASSWORD`;
   deactivate the demo account (`DEMO_ADMIN_EMAIL`) unless it *is* the configured account.
7. **Admin portal**: `/admin/team` (super-admin only in the sidebar + a route guard), `/admin/account`
   (change password); top bar shows name/email + a text role badge.
8. **Brand**: one `Logo` component renders `public/brand/logo-main.png` (built by
   `scripts/build-logo-assets.mjs`) plus live wordmark text. No white plate anywhere; the artwork is
   never filtered or inverted.
9. **Logo geometry**: `createRibbonPieces.ts` — tuning constants `R` (inradius), `W` (band width),
   `GAP` (vertex gap), `DEPTH`/`BEVEL`/`OUTER_RADIUS` (extrusion + rounded outer corners), `FOLD_SIZE`
   (top/right folds), `LEAF_SIZE` (green leaf). Pieces are indexed 0=top-right … 3=lower-right.
10. **Composition**: `createTechObjects.ts` — `SUPPORT_POSITIONS`, `SUPPORT_SCALES`, `SHADOW_Y/SCALE`,
    `POINT_*`. `engine.ts` — `MIN_CAMERA_Z`/`FIT_CAMERA_Z` (responsive fit).
11. **Motion tokens**: globals.css `:root` (`--motion-*`, `--ease-*`, `--intro-*-delay`).
12. **First load**: `html.js-intro` gates every entrance animation; remove it (or disable JS) and the
    site renders fully visible. Reduced motion never adds the class.
13. **Site polish**: `.nav-link`, `.heading-rule`, `.btn-primary/.btn-accent::after`, `.admin-enter`,
    `.pointer-glow` (globals.css §9), `PointerGlow` component.

### Tuning guide
- **Animation timing**: globals.css `:root` `--intro-*-delay` / `--intro-word-step` / `--motion-*`;
  3D assembly → `animation.ts` `ASSEMBLY_DURATION`.
- **3D colours**: `theme.ts` `BRAND` / `PALETTES` (from globals.css tokens); `materials.ts` for finish.
- **3D object count**: `quality.ts` `QUALITY[tier].supportCount` / `.particleCount`;
  `createTechObjects.ts` `SUPPORT_POSITIONS` / `SUPPORT_SCALES`.
- **3D quality**: `quality.ts` (`pixelRatioCap`, `environmentIntensity`, `hover`).
- **Hero composition**: `createTechObjects.ts` constants + `engine.ts` camera fit.
- **Logo geometry**: `createRibbonPieces.ts` constants (see §27.9).

### Known issues / honest limitations (Task B)
- **Main Logo.png has a proportionally large green region** on its top-right edge (≈27%×28% of the
  trimmed mark). The spec's hard brand rule (“Growth Green is a micro-accent only”) and its explicit
  3D description (“small green triangular leaf”) were followed for the **3D** object, so the procedural
  leaf is a micro-accent rather than a full green edge. The **2D UI mark** is the owner's real PNG and
  is used unmodified. If the owner wants the 3D to match the PNG's green edge exactly, the brand rule
  would need revisiting.
- **`Backend/.env.example` previously contained real-looking credentials** and is now a placeholder-only
  template (the live `Backend/.env` is untouched). The owner should rotate any credential that was ever
  committed; values are not reproduced anywhere in this repo’s docs.
- **Lighthouse and Firefox/Safari remain unavailable** in this environment — no Lighthouse score is
  claimed; all runtime verification is Chromium (headless) only.
- The harness runs against the **production preview** (`next start -p 3001`); the dev server on :3000 is
  unaffected.

## 2026-10-02 — Task C Phases 5–9: Premium logo-only showcase + harness

### Completed
- **Phase 5 — showcase rebuilt** (`components/products/LogoMarquee.tsx`): a labelled region
  (`aria-labelledby="products-showcase-heading"`) with eyebrow, real heading + `.heading-rule`,
  supporting copy and an **API-derived** product count (`Counter`). Logos float directly on the page —
  the item, frame and image all have `background: transparent; border: none; box-shadow: none` (never a
  pill/card/plate). Optical normalization via a shared optical box (`--logo-w`/`--logo-h` +
  `object-fit: contain`). Rows are counter-scrolling with slightly different speeds; each row repeats
  its set to `MIN_ROW_ITEMS` (12) and is duplicated, so the `-50%` loop is seamless and fills ultrawide
  viewports. All visual repeats are `aria-hidden` + `tabIndex -1`; only the logical set is in the a11y
  tree. Empty / error / loading states are designed (logo-shaped skeleton, never pills).
- **Phase 6 — theme legibility:** `tone`-driven, **non-rectangular** contrast aids via `filter:
  drop-shadow(...)` on the image only — dark logos glow softly on dark surfaces, light logos get a
  navy/blue edge glow on light surfaces, colourful marks keep their real colours. No plates, no
  recolouring, no second theme system (reuses `useTheme`).
- **Phase 7 — interaction + motion:** hover **and** keyboard focus pause the relevant row, lift/scale the
  logo, add a Technology Blue glow and slide in the floating name label (with a Growth-Green micro-dot
  when the logo links out). Idle float, section-level ambient glow and hairlines with a subtle shimmer.
  Damped **scroll-velocity awareness** (one rAF, capped, returns to base, disabled under reduced
  motion). Off-screen pause (IntersectionObserver) and hidden-tab pause. **Reduced motion → a static,
  centred wrapped grid** (no marquee, float or shimmer). External links use
  `target="_blank" rel="noopener noreferrer"`.
- **Phase 8 — a11y + performance:** semantic region + heading, meaningful alt (falls back to display
  name), non-card focus indication, colour never the only signal; transform/opacity only, no per-logo
  timers, one rAF, `will-change` only on the tracks; measured bundle impact below.
- **Phase 9 — harness + screenshots:** `scripts/verify-three.mjs` extended with a `[12]` block of **15
  logo checks** (no pill/card, images load, fallback monogram, seamless loop, hover/focus pause, reduced
  motion grid, theme legibility, CLS, responsive, API contract, 0/1/3/12 logos via response
  interception). The old 1×1 fixture seeding was replaced with the real brand mark. **95/95** passed and
  `NO_WEBGL` **9/9**.
- Added `scripts/capture-products.mjs` for before/after showcase screenshots.

### Files Changed
- `frontend/components/products/LogoMarquee.tsx` (rebuilt), `frontend/app/globals.css` (showcase
  styles + `.logo-checker`), `frontend/scripts/verify-three.mjs` (extended),
  `frontend/scripts/capture-products.mjs` (new).

### Verification
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (14 routes).
- `node scripts/verify-three.mjs` ✅ **95/95** · `NO_WEBGL=1 …` ✅ **9/9**.
- Real data run: `Fix all existing logos` over the current dataset → `{processed:2, alreadyGood:1,
  needsTransparentPng:1, failed:0}` (WS Toys + VPSA cleaned; UCF already transparent; Irhas'Inn flagged).
- Screenshots: `test-output/screenshots/{before,after}-{light,dark}-{desktop-1366x768,mobile-390x844}.png`.

### Bundle facts (measured)
- Home referenced JS: 671,676 B raw / **207,194 B gz** (Task B: 668,171 / 206,228 → +3,505 raw / +966 gz).
- `/admin/logos` referenced JS: 643,674 B raw / **199,542 B gz** (Task B admin initial 630,394 / 196,212).

### Known issues
- The `prefers-reduced-motion` theme-legibility check passes vacuously when the dataset has no
  light-tone logos (asserted but not exercised) — recorded honestly.

## 2026-10-02 — Task C Phases 3–4: Admin Logos Manager + frontend contract

### Completed
- **Phase 4 — contract sync:** `frontend/types/api.ts` + `frontend/lib/api.ts` now mirror the backend
  exactly (`PublicLogo` with displayName/websiteUrl/tone/backgroundStatus/dimensions/dominantColors,
  `AdminLogo` with original refs, `LogoProcessingOptions`, `ReprocessLogoResponse`, `BulkFixResponse`).
  Same single API client — no second client. `api.admin.logos.{reprocess,revert,bulkFix}` added.
- **Phase 3 — Logos Manager** (`components/admin/LogosManager.tsx`, extended not rewritten):
  before/after preview on a **checkerboard transparency surface** (preview-only, never part of the
  logo), Remove-background toggle, tolerance slider, Trim toggle, server-side processing, text status
  badges (`Transparent` / `Background kept` / `Needs transparent PNG` — never colour-only),
  Reprocess, Revert to original, and **“Fix all existing logos”** bulk action with confirmation,
  progress, and a processed/already-good/needs-PNG/failed/total summary + failure list. Existing
  upload/replace/reorder/show-hide/delete and progress UI preserved. Optional display name + website
  URL fields added (client validation is UX only).
- `globals.css`: added the admin-only `.logo-checker` transparency preview surface.

### Files Changed
- `frontend/types/api.ts`, `frontend/lib/api.ts`, `frontend/components/admin/LogosManager.tsx`,
  `frontend/app/globals.css`, `PROJECT_NOTES.md`.

### Verification
- `frontend`: `npx tsc --noEmit` ✅, `npm run lint` ✅ (0 problems), `npm run build` ✅ (14 routes).

## 2026-10-02 — Task C Phase 2: Backend logo image pipeline

### Completed
- **`sharp` installed** (single permitted image dependency; prebuilt Windows binaries — no compiler).
- **`services/imageProcessor.js`** — deterministic pipeline: decode → auto-orient → bound to 1280×720
  (no upscaling) → border ring analysis → **border-connected flood fill** (never a global colour
  replace; tolerance 0–100 → RGB distance) → true alpha with a ~1.35× feather band → transparent-pad
  trim → PNG with alpha → metadata (`width, height, aspectRatio, hasAlpha, dominantColors,
  averageLuminance, tone`).
- **Background confidence:** `removed` (safe solid/near-solid, bounded removal share) · `kept`
  (nothing safely removed) · `needs-transparent-png` (complex/opaque outer field, undecodable input,
  or removal outside safe bounds). Integrity always beats forced transparency.
- **`storageService.js`** — added `storeOriginal`, `storeProcessed`, `fetchStoredBytes`; both Cloudinary
  and local drivers supported, never bypassed.
- **`models/Logo.js`** — optional metadata + `originalUrl/originalPublicId` + `displayName`/`websiteUrl`
  (legacy documents remain valid).
- **`controllers/logoController.js`** — process on create/replace; `reprocess` (idempotent, from the
  preserved original, skips asset churn when unchanged); `revert`; `bulk-fix` (per-item isolation,
  never deletes an original before new output exists, returns processed/already good/needs manual/
  failed/total); public serializer exposes only safe fields; delete removes processed **and** original.
- **Routes:** `POST /api/admin/logos/:id/reprocess`, `/logos/:id/revert`, `/logos/bulk-fix` +
  validation for `displayName`, `websiteUrl` (http/https only), `removeBackground`, `trim`, `tolerance`.

### Files Changed
- `Backend/services/imageProcessor.js` (new), `Backend/services/storageService.js`,
  `Backend/models/Logo.js`, `Backend/controllers/logoController.js`, `Backend/routes/admin.routes.js`,
  `Backend/scripts/smoke.js`, `Backend/package.json` (+lockfile).

### Verification
- `Backend`: `npm run lint` ✅, `npm run build` ✅ (45 files), `npm run smoke` ✅ **117/117** (was 81).
- Processor validated on synthetic fixtures: solid bg → corners transparent + centre preserved;
  enclosed black-in-white ring protected; per-pixel noise → `needs-transparent-png` (not destroyed);
  1×1 fixture → honest `needs-transparent-png`.

### Known issues / follow-up
- Irhas'Inn-class logos (opaque enclosed field) will report `needs-transparent-png` by design.

## 2026-10-02 — Task C Phase 1: Logo showcase + image-pipeline audit & root cause

### Completed
- Read `PROJECT_NOTES.md` + `README.md` and inspected the real repository: `LogoMarquee.tsx`,
  `Marquee.tsx`, `LogosManager.tsx`, `models/Logo.js`, `controllers/logoController.js`,
  `services/storageService.js`, `routes/admin.routes.js` + `public.routes.js`, `lib/api.ts`,
  `types/api.ts`, `hooks/*`, `globals.css`, `next.config.ts`, `scripts/verify-three.mjs`,
  `Backend/scripts/smoke.js`, `Backend/config/env.js`.
- Captured baseline: frontend lint ✅, build ✅ (14 routes), backend lint ✅, build ✅ (45 files),
  smoke ✅ **81/81**, harness ✅ **64/64** + NO_WEBGL ✅ **9/9**.
- Captured BEFORE screenshots (`capture-products.mjs before`) → `test-output/screenshots/`.
- Verified `sharp` installs cleanly on this Windows environment (prebuilt binaries, no compiler).

### Root-cause investigation (evidence, not guesses)
The live public dataset was inspected over real HTTP and decoded to raw RGBA:

| # | Name | HTTP | Format | Dimensions | Alpha | Corners | Verdict |
|---|------|------|--------|-----------|-------|---------|---------|
| 1 | Irhas'Inn | 200 | JPEG | 908×367 | none | opaque gold/greys | complex: opaque **black field inside a gold frame** → keep |
| 2 | WS Toys | 200 | JPEG | 720×720 | none | uniform `rgb(21,90,168)` | solid blue → removable |
| 3 | Verify Logo A | 200 | PNG | **1×1** | partial 100% | `rgba(255,0,0,127)` | **1×1 red pixel** |
| 4 | Verify Logo B | 200 | PNG | **1×1** | partial 100% | `rgba(255,0,0,127)` | **1×1 red pixel** |
| 5 | UCF Foundation | 200 | PNG | 748×720 | genuine | transparent | already transparent |
| 6 | VPSA | 200 | JPEG | 720×720 | none | uniform `rgb(253,253,253)` | solid white → removable |

- **Empty-pill cause (primary):** "Verify Logo A" and "Verify Logo B" are **1×1 semi-transparent
  red PNGs (95 bytes each)**. A 1×1 source cannot produce a visible logo at any render size, so their
  pill renders empty. They are seeded by the verification harness itself
  (`scripts/verify-three.mjs` → `ensureLogos()` posts a 1×1 `PNG_1PX` data URI). The real bug is
  therefore **twofold**: (a) the harness seeds junk fixtures into the live dataset; (b) the upload
  pipeline accepts images with **no dimension sanity check**, and the showcase has **no fallback** for
  an asset that cannot render. HTTP status is 200 with correct content-type — so this is *not* a broken
  URL, deleted-asset, optimizer, or CSS-invisibility problem.
- **Baked-background cause:** the real logos are **JPEGs with no alpha channel**. The browser paints
  the source's own opaque background (WS Toys blue square, VPSA white square, Irhas'Inn black+gold
  rectangle). Irhas'Inn is *complex* (opaque black field enclosed by a gold frame) and is **unsafe**
  for automatic removal; WS Toys and VPSA are uniform solids and are safely removable.
- **Pill/card cause:** `LogoMarquee.tsx` `LogoTile` wraps every image in
  `rounded-2xl border border-line bg-surface-elevated px-5 shadow-…` — a literal card/pill. The spec's
  absolute logo-only rule requires this wrapper to be removed.
- **Light/dark contrast:** VPSA is a white-background JPEG; on a white light-mode page it can vanish.
  The `tone` metadata + a non-rectangular contrast aid is required (no plates).

### Files Changed
- `frontend/scripts/capture-products.mjs` (new) — CDP before/after showcase screenshots.
- `Backend/package.json` + lockfile — added the single permitted image dependency `sharp`.
- `PROJECT_NOTES.md` (this entry).

### Verification
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (14 routes).
- `Backend`: `npm run lint` ✅, `npm run build` ✅ (45 files), `npm run smoke` ✅ **81/81**.
- `node scripts/verify-three.mjs` ✅ **64/64** · `NO_WEBGL=1 …` ✅ **9/9**.
- Screenshots: `frontend/test-output/screenshots/before-{light,dark}-{desktop-1366x768,mobile-390x844}.png`.

### Known issues / follow-up
- Harness fixtures ("Verify Logo A/B") pollute the real dataset — Phase 2/9 must stop seeding junk and
  add a dimension sanity check + render fallback. **Resolved in Phase 9.**
- Irhas'Inn will be flagged `needs-transparent-png` (complex enclosed background) rather than faked.
  **Confirmed in Phase 9.**

## 28. Logo Showcase and Image Pipeline Architecture

### Processing flow (`Backend/services/imageProcessor.js`)
`decode → auto-orient (sharp .rotate()) → bound to 1280×720 (no upscaling) → border-ring
analysis → background decision → border-connected flood fill (when safe) → true alpha with a ~1.35×
feather band → trim transparent padding → PNG with alpha → metadata`.

- **Border analysis** samples the outer pixel ring and measures the *dominant* colour by colour distance
  (not by a single quantized bucket, which would let JPEG noise look “complex”).
- **Frame detection** compares the border colour with the image's global dominant colour: if the border
  is a colour that only covers a thin sliver while a large share of the image is one enclosed colour, it
  is treated as a decorative frame (black field inside a gold frame) and **preserved**.
- **Flood fill** starts at the border and removes only *border-connected* regions within the tolerance —
  never a global colour replace — so enclosed artwork (black inside a frame, white lettering inside a
  white logo) survives.
- **Integrity guards:** removals outside `3% ≤ share ≤ 90%` are refused (a tiny removal is an eaten
  border; a huge removal is a flat image). Both are flagged rather than faked.

### `backgroundStatus` confidence
- `removed` — high-confidence solid/near-solid background, or already transparent.
- `kept` — nothing safely removed (unprocessed upload / `removeBackground:false`).
- `needs-transparent-png` — complex/framed/undecodable, or a refused removal. The original is preserved
  and the admin should upload a genuinely transparent PNG.

### `tone` classification
Luminance is the primary axis: `< 0.45 → dark`, `> ~0.7 (low saturation) → light`, otherwise
`colorful`. This drives the frontend contrast aid (dark logos on dark surfaces, light logos on light
surfaces) instead of forcing every logo to monochrome.

### Original / processed asset strategy (`Backend/services/storageService.js`)
- Upload preserves the **untouched original** (`storeOriginal`) and produces a **processed PNG**
  (`storeProcessed`), stored as two distinct assets (`originalUrl/originalPublicId` +
  `secureUrl/publicId`). Both Cloudinary and the local driver go through the same abstraction — never
  bypassed. `fetchStoredBytes` reads an original back for reprocess.

### Operations (`Backend/controllers/logoController.js`)
- **Reprocess** — always from the preserved original (never processed→original); idempotent: if the
  pipeline would produce the same asset it is left untouched (no churn, no orphan).
- **Revert** — points the delivered asset back at the untouched original and clears `hasAlpha`.
- **Bulk fix** — processes every logo from its original, per-item try/catch (one failure never aborts
  the batch), returns `processed / alreadyGood / needsTransparentPng / failed / total` + per-item detail.
- **Cleanup order** — create + verify new asset → update DB → then delete obsolete. On DB failure the
  old asset is retained; a failed post-DB cleanup is logged, never corrupts the active record. Delete
  removes **both** processed and original (deduplicated) and never touches shared/other assets.

### Frontend rendering (`components/products/LogoMarquee.tsx`)
- **Logo-only rule:** item/frame/image carry no background, border or box-shadow; only section-level
  atmosphere (ambient glow, hairlines) exists.
- **Optical sizing:** one shared optical box (`--logo-w`/`--logo-h`) with `object-fit: contain` — wide,
  square, round and narrow marks feel balanced without distortion or cropping.
- **Marquee:** each row repeats its set to `MIN_ROW_ITEMS` (12) and duplicates the group; `-50%` loop is
  seamless and fills ultrawide. Direction alternates per row; speeds differ slightly. Repeats are
  `aria-hidden` + `tabIndex -1`.
- **Contrast aids:** tone-based `filter: drop-shadow(...)` on the image — non-rectangular, colour- and
  theme-aware.
- **Motion:** damped scroll-velocity on one rAF (capped, returns to base, off under reduced motion),
  hover/focus row pause, off-screen + hidden-tab pause, Reveal entrance, and a **static wrapped grid**
  under reduced motion.

### Verification
- `Backend/scripts/smoke.js` — 117 assertions incl. solid-bg removal (corners transparent, artwork
  preserved), complex-bg preservation, reprocess idempotency, revert, bulk fix, dual-asset delete, auth.
- `frontend/scripts/verify-three.mjs` — 95 checks incl. the 15 logo-showcase checks; NO_WEBGL 9/9.

### Tuning guide (actual files)
- **Marquee speed:** `frontend/components/products/LogoMarquee.tsx` row `duration={(58 + index * 9) *
  speedScale}`; base loop timing in `globals.css` `.logo-showcase__track` (`--logo-speed`).
- **Row count / fill:** `MIN_ROW_ITEMS` (LogoMarquee) and the `rows` effect (2, or 3 ≥1280px with ≥7).
- **Logo size:** `globals.css` `.logo-showcase { --logo-w / --logo-h / --logo-gap }`.
- **Glow / micro-accent:** `globals.css` `.logo-showcase__glow` (Technology Blue + Green),
  `.logo-item__dot` (Growth Green), hover glow on `.logo-item__frame`.
- **Contrast aid / thresholds:** `globals.css` tone rules (`[data-tone="dark"]`, `[data-tone="light"]`)
  and `imageProcessor.js` `computeMetadata` (luminance thresholds).
- **Background tolerance:** `imageProcessor.js` `DEFAULT_TOLERANCE` (22) + `FEATHER_RATIO`; per-request
  via `tolerance` (0–100). Higher removes more near-matching background; keep it low to protect
  enclosed artwork. Safety bounds in the flood-fill branch.
- **Bulk processing:** `logoController.js` `bulkFixLogos`; the admin trigger is `LogosManager.tsx`
  (“Fix all existing logos”). Extend by adding a per-item step inside the loop.
