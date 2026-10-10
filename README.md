# Jazari Tech Official — Website

Full-stack marketing site + admin portal for **Jazari Tech Official**.

- **Frontend** — Next.js 16 (App Router, Turbopack), React 19, Tailwind v4. No runtime UI/animation
  dependencies: all motion is CSS keyframes, Web Animations API, IntersectionObserver and `requestAnimationFrame`,
  all icons are hand-written inline SVG. The public site adds `three` (vanilla, procedurally generated
  scene, lazy-loaded chunk — `/admin` never loads it); see the *3D / WebGL layer* section below.
- **Backend** — Node (ESM) + Express 5 + Mongoose 8 with Helmet, strict CORS, rate limiting,
  express-validator, JWT auth (httpOnly cookie), bcryptjs and Cloudinary storage.
- **Docs** — living project documentation lives in [`PROJECT_NOTES.md`](./PROJECT_NOTES.md)
  (architecture, API table, data model, design tokens, dated changelog), and the Vercel
  deployment guide lives in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

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
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | **Super Admin** account created/promoted by `npm run seed` | change before deploying |
| `ADMIN_NAME` | Optional display name for the seeded Super Admin | optional |
| `SEED_RESET_ADMIN_PASSWORD` | Reset the configured account's password on seed | `false` — the password is preserved unless explicitly `true` |
| `DEMO_ADMIN_EMAIL` | Legacy/demo account to deactivate on seed (unless it *is* the configured account) | `admin@jazaritech.com` |
| `JSON_BODY_LIMIT` | Body size (logos arrive as base64 data URIs) | `15mb` |
| `RATE_LIMIT_*`, `LOGIN_RATE_LIMIT_MAX`, `SUBMISSION_RATE_LIMIT_MAX`, `VISITOR_RATE_LIMIT_MAX`, `SENSITIVE_RATE_LIMIT_MAX` | Rate limits (`SENSITIVE_*` covers team + password operations) | see `.env.example` |
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
2. Seed: `npm run seed` (or `npm run seed:mem:once` for the in-memory flow) — creates/promotes the
   **Super Admin** account (`ADMIN_EMAIL`, password preserved unless `SEED_RESET_ADMIN_PASSWORD=true`),
   deactivates the legacy demo account unless it *is* the configured account, and creates 8 product-type
   templates, 14 services and 4 clearly-labelled sample products. It never fabricates visitor traffic
   or submissions.
3. Sign in at `/admin/login` with the seeded `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Super Admins additionally
   get **Team** (`/admin/team`) in the sidebar; every admin gets **Account** (`/admin/account`) to change
   their own password.

## 5. Scripts

**Frontend (`frontend/package.json`)**

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with Turbopack (http://localhost:3000) |
| `npm run build` | Production build + TypeScript check |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (strict react-hooks / next rules) |
| `npm run audit:contrast` | WCAG AA audit of every text/background design-token pair (exits 1 on a failure) |
| `npm run trace:logo` | Regenerate `components/services/logoGeometry.ts` from `public/Main Logo.png` (never hand-edit that file) |
| `npm run build:icons` | Regenerate the icon set (`app/favicon.ico` 16/32/48, `app/icon.png`, `app/apple-icon.png`, `public/brand/icon-{192,512}.png`) from the owner logo — dependency-free |
| `npm run snapshot:content` | Refresh `public/content-snapshot.json`, the build-time fallback for public content (never fails a build; never overwrites good data with empty) |
| `npm run check:secrets` | Scan tracked example/doc files for real-looking secrets (prints `file:line` only, exits 1 on a finding) |
| `node scripts/verify-three.mjs` | Full headless Chrome 3D/a11y/regression harness (**271 checks**; needs a production build on `:3001` + the backend) |
| `node scripts/capture-themes.mjs <before\|after>` | Hero/hub/footer screenshots at desktop + mobile in light + dark |

**Backend (`Backend/package.json`)**

| Script | Purpose |
|--------|---------|
| `npm run dev` | `node --watch server.js` |
| `npm run dev:mem` | API + in-memory MongoDB (no local Mongo needed) |
| `npm start` | Production entry (`node server.js`) |
| `npm run seed` / `npm run seed:mem` / `npm run seed:mem:once` | Seed admin, templates, services, sample products |
| `npm run seed:prod` | **Guarded** production seed — refuses unless `CONFIRM_PRODUCTION_SEED=true` (see `DEPLOYMENT.md` §15) |
| `npm run smoke` | Full end-to-end API test (real HTTP + in-memory Mongo, **160 assertions**) |
| `npm run lint` | ESLint 10 flat config |
| `npm run build` | Syntax check across all backend files |

## 6. API at a glance

Envelope: `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`.

| Area | Endpoints |
|------|-----------|
| Health | `GET /api/health` |
| Public | `GET /api/logos`, `GET /api/products`, `GET /api/services`, `POST /api/submission`, `POST /api/visitor-track` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` (httpOnly cookie `jazari_admin`) |
| Admin | dashboard stats, products + templates CRUD, logos upload/replace/reorder/visibility, submissions list/status/CSV export, visitors list — all under `/api/admin/*` behind `requireAuth` |
| Logo pipeline | `POST /api/admin/logos` (preserve original → process → store), `PUT/DELETE /api/admin/logos/:id`, `POST /api/admin/logos/:id/reprocess`, `POST /api/admin/logos/:id/revert`, `POST /api/admin/logos/bulk-fix` |
| Team (**super_admin only**) | `GET/POST /api/admin/team`, `PATCH /api/admin/team/:id/role`, `PATCH /api/admin/team/:id/status`, `POST /api/admin/team/:id/password`, `DELETE /api/admin/team/:id` |

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
- [ ] Roles `admin`/`super_admin`; `role`+`isActive` re-read from the database on every request; `requireRole("super_admin")` gates `/api/admin/team`; self/last-Super-Admin protection enforced server-side; passwords never returned; sensitive routes rate-limited; audit trail recorded
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
- [ ] Supplied `Main Logo` mark served as a trimmed transparent asset (`public/brand/logo-main.png`) + **live** wordmark; **no dark-mode white plate** anywhere
- [ ] Type scale emitted by Tailwind v4 (`text-display`/`text-h1…h3`/`text-body-lg` live in `@theme`)
- [ ] No-flash theme switch (inline `<head>` script + `suppressHydrationWarning`), 3-way Light/Dark/System toggle
- [ ] All animation respects `prefers-reduced-motion`; zero new frontend dependencies (only `three` + `@types/three`)
- [ ] First-load choreography is CSS-only and JS-gated (`html.js-intro`); without JS or under reduced motion all content is visible — no blocking preloader

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
- [ ] `frontend`: `npm run lint` ✅ (0 problems) `npm run build` ✅ (16 routes) `npm run audit:contrast` ✅ (51/51)
- [ ] `Backend`: `npm run lint` ✅ `npm run build` ✅ (54 files) `npm run smoke` ✅ (178/178 assertions)
- [ ] Full-stack smoke: public content, intake + reference ID, visitor dedupe, admin login/stats/CSV/logout, logo upload lifecycle, session-cookie attributes, push subscribe/unsubscribe + notification compose/send/delete, all routes 200
- [ ] Three.js harness: `node scripts/verify-three.mjs` ✅ 237/237 · `NO_WEBGL=1 …` ✅ 9/9 (incl. brand/layout/first-load, grid, real-logo hub, icons/manifest, services states, admin IA, admin session, hero shatter, SEO, hub wiring, service cards, navbar occlusion, notification opt-in + screenshots in `frontend/test-output/screenshots/`)

## 8. Production notes

1. Set `NODE_ENV=production`, a real `JWT_SECRET`, `COOKIE_SECURE=true`, and real `MONGODB_URI`.
2. Paste Cloudinary credentials — the storage driver switches automatically; local fallback is
   disabled outside development.
3. Set the **VAPID key pair** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) plus `VAPID_SUBJECT` so the
   API can send browser notifications (`npx web-push generate-vapid-keys` in `Backend/`). Without
   them everything still runs — the public site simply does not offer the opt-in and admin sends
   return `503 SERVICE_UNAVAILABLE` — but the keys are required for notifications to reach anyone.
4. Point `NEXT_PUBLIC_API_URL` at the deployed API and `CLIENT_ORIGIN` at the deployed site.

   **Preferred: same-origin API proxy.** Set `NEXT_PUBLIC_API_URL` to an empty value (or `/api`) and
   set `BACKEND_ORIGIN` on the **frontend** project instead. `frontend/next.config.ts` then rewrites
   `/api/:path*` to `${BACKEND_ORIGIN}/api/:path*`, so the browser only ever talks to the frontend
   origin. That keeps the admin session cookie first-party (`SameSite=Lax` is sent normally) and
   removes cross-site CORS/preflight concerns. `lib/api.ts` supports both modes.
5. Build: `frontend: npm run build && npm start` · `Backend: npm start` (use a process manager).
6. **Backend on Vercel** — `Backend/vercel.json` sets the Express framework preset, so Vercel bundles
   the existing `Backend/server.js` app as one function and routes every request to it (all `/api/*`
   routes and `/api/health` included). `server.js` exposes `export default app` for detection; local
   `start()` (DB connect + port listen) is unchanged and runs only off-Vercel. The MongoDB connection
   is lazy + cached (`Backend/middleware/ensureDb.js`) so serverless invocations reuse it and a
   transient DB outage returns `503` instead of exiting.

   **Full deployment guide (root cause of the current Vercel “Blocked” state, Options A–D, env-var
   names, cookie/upload/Mongo notes): [`DEPLOYMENT.md`](./DEPLOYMENT.md).**

## 9. 3D / WebGL layer (public site only)

The homepage hero renders a **procedural Three.js scene** behind the existing static
fallback. It is a progressive enhancement:

- **Code lives in** `frontend/components/three/` (`engine.ts` = renderer/loop, `SceneCanvas.tsx` =
  lifecycle, `HeroScene.tsx` = lazy load + theme bridge, `quality.ts` = tiers, `theme.ts` =
  token→palette mapping, `helpers/` = webgl probe / math / disposal / projection).
- **Lazy by design**: `HeroScene` pulls `SceneCanvas` through `next/dynamic` with `ssr: false`, so
  `three` sits in its own async chunk that only `/` ever references — `/admin` never loads it
  (verified against the build manifests: 0 admin HTML references to the three chunk).
- **No WebGL / chunk failure / context loss** → the static fallback stays up (crossfade via
  `data-scene` on the hero container). No errors, no layout shift, no blank canvas.
- **Quality tiers** (`quality.ts`): HIGH/MEDIUM/LOW chosen from cores/RAM/pointer type, then
  demoted at runtime by a bounded FPS monitor (6 s of sustained sub-42 FPS, 10 s cooldown,
  downgrade-only). `STATIC` = no WebGL at all.
- **Tuning**: colors (`theme.ts` `BRAND`/`PALETTES`), object counts (`quality.ts`), pixel ratio
  (same file), scene composition (`engine.ts` + builders), animation speeds (animation constants).
  Live tier is visible as `data-quality` on the canvas element.
- **Real-logo geometry**: the hero mark is rebuilt from the **traced brand artwork**, not a hand-drawn
  proxy. `components/three/createLogoPieces.ts` parses one `<path>` per `LOGO_PIECES` entry with
  `SVGLoader`, extrudes it, and bakes the artwork's own gradients into a per-vertex colour attribute, so
  the WebGL mark matches the 2D logo instead of approximating it (harness `CHECK 2b` measures the
  rendered silhouette against the source PNG).
- **Verify** (headless Chrome harness, no extra dependencies):
  ```bash
  cd frontend && npm run build && npx next start -p 3001   # terminal A
  node scripts/verify-three.mjs                            # 271 checks
  NO_WEBGL=1 node scripts/verify-three.mjs                 # fallback checks
  ```
  Requires the backend running (the harness seeds two test logos via the admin API).
  **Restart the backend first** — its shared rate limiter can trip mid-run and surface as spurious API
  failures. One full pass now costs more than the default 300 requests / 15 min, so raise the ceiling for
  the run (`RATE_LIMIT_MAX=1200 LOGIN_RATE_LIMIT_MAX=60 SENSITIVE_RATE_LIMIT_MAX=120`); no harness check
  asserts rate limiting, so this only removes false 429s. The admin session checks read credentials from
  the environment at runtime (never printed); without them they report SKIPPED, not passed.
- **Troubleshooting WebGL fallback**: if the hero shows rings/tiles instead of the 3D mark, the
  scene is on its static fallback — check `data-scene` on the hero container (`fallback` = WebGL
  unavailable/context lost/chunk failed, all silent by design), check `data-quality` on the canvas,
  and confirm the browser supports WebGL2. No errors are thrown; content is never blocked.

## 10. Super Admin, Main Logo & motion (latest work)

- **Super Admin system** — `Admin.role` (`admin` | `super_admin`) + `Admin.isActive`; the seed promotes
  the configured account and deactivates the legacy demo account; `requireAuth` re-reads role/`isActive`
  from the database on every request and `requireRole("super_admin")` gates `/api/admin/team`; self and
  last-Super-Admin protections are enforced server-side; a lightweight `AuditLog` records security
  actions. `/admin/team` is visible only to Super Admins (with a frontend route guard), and every admin
  can change their own password at `/admin/account`.
- **Main Logo** — the owner's `public/Main Logo.png` (genuine transparency) is processed by
  `node scripts/build-logo-assets.mjs` into `public/brand/logo-main.png` + `public/brand/app-icon-main.png`.
  One `Logo` component renders the mark with **live** wordmark text and no white plate; used in the
  navbar, mobile drawer, footer, admin login, admin sidebar and favicon.
- **3D hero** — the ribbon diamond is now four **straight extruded ribbon bands** (not annular arcs) with
  a lighter top fold, a darker right fold and a small green leaf, composed as a premium product shot.
- **Motion** — centralized motion tokens plus a CSS-only, JS-gated first-load choreography (~1.5 s) and
  site-wide polish (nav underline, button sweep, section heading lines, pointer glow, admin entrance).
  Reduced motion bypasses the choreography entirely.

Full architecture + tuning guides: [`PROJECT_NOTES.md`](./PROJECT_NOTES.md) §27.

## 11. Logo showcase & image pipeline (Task C)

- **Pipeline** — uploads preserve the untouched original, then run `sharp`: auto-orient → bound to
  1280×720 (no upscaling) → border-ring analysis → **border-connected flood fill** (never a global
  colour replace, so enclosed artwork survives) → feathered true alpha → trim → PNG + metadata
  (`width`, `height`, `aspectRatio`, `hasAlpha`, `dominantColors`, `averageLuminance`, `tone`).
  `backgroundStatus` is `removed` / `kept` / `needs-transparent-png`; integrity beats forced
  transparency, so complex or framed backgrounds are preserved and flagged.
- **Admin** — `/admin/logos` adds a **server-side** checkerboard before/after preview
  (`POST /api/admin/logos/preview` runs the pipeline live and returns a data-URI preview, storing
  nothing), remove-background/trim toggles, a tolerance slider, text status badges, **Reprocess**,
  **Revert to original** and **Fix all existing logos** (idempotent, per-item isolation, summary).
  Display name and safe http/https website URL are supported. Existing
  upload/replace/reorder/visibility/delete are preserved.
- **Public showcase** — `LogoMarquee` is a logo-only wall: **no pill, card or plate** behind any logo.
  Optical normalization, counter-scrolling seamless rows, tone-aware contrast aids, hover/focus pause +
  floating label, damped scroll-velocity, off-screen/hidden-tab pause, and a **static wrapped grid**
  under reduced motion.
- **Verification** — backend smoke **124/124**; frontend harness **158/158** (+ NO_WEBGL 9/9).

Full architecture + tuning guide: [`PROJECT_NOTES.md`](./PROJECT_NOTES.md) §28.

## 12. Blueprint grid + Exploded Logo Services Hub (Task E)

- **Blueprint grid** — a single, static, pointer-transparent `.bg-grid` layer (fine 24px + strong
  120px gradients, faded by a CSS mask) sits behind the public site only. Tokens (`--grid-*`) and
  section annotations (`.section-index`, `.hairline`, `.grid-crosshair`, `.card-ticks`, traces) live in
  `globals.css`; `/admin` never renders any of it. Documented z-index tokens keep it below content.
- **OUR SERVICES HUB (real logo)** — `components/services/ServicesHub.tsx`, placed between the product
  cards and the services grid. The mark is **traced from the owner's `public/Main Logo.png`**
  (4096×4096) by `npm run trace:logo` → `scripts/trace-logo.mjs`, which generates
  `components/services/logoGeometry.ts`: five real pieces (`top | right | bottom | fold | leaf`),
  source-pixel `viewBox "0 0 4096 4096"`, 16-stop fitted gradients — **silhouette IoU 0.9984 vs the
  source alpha mask** (requirement ≥ 0.95). Card/wire geometry is deterministic in
  `components/services/hubLayout.ts` (1000×700 design space, equal 300×180 cards on a 24 px grid at
  the 1200 px reference width, orthogonal SVG connectors, **two-way** card ⇄ piece highlighting).
  It explodes on hover / keyboard focus / tap with ≤ 8% travel, ≤ 3° rotation and a 48 ms stagger,
  revealing up to five services from `GET /api/services` (`hubSlot` 0–4 → top/right/bottom/fold/leaf);
  labels are real anchors to the matching `#service-{slug}` card with **no text truncation**. Below
  1024 px it becomes a vertical spine (no horizontal scroll at any width from 1920 → 390); the list is
  always in the DOM (no-JS + screen-reader safe) and the whole interaction is disabled under
  `prefers-reduced-motion`.
- **Navbar overlap fix** — opaque-enough glass (`rgba(255,255,255,0.88)` light / `rgba(10,15,36,0.9)`
  dark, `blur(16px)`, border + shadow), `header z-index 200` above content, and `scroll-padding-top:
  6rem` so the navbar's `#hub` link lands the heading below the header. Contrast worst-case 4.61:1
  (light) / 6.78:1 (dark).
- **`Backend/vercel.json`** — only `{ "$schema"…, "framework": "express", "fluid": true }`; this does
  **not** bypass the Hobby “Blocked” state (account-level) — see [`DEPLOYMENT.md`](./DEPLOYMENT.md) §1.
- **Deployment** — see [`DEPLOYMENT.md`](./DEPLOYMENT.md). The backend connects to MongoDB lazily and
  the admin upload preprocesses images client-side to stay under Vercel's request-body limit.

Architecture + tuning: [`PROJECT_NOTES.md`](./PROJECT_NOTES.md) §29–§32.

Development commands are unchanged (see §4): `npm run dev` in `Backend/` and `frontend/`.
## 13. Real-logo 3D hero, production auth & WCAG pass (Task G)

- **Real-logo 3D hero** — the WebGL mark is no longer a hand-drawn proxy. `components/three/createLogoPieces.ts`
  parses the five traced `<path>`s with `SVGLoader`, extrudes them, and **bakes the artwork's own
  gradients into a per-vertex colour attribute**, so the 3D mark and the 2D logo share one silhouette
  and one palette. `createLogoMaterial()` (vertex colours + clearcoat) replaced the procedural ribbon
  material. The harness measures the rendered silhouette against `public/Main Logo.png` and requires a
  2 px-tolerant IoU ≥ 0.80 (measured 0.814) plus a light-mode saturation ratio ≥ 0.6 (measured 0.757).
- **Hero atmosphere** — CSS-only `.hero-aurora` blobs and a masked `.hero-rays` streak behind the
  composition. Transform/opacity only, no filters, fully disabled under `prefers-reduced-motion`, and
  down-tuned on small screens.
- **Light-mode polish** — every button shares one box height (transparent 1px border on `.btn`), the
  outline CTA gets a visible edge on white (`--btn-outline-*` tokens), a designed `.section-seam` marks
  the hero → products boundary, and the footer carries a faint surface wash.
- **WCAG AA contrast audit** — `npm run audit:contrast` parses the `:root` / `.dark` token blocks and
  verifies every text-on-background pair the UI renders (including tinted chips). It drove real fixes
  (light `--accent`/`--success`/`--warning`/`--danger`/`--muted-soft`, the logo tagline, and white-on-accent
  in dark mode via a new `--accent-contrast` token). **49/49 pairs pass at ≥ 4.5:1.**
- **Production admin auth** — the deployed login failed because production Atlas had **no admin
  account** (never seeded), not because the auth code was broken. Two things shipped: a **guarded,
  idempotent production seed** (`npm run seed:prod`, refuses without `CONFIRM_PRODUCTION_SEED=true`,
  never overwrites the password unless asked), and a **same-origin `/api` proxy** (`BACKEND_ORIGIN`) so
  the admin cookie is first-party and survives the deploy topology. Login errors are now status-aware:
  a 503/network failure reports a *service* problem instead of "wrong password".
- **Verification** — frontend harness **164/164**, contrast **49/49**, backend smoke **144/144**.
  Before/after screenshots (`test-output/screenshots/{before,after}-*`) were captured against a real
  HEAD build and the current build.

Full detail: [`PROJECT_NOTES.md`](./PROJECT_NOTES.md) §33 · deploy steps: [`DEPLOYMENT.md`](./DEPLOYMENT.md) §15.
## 14. Services states, real favicon, content resilience & admin clarity (Task H)

- **Why services were missing** — the deployed API answers `GET /api/services` with `HTTP 200` and
  `data: []` (**EMPTY**, an unseeded database), not an error. Seeding remains an owner action
  (`DEPLOYMENT.md` §15.2). The services UI now renders clearly different, designed states and marks them
  `data-services-state="loading|empty|error|loaded"`:
  - **EMPTY** → “No services published yet” + “Start your project” (no misleading “being updated”).
  - **ERROR** → “We couldn't load our services” + an explicit connection-problem message + **Retry**.
- **Real favicon** — `app/favicon.ico` was the stock Next.js triangle and it wins the `<link rel="icon">`
  race, so the brand PNG never showed. The icon set is now generated from the owner logo by the
  dependency-free `npm run build:icons` (`app/favicon.ico` 16/32/48 PNG-embedded, `app/icon.png` 32,
  `app/apple-icon.png` 180, `public/brand/icon-{192,512}.png`) plus a web manifest — **one** system
  (the `metadata.icons` block was removed).
- **Content resilience** — `lib/publicContent.ts` is the single loader for `logos`/`products`/`services`,
  resolving **live API → validated localStorage cache → validated build-time snapshot → designed
  error**. Everything is schema-validated before it renders; only public resources are ever cached.
  Public GETs use an 8 s timeout with bounded retry. `npm run snapshot:content` writes
  `public/content-snapshot.json` and can never fail a build or blank the fallback. A failed product
  image falls back to a designed monogram.
- **Admin information architecture** — routes are unchanged; only labels, grouping, titles and
  descriptions changed. The sidebar is grouped `CONTENT` / `LEADS` / `SETTINGS` (Overview stays on top)
  and reads *Homepage Logos, Products, Product Presets, Project Requests, Visitors, Admins & Access,
  My Account*. Every page renders the shared `AdminPageHeader` (title + one-line purpose + “Where this
  appears”), browser titles read `<page> - Jazari Admin`, and Overview carries a dismissible
  “What each section does” guide. Permissions are untouched (Team = super-admin only, server-enforced).
- **Secret hygiene** — a real MongoDB URI was found (and removed) in the tracked `Backend/.env.example`
  working copy; `HEAD` never contained it. `npm run check:secrets` guards tracked example/doc files and
  prints `file:line` only. **The owner must rotate the exposed Atlas password.**
- **Verification** — harness **185 checks** (was 164; CHECKs 56–76 are new: icons/manifest, services
  states, cache/snapshot/error/empty resilience via CDP offline + interception, and admin IA), contrast
  **49/49**, backend smoke **144/144**.

### Task I — admin session, hero shatter, SEO, hub wiring, service cards, navbar occlusion
- **Admin session fixed at the root.** The browser was calling the API **cross-site**, so the host-only
  `SameSite=Lax` admin cookie was never sent back (login `200`, then every request `401`). The same-origin
  proxy is now the default path (`BACKEND_ORIGIN` pins `BASE` to `/api` even if a stale absolute
  `NEXT_PUBLIC_API_URL` is inlined), `Backend/utils/authCookie.js` builds one options object for
  set/refresh/clear (name, `Path=/`, `SameSite`, `Secure`, `HttpOnly`, seconds), the invalid
  `SameSite=None` without `Secure` combination is refused, a misconfigured production build prints a
  warning, and the login page verifies `/api/auth/me` before redirecting. **No seed was re-run.**
- **Hero shatter** — the real-logo mark is untouched; hovering, a ~3 s idle dwell, or a touch tap drive an
  additive `assembled → shattering → floating → reassembling → assembled` state on one `uProgress`
  uniform, rendered as one `InstancedMesh` of ≤ 8-triangle neon shards (HIGH 1000 / MED 500 / LOW 200 /
  reduced-motion 0) with per-instance baked attributes and GPU-only motion. Growth Green stays on the
  leaf shards. No new dependency and no bloom pass.
- **SEO** — the Google site-verification meta renders exactly once in the SSR head, plus canonical,
  OG/Twitter and an `Organization` JSON-LD built from real values only (no invented `sameAs`); `/admin`
  stays `noindex`.
- **Hub wiring** — the Task F geometry is unchanged; connectors gained a flowing per-connector gradient,
  10 travelling packets (cap 15), ripple pulses and hover/focus response, all token-driven and
  reduced-motion-safe.
- **Service cards** — a water-fill redesign (liquid rises with a transform, two wave paths, 2 px Growth
  Green crest, full description always in the DOM) backed by new optional `Service.shortDescription`
  (≤ 90 chars) and `highlights` (≤ 3 × ≤ 24 chars) fields seeded for all 14 services.
- **Navbar occlusion** — an inner `.jt-nav__scrim` layer lifts effective opacity to ≈ 95 %/96.6 % so page
  text can no longer read through the glass when `backdrop-filter` is dropped, plus `scroll-margin-top`
  on anchored sections.
- **Verification** — harness **226/226** (+ `NO_WEBGL` 9/9), contrast **51/51**, backend smoke **160/160**,
  both linters clean, backend syntax check **49 files**, frontend build **15 routes**. Initial home JS
  grew +1.0 KB gzip, the lazy three chunk +3.3 KB gzip; no new dependencies.

Architecture + tuning: [`PROJECT_NOTES.md`](./PROJECT_NOTES.md) §34–§35 · deploy steps:
[`DEPLOYMENT.md`](./DEPLOYMENT.md) §15.3–§15.6.

### Task J — Web Push notifications (visitor opt-in + admin composer)

Real browser notifications, end to end, with no third-party SaaS:

- **Visitor side.** `frontend/public/sw.js` is a minimal service worker that only shows pushed
  notifications and opens the tapped link (it never caches or intercepts fetches).
  `components/notifications/NotificationPrompt.tsx` offers a premium, brand-coloured opt-in card
  **10 s after arrival**, once per visitor, and only when the browser supports push, permission is
  still undecided, the tab is visible and the server actually has VAPID keys. “Not now” is remembered
  in `localStorage`; the card is a real labelled dialog (focus trap, Escape, scroll lock).
  `lib/push.ts` owns all `navigator`/`Notification` access, so components stay SSR-safe and the VAPID
  key is fetched from the API (`GET /api/push/public-key`) rather than baked into the bundle.
- **Admin side.** `/admin/notifications` (sidebar group **Engagement**) shows the audience and delivery
  counters, a “this device” toggle, a composer that can **reference any of the 14 seeded services**
  (selecting one prefills an editable title/message/link), “Send now” / “Save draft”, and the delivery
  history with per-notification targeted/delivered/failed counts, resend and delete.
- **Backend.** `services/pushService.js` wraps `web-push` (the only new dependency) and is the single
  place VAPID is configured; `models/PushSubscription.js` stores one row per device endpoint
  (idempotent upsert, failure counter, auto-deactivate at `PUSH_MAX_FAILURES`); `models/Notification.js`
  stores the message plus its delivery stats. Delivery runs with bounded concurrency (20), deletes
  endpoints the push service reports gone (404/410) and records everything on the notification.
  Missing keys are **non-fatal**: subscriptions are still stored and sends return a clean `503`.
- **Verification.** Harness **237/237** (incl. `CHECK 113–120b`: the API key is exposed, the card does
  not appear immediately, it appears ~10 s in as a labelled dialog, “Not now” is remembered and never
  re-asked, the admin page renders, a service reference prefills, a draft saves and can be deleted) and
  backend smoke **178/178** (public key, https-only subscribe, idempotent re-subscribe, stats, compose
  validation, send outcomes, unsubscribe, delete). Live end-to-end was also driven in a real browser:
  a device subscribed (`https://fcm.googleapis.com/...`) and the admin send produced an actual
  notification on that device.

Setup: add `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` to the backend
(`npx web-push generate-vapid-keys`) — see [`DEPLOYMENT.md`](./DEPLOYMENT.md) §15.7 and
[`PROJECT_NOTES.md`](./PROJECT_NOTES.md) §36.
### Task K — production admin login, real exploded-view hero, Discipline Atlas, VAPID contact

- **Production admin login fixed at the root, again — this time on the *frontend* origin.** The browser
  called the backend on a different origin, so the `Set-Cookie` from a `200` login was discarded as a
  third-party cookie and every later request was `401`. The auth API is now served **same-origin** by BFF
  route handlers (`frontend/lib/authBff.ts` + `app/api/auth/{login,logout,password,me}/route.ts`), which
  re-emit the session cookie **host-only** (`Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` in prod). A new
  `/api/diag-session` (only when `DIAGNOSTICS=true`, booleans/enums only) and a login-page hint make the
  next occurrence self-diagnosing. Backend `AUTH_DEBUG_HEADERS` (default off) adds opt-in
  `X-Auth-Reason` markers; logout now also writes a past `Expires`.
- **Hero explosion rebuilt as a real exploded view.** The instanced neon shards are replaced by a true
  Voronoi fracture of the five **traced** logo contours (`components/three/fracture.ts`): 100 / 50 / 20
  pieces (HIGH/MED/LOW) that separate, drift, spin and land back exactly on the mark, in one merged
  geometry (one draw call). The stages read `assembled → separating → fracturing → floating →
  reassembling`; the old `data-explode` vocabulary (`shattering` / `floating` / `reassembling`) is
  preserved for backward compatibility. Measured: tiling **IoU 0.999**, median projected fragment
  **9.6 %** of the logo width, home initial JS unchanged (+0 B).
- **Service cards → Discipline Atlas.** All 14 services are a keyboard-operable `tablist` rail beside a
  live stage (title, full description, chips, CTA, 14-node constellation), with an optional reduced-motion
  -safe tour and a sticky scroll-snapped chip carousel below 1024 px. Every `#service-{slug}` deep link
  and the services hub still resolve.
- **VAPID contact corrected** to `mailto:jazaritechofficial@gmail.com`; rotating the keys invalidates
  existing subscriptions but needs no frontend redeploy.
- **Verification.** Frontend lint/tsc clean, build **17 routes**, harness **271/271** (new suite **[25]**
  `CHECK 143–151`: tier budgets + stage vocabulary, IoU ≥ 0.95, median projected fragment ≥ 2.5 %, neon
  edges, reassembly round-trip, reduced motion, `explode-*.png` screenshots, bundle budget, cycle/heap
  bound), `NO_WEBGL=1` **9/9**, `verify:bff` **21/21**, contrast **51/51**, backend smoke **200/200**,
  syntax check **54 files**. The three chunk grew **+13.1 KB raw / +4.4 KB gzip**; no new dependency.

Architecture + tuning: [`PROJECT_NOTES.md`](./PROJECT_NOTES.md) §37 · deploy steps:
[`DEPLOYMENT.md`](./DEPLOYMENT.md) §15.
### Product logos, Product Presets and the Specimen Plate

- **Product → logo reference.** A product can reference one of the **Homepage Logos** (`Product.logoId`, an
  ObjectId ref — *referenced*, never copied). The public API returns
  `logo: { id, url, displayName, alt, tone, hasAlpha, aspectRatio } | null`; `null` renders the designed
  monogram. Deleting a logo that products use returns **409** with the product names;
  `DELETE /api/admin/logos/:id?detach=true` unlinks them (monogram fallback) and then deletes.
- **Product Presets is its own page** at `/admin/product-presets` — its own header, browser title, active
  sidebar state, deep link and back/forward. The old `/admin/products#product-presets` anchor redirects there.
- **Specimen Plate product cards.** Products render as mounted specimens on a blueprint plate: a tone-aware
  gridded *specimen window* with corner ticks, a mono plate id (`PRD-00N`), spec ticks that draw in on reveal,
  exactly one Growth-Green status node and a brand-spectrum trace to the Visit action. The first plate is wide
  ("featured") at three or more products; mobile stays one equal-quality column.
- **Brand spectrum tokens** `--spectrum-1..5` (navy → blue → sky → teal-blue → green), light and dark, live in
  `app/globals.css` — graphics only (lines, ticks, traces), never text.
### Hero SVG v2, the Services Index and the rebuilt project form (Task L)

- **The hero is inline SVG, not WebGL.** `three` and `@types/three` are gone from `package.json` and
  `components/three/*` is deleted; the mark is the same traced geometry the Services Hub uses
  (`components/brand/LogoMarkSvg.tsx`, generated from the owner's artwork by `npm run trace:logo`).
  `components/sections/HeroMark.tsx` renders it assembled at rest, explodes the five real pieces on
  hover / keyboard focus / tap and grows up to ten service tooltips (title, backend `shortDescription`
  fallback, up to two highlights) with leader lines — all from `GET /api/services`. Below 1024 px those
  tooltips become a two-column list under the mark. DevTools hooks: `data-hero="svg-v2"`,
  `data-hero-state`, `data-tooltips`.
- **One static Services Index.** `components/services/ServicesIndex.tsx` replaces the Discipline Atlas:
  all 14 disciplines on one page, grouped by the backend `category`, grouped headings, no hover
  affordances and no per-row links. Entries carry `id="service-{slug}"`, so Hub EXPLORE links and hero
  tooltips jump straight to a discipline (with a calm `:target` highlight under the navbar).
- **Rebuilt Start-Your-Project form.** Three labelled steps (about you → how to reach you → what you
  need) plus a Review step with per-section "Edit" links. Phone **or** email is enough and the rule is
  stated up front; the service chips come from the backend; error summary, field-level messages,
  distinct copy for 400/429/5xx/offline, double-submit guard, `sessionStorage`-only draft cleared on
  success, and a success modal with the reference ID, a 3-step "what happens next" and "Send another".
- **Backend:** `POST /api/submission` accepts optional `message` (≤ 1000) and `timeline`
  (`asap | 1-3-months | 3-6-months | exploring`). Both are validated, stored, shown in the admin
  detail/list and included in the CSV export (the formula-injection guard still applies); older
  submissions keep working.
- **Verification:** `node scripts/verify-three.mjs` (a production build on `:3001` + the in-memory
  backend) covers all of it; `NO_WEBGL=1` asserts the hero is identical with WebGL disabled, and
  `npm run verify:bff` checks the `/api/auth/*` BFF cookie handling. See `PROJECT_NOTES.md` §39–§45.
