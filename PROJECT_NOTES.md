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
| GET/POST | `/api/admin/logos` | JWT | List / upload (Cloudinary) |
| PUT/DELETE | `/api/admin/logos/:id` | JWT | Update / delete (Cloudinary delete) |
| PATCH | `/api/admin/logos/reorder` · `/api/admin/logos/:id/visibility` | JWT | Ordering / visibility |
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
| `Admin` | email, passwordHash, role (`admin`), lastLoginAt |
| `Logo` | name, secureUrl, publicId, alt, sortOrder, isVisible |
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
- Login rate limited; identical generic error for unknown email vs wrong password (no enumeration).

## 11. Cloudinary Architecture

- Server-side uploads only; credentials never reach the browser.
- Admin sends a validated base64 data URI → backend uploads with
  `quality: auto:best`, `format: auto`, capped at 1280×720 (`limit` + `fill` crop).
- Mongo stores `secureUrl` + `publicId`.
- Delete order: Cloudinary asset first, then Mongo record (failure is reported, state kept consistent).

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

## 22. In Progress

- None — all 10 phases completed and verified.

## 23. Planned

- Deployment handoff: real Cloudinary credentials + production MongoDB/env (owner-side).

## 24. Known Issues

- None yet.

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
