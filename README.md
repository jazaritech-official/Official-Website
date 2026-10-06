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
| `node scripts/verify-three.mjs` | Full headless Chrome 3D/a11y/regression harness (**164 checks**; needs a production build on `:3001` + the backend) |
| `node scripts/capture-themes.mjs <before\|after>` | Hero/hub/footer screenshots at desktop + mobile in light + dark |

**Backend (`Backend/package.json`)**

| Script | Purpose |
|--------|---------|
| `npm run dev` | `node --watch server.js` |
| `npm run dev:mem` | API + in-memory MongoDB (no local Mongo needed) |
| `npm start` | Production entry (`node server.js`) |
| `npm run seed` / `npm run seed:mem` / `npm run seed:mem:once` | Seed admin, templates, services, sample products |
| `npm run seed:prod` | **Guarded** production seed — refuses unless `CONFIRM_PRODUCTION_SEED=true` (see `DEPLOYMENT.md` §15) |
| `npm run smoke` | Full end-to-end API test (real HTTP + in-memory Mongo, **144 assertions**) |
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
- [ ] `frontend`: `npm run lint` ✅ (0 problems) `npm run build` ✅ (14 routes)
- [ ] `Backend`: `npm run lint` ✅ `npm run build` ✅ (46 files) `npm run smoke` ✅ (124/124 assertions)
- [ ] Full-stack smoke: public content, intake + reference ID, visitor dedupe, admin login/stats/CSV/logout, logo upload lifecycle, all routes 200
- [ ] Three.js harness: `node scripts/verify-three.mjs` ✅ 158/158 · `NO_WEBGL=1 …` ✅ 9/9 (incl. brand/layout/first-load + grid + real-logo hub checks + screenshots in `frontend/test-output/screenshots/`)

## 8. Production notes

1. Set `NODE_ENV=production`, a real `JWT_SECRET`, `COOKIE_SECURE=true`, and real `MONGODB_URI`.
2. Paste Cloudinary credentials — the storage driver switches automatically; local fallback is
   disabled outside development.
3. Point `NEXT_PUBLIC_API_URL` at the deployed API and `CLIENT_ORIGIN` at the deployed site.

   **Preferred: same-origin API proxy.** Set `NEXT_PUBLIC_API_URL` to an empty value (or `/api`) and
   set `BACKEND_ORIGIN` on the **frontend** project instead. `frontend/next.config.ts` then rewrites
   `/api/:path*` to `${BACKEND_ORIGIN}/api/:path*`, so the browser only ever talks to the frontend
   origin. That keeps the admin session cookie first-party (`SameSite=Lax` is sent normally) and
   removes cross-site CORS/preflight concerns. `lib/api.ts` supports both modes.
4. Build: `frontend: npm run build && npm start` · `Backend: npm start` (use a process manager).
5. **Backend on Vercel** — `Backend/vercel.json` sets the Express framework preset, so Vercel bundles
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
  node scripts/verify-three.mjs                            # 164 checks
  NO_WEBGL=1 node scripts/verify-three.mjs                 # fallback checks
  ```
  Requires the backend running (the harness seeds two test logos via the admin API).
  **Restart the backend first** — its shared rate limiter (300 req / 15 min) can trip mid-run and
  surface as spurious API failures.
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
