# Jazari Tech Official — Website

Full-stack marketing site + admin portal for **Jazari Tech Official**.

- **Frontend** — Next.js 16 (App Router, Turbopack), React 19, Tailwind v4. No runtime UI/animation
  dependencies: all motion is CSS keyframes, Web Animations API, IntersectionObserver and `requestAnimationFrame`,
  all icons are hand-written inline SVG.
- **Backend** — Node (ESM) + Express 5 + Mongoose 8 with Helmet, strict CORS, rate limiting,
  express-validator, JWT auth (httpOnly cookie), bcryptjs and Cloudinary storage.
- **Docs** — living project documentation lives in [`PROJECT_NOTES.md`](./PROJECT_NOTES.md)
  (architecture, API table, data model, design tokens, dated changelog).

```
Website/
├── frontend/          # Next.js public site + /admin portal
├── Backend/           # Express API (note the capital B)
├── PROJECT_NOTES.md   # living documentation
└── README.md          # this file
```

---

## 1. Prerequisites

- Node.js 20+ and npm
- MongoDB **only for production** — local development can use the bundled in-memory server
  (`mongodb-memory-server`, see §4)
- Cloudinary credentials **only for production** — in development the API falls back to a local
  disk driver (`Backend/uploads`, served from `/api/uploads`)

## 2. Environment variables

### Frontend — `frontend/.env.local`

| Key | Purpose | Example |
|-----|---------|---------|
| `NEXT_PUBLIC_API_URL` | API base URL (also drives `next.config.ts` image `remotePatterns`) | `http://localhost:5000/api` |

A ready file exists as `frontend/.env.example`.

### Backend — `Backend/.env`

Copy the annotated template:

```bash
cd Backend
cp .env.example .env
```

| Key | Purpose | Notes |
|-----|---------|-------|
| `PORT` | API port | default `5000` |
| `CLIENT_ORIGIN` | Allowed browser origin(s), comma separated — never `*` | `http://localhost:3000` |
| `MONGODB_URI` | Mongo connection string | e.g. `mongodb://127.0.0.1:27017/jazari-tech` |
| `JWT_SECRET` | JWT signing secret | 32+ chars, e.g. `openssl rand -hex 48` |
| `JWT_EXPIRES_IN` / `JWT_COOKIE_NAME` / `COOKIE_SECURE` / `COOKIE_SAMESITE` | Session cookie tuning | defaults: `7d`, `jazari_admin`, `false`, `lax` |
| `TRUST_PROXY` | Proxy hops trusted for client IP extraction | `1` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Logo/image uploads | **required in production** — startup fails without them outside development |
| `PUBLIC_API_URL` | Public base URL of the API (local asset URLs) | `http://localhost:5000` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account created by `npm run seed` | change before deploying |
| `JSON_BODY_LIMIT` | Body size (logos arrive as base64 data URIs) | `15mb` |
| `RATE_LIMIT_*`, `LOGIN_RATE_LIMIT_MAX`, `SUBMISSION_RATE_LIMIT_MAX`, `VISITOR_RATE_LIMIT_MAX` | Rate limits | see `.env.example` |
| `VISITOR_DEDUPE_HOURS` | Visitor dedupe window | `24` = one record per IP per day |
| `LOG_FORMAT` | morgan format | `dev` |

Startup **fails fast with a clear message** if a mandatory variable is missing; secrets are never
printed.

## 3. Install

```bash
cd "D:\Jazari Tech Official\Website\frontend" && npm install
cd "D:\Jazari Tech Official\Website\Backend"  && npm install
```

## 4. Run locally (two terminals)

**Terminal 1 — API**

```bash
cd "D:\Jazari Tech Official\Website\Backend"
npm run dev            # if you have a local MongoDB on the URI in .env
# …or, with NO local MongoDB (bundled in-memory server, auto-seeded):
npm run seed:mem:once  # seed the in-memory DB once (persists for the session)
npm run dev:mem        # start API + in-memory MongoDB on http://localhost:5000
```

**Terminal 2 — website**

```bash
cd "D:\Jazari Tech Official\Website\frontend"
npm run dev            # http://localhost:3000
```

Then open **http://localhost:3000** — public site at `/`, admin portal at `/admin/login`.

> The directory is named `Backend` (capital B); use it exactly as shown in the commands.

### First-time setup

1. `cd Backend && cp .env.example .env`, fill in `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   (and `MONGODB_URI` if you have a real MongoDB).
2. Seed: `npm run seed` (or `npm run seed:mem:once` for the in-memory flow) — creates the admin
   account, 8 product-type templates, 14 services and 4 clearly-labelled sample products.
   It never fabricates visitor traffic or submissions.
3. Sign in at `/admin/login` with the seeded `ADMIN_EMAIL` / `ADMIN_PASSWORD` and replace the
   sample content, upload brand logos, and review submissions on the dashboard.

## 5. Scripts

**Frontend (`frontend/package.json`)**

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with Turbopack (http://localhost:3000) |
| `npm run build` | Production build + TypeScript check |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (strict react-hooks / next rules) |

**Backend (`Backend/package.json`)**

| Script | Purpose |
|--------|---------|
| `npm run dev` | `node --watch server.js` |
| `npm run dev:mem` | API + in-memory MongoDB (no local Mongo needed) |
| `npm start` | Production entry (`node server.js`) |
| `npm run seed` / `npm run seed:mem` / `npm run seed:mem:once` | Seed admin, templates, services, sample products |
| `npm run smoke` | Full end-to-end API test (real HTTP + in-memory Mongo, 53 assertions) |
| `npm run lint` | ESLint 10 flat config |
| `npm run build` | Syntax check across all backend files |

## 6. API at a glance

Envelope: `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`.

| Area | Endpoints |
|------|-----------|
| Health | `GET /api/health` |
| Public | `GET /api/logos`, `GET /api/products`, `GET /api/services`, `POST /api/submission`, `POST /api/visitor-track` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (httpOnly cookie `jazari_admin`) |
| Admin | dashboard stats, products + templates CRUD, logos upload/replace/reorder/visibility, submissions list/status/CSV export, visitors list — all under `/api/admin/*` behind `requireAuth` |

Submission references are server-generated as `JT-YYYYMMDD-XXXXXX`. Visitors are deduplicated to
one document per IP per `VISITOR_DEDUPE_HOURS` (default 24 h) with a `visitCount`.

Full tables: [`PROJECT_NOTES.md`](./PROJECT_NOTES.md) §8–§12.

## 7. Quality checklist

### Security
- [ ] Helmet security headers, compression, request logging, centralized error handler (no stack traces to clients)
- [ ] CORS locked to explicit `CLIENT_ORIGIN` (never `*`), credentials enabled
- [ ] Rate limits on general, login, submission and visitor endpoints
- [ ] Admin login returns a generic 401 and is timing-equalized; bcrypt-hashed passwords never leave the model layer
- [ ] JWT in httpOnly cookie (`SameSite=Lax`, `Secure` in production); every `/api/admin/*` route guarded by `requireAuth`
- [ ] express-validator on every write endpoint with `{code, message, details}` field errors
- [ ] Submission honeypot + duplicate window; CSV export escapes RFC quirks and formula injection
- [ ] Uploads: MIME allow-list, 8 MB cap, path-traversal-guarded local driver; production refuses to boot without Cloudinary
- [ ] `.env` files gitignored; no secrets in logs or responses

### Data
- [ ] 7 Mongoose models with sensible indexes; seed script is idempotent and never fakes traffic
- [ ] Visitor dedupe (1 doc/IP/window, `visitCount` increments); server-generated `JT-YYYYMMDD-XXXXXX` references

### Frontend correctness
- [ ] Exact homepage order: Navbar → Hero → Products Logos → Products Cards → Services → Start Your Project → Brand Statement → Footer
- [ ] Brand palette only (Deep Navy / Technology Blue / Growth Green micro-accent / Official Slate); dark mode derived from `#0a0f24`, never pure black
- [ ] Supplied logo artwork used as-is from `public/brand/` (never recreated or filtered)
- [ ] Type scale emitted by Tailwind v4 (`text-display`/`text-h1…h3`/`text-body-lg` live in `@theme`)
- [ ] No-flash theme switch (inline `<head>` script + `suppressHydrationWarning`), 3-way Light/Dark/System toggle
- [ ] All animation respects `prefers-reduced-motion`; zero new frontend dependencies

### Experience
- [ ] 4-step Start Your Project form with per-step validation, phone-OR-email rule, honeypot, double-submit guard
- [ ] Success modal with stroke-draw check, brand-palette confetti, reference ID + copy button
- [ ] Loading skeletons, empty states, error states with retry across public and admin surfaces
- [ ] Admin: auth-guarded shell, mobile drawer, dashboard KPIs + 14-day series, product templates, CSV export, confirm dialogs

### Accessibility
- [ ] Skip link, landmarks, labelled inputs, `aria-invalid` + inline errors, focus moved on step change
- [ ] Modal focus trap / Escape / scroll lock / focus restore; radiogroup semantics on the theme toggle
- [ ] Icons carry `aria-label` or are hidden; status never conveyed by colour alone

### Performance & SEO
- [ ] Static prerender of public routes, `sendBeacon` tracking, CSS-driven marquee (no JS timers)
- [ ] Metadata: title template, OG/Twitter, robots, sitemap, canonical production URL

### Verification
- [ ] `frontend`: `npm run lint` ✅ `npm run build` ✅ (12 routes)
- [ ] `Backend`: `npm run lint` ✅ `npm run build` ✅ `npm run smoke` ✅ (53/53 assertions)
- [ ] Full-stack smoke: public content, intake + reference ID, visitor dedupe, admin login/stats/CSV/logout, logo upload lifecycle, all routes 200

## 8. Production notes

1. Set `NODE_ENV=production`, a real `JWT_SECRET`, `COOKIE_SECURE=true`, and real `MONGODB_URI`.
2. Paste Cloudinary credentials — the storage driver switches automatically; local fallback is
   disabled outside development.
3. Point `NEXT_PUBLIC_API_URL` at the deployed API and `CLIENT_ORIGIN` at the deployed site.
4. Build: `frontend: npm run build && npm start` · `Backend: npm start` (use a process manager).
