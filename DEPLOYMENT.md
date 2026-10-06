# DEPLOYMENT.md — Jazari Tech Official (Vercel)

Operational guide for deploying the two applications in this repository to Vercel.

- `frontend/` — Next.js 16 public site + `/admin` portal
- `Backend/` — Express 5 + Mongoose API (deployed as a Vercel serverless function)

> **Secrets:** this document lists environment-variable **names** only, never values.
> Never paste real credentials into documentation, screenshots, or chat.

---

## 1. Current status — why production deployments show "Blocked"

Production deployments on both Vercel projects are currently reported as **Blocked**, with
a message along the lines of:

> *The deployment was blocked because the commit author does not have contributing access
> to the project, and the Hobby plan does not support collaboration on private repositories.*

This is an **account / permission / plan issue**, **not** a build failure. The application
code builds cleanly (see §9 — verification). Two facts combine to cause it:

1. The repository is **private** (`jazaritech-official/Official-Webiste`).
2. The **Git author identity** attached to recent commits (`Sibghat776` /
   `Sibghat Ullah <ullahsibghat786@gmail.com>`) is **not** the Vercel account identity that
   owns the projects (`jazaritechofficial`).

On the **Hobby plan**, Vercel only allows Git-connected deployments to be triggered by
commit authors it recognises as having access to the Vercel project. Because the author is
a different identity from the Vercel account, Vercel blocks the production deployment.

### What this means

- The block **cannot be fixed by a code change**, and no local edit can bypass it.
- **`Backend/vercel.json` does not bypass it either.** That file was updated (Task F) to
  `{ "$schema": "https://openapi.vercel.sh/vercel.json", "framework": "express", "fluid": true }`
  — the schema + Express preset document *how* to build the function, and `fluid` opts into
  Fluid Compute. Neither key has any effect on **who** authored the commit or on the plan's
  private-repo collaboration rules, which is what the block checks. Resolving the block still
  requires Option A, B, C or D below.
- It is fixed only by reconciling the **Git identity** with the **Vercel account**, by
  connecting GitHub under the right account, by deploying from your own machine with the
  Vercel CLI, by making the repository public, or by upgrading the plan.
- Freebuff cannot change the Vercel dashboard, GitHub permissions, billing, or the plan.

---

## 2. Option A — Connect the correct GitHub identity (recommended for Git-connected deploys)

Make the GitHub account that **authors commits** the same account that is **connected to
Vercel** (or a member with contributing access).

1. Determine which GitHub account is connected to Vercel:
   Vercel → **Account Settings → Integrations / Login Connections → GitHub**.
2. Open the Vercel project → **Settings → Git** and check the connected repository and
   account.
3. If the wrong GitHub account is connected, disconnect and reconnect the GitHub
   integration using the account that authors the commits (or the account that owns the
   repository).
4. Alternatively, sign in to Vercel **with** the GitHub identity that authors the commits.
5. If you prefer to keep using the current Vercel account, either
   - add the author to the Vercel team/project (requires a plan that supports collaboration,
     see §5), or
   - set the **repository-local** Git identity to the Vercel-connected account so future
     commits are authored by the recognised identity.

Repository-local identity (does **not** touch your global Git config — run only if you
choose this route; Freebuff will not run it for you):

```bash
git config --local user.name "Your Vercel-connected name"
git config --local user.email "your-vercel-connected@email.com"
```

Then create a **new** commit (do not amend or force-push existing history) — the next
push will carry the recognised author and trigger a deploy.

> Recorded author identity found in this repository's history (for reference only):
> `Sibghat Ullah <ullahsibghat786@gmail.com>` at HEAD. Existing commit history was **not**
> rewritten.

---

## 3. Option B — Deploy from your machine with the Vercel CLI

Use this to deploy **without** the Git integration (bypasses the collaborator restriction
entirely). Install once: `npm i -g vercel`.

### Backend (`Backend/`)

Windows CMD:

```bat
cd /d "D:\Jazari Tech Official\Website\Backend"
vercel login
vercel link
vercel --prod
```

PowerShell:

```powershell
Set-Location "D:\Jazari Tech Official\Website\Backend"
vercel login
vercel link
vercel --prod
```

### Frontend (`frontend/`)

Windows CMD:

```bat
cd /d "D:\Jazari Tech Official\Website\frontend"
vercel login
vercel link
vercel --prod
```

PowerShell:

```powershell
Set-Location "D:\Jazari Tech Official\Website\frontend"
vercel login
vercel link
vercel --prod
```

Deploy the **backend first**, note its production URL, then set the frontend's
`NEXT_PUBLIC_API_URL` to `<backend-url>/api` and deploy the frontend.

---

## 4. Option C — Make the repository public

Making the repository public can remove the Hobby-plan private-repo collaboration
limitation, **depending on Vercel's current policy**.

**Only do this if the owner explicitly accepts that the source code becomes public.**

Before making the repository public:

- Confirm no `.env` file is committed (this repo's `Backend/.env` is gitignored;
  `Backend/.env.example` is a placeholder-only template).
- Confirm no secret exists in the **Git history** (a value committed even once stays in
  history). Inspect the history for accidental secrets.
- **Rotate** any credential that has ever been committed (a JWT secret, database password,
  Cloudinary key, or admin password). Credentials already committed must be considered
  compromised.
- Re-check the default branch for build artefacts, uploads, or private keys.

Freebuff did **not** and will **not** make the repository public.

---

## 5. Option D — Vercel Pro

Upgrading to a paid plan lets you add the author as a team member with contributing access,
without changing identities. Select **Do not purchase** unless you intend to. Freebuff did
not change billing, the plan, or team membership, and makes no claim that this was done.

---

## 6. Backend deployment settings (Vercel project for `Backend/`)

| Setting | Value |
|---------|-------|
| Root Directory | `Backend` |
| Framework Preset | **Express** (auto-detected from `Backend/vercel.json`) |
| Install Command | default |
| Build Command | default (no build step — the backend is plain ESM) |
| Output Directory | *(none)* |
| Node.js Version | 20.x or 22.x |

`Backend/vercel.json` declares `{ "$schema": …, "framework": "express", "fluid": true }`.
`framework: "express"` documents the preset (it is also auto-detected from `server.js`);
`fluid: true` opts the project into **Fluid Compute** (the documented vercel.json switch — it does
**not** affect the Hobby "Blocked" state, see §1; `memory` is *not* settable via vercel.json and the
Hobby `maxDuration` default already equals the platform maximum of 300 s, so neither was guessed).
`Backend/server.js` exports the
configured Express app (`export default app;`), so Vercel detects it as the single handler.
`start()` (which connects the DB and calls `app.listen`) runs **only when not on Vercel**
(`if (!process.env.VERCEL)`), so the function does not connect eagerly or exit on a transient
DB failure at cold start.

**Serverless-safe MongoDB:** the connection is opened **lazily** on the first request that
needs it and cached (in-flight promise on `globalThis`), so it is reused across invocations
and concurrent requests never open duplicate connections. A transient database failure
returns `503 DATABASE_UNAVAILABLE` (via `middleware/ensureDb.js`) instead of calling
`process.exit`. Local development is unchanged.

**Health route:** `GET /api/health` is mounted **before** `ensureDb`, so it always answers
(and reports `database` state) even when the database is unreachable — ideal for uptime
checks.

**Trust proxy:** `app.set("trust proxy", TRUST_PROXY)`. Default `1` honours one proxy hop
(Vercel's edge) for correct client IPs; do not set it higher than the number of trusted
proxies in front of the API.

**CORS:** the accepted origins come from `CLIENT_ORIGIN` (comma separated, never `*`), with
`credentials: true`. Set it to the deployed frontend origin exactly (e.g.
`https://jazaritech.vercel.app`). Local development origins can stay in the same list.

**Production storage:** production **refuses** the local filesystem driver — the app fails to
boot without Cloudinary credentials, so uploads never silently land on ephemeral serverless
disk. `Backend/uploads` is a development-only driver.

**Sharp:** `sharp` ships prebuilt serverless binaries and is compatible with Vercel's Node
20/22 runtimes. No configuration is required; the logo pipeline is unchanged.

---

## 7. Frontend deployment settings (Vercel project for `frontend/`)

| Setting | Value |
|---------|-------|
| Root Directory | `frontend` |
| Framework Preset | **Next.js** (auto-detected) |
| Install Command | default |
| Build Command | `next build` (default) |
| Output Directory | default |
| Node.js Version | 20.x or 22.x |

`NEXT_PUBLIC_API_URL` must point at the deployed backend, **including the `/api` suffix**
(e.g. `https://jazaritech-backend.vercel.app/api`). It drives both the typed API client and
`next.config.ts` image `remotePatterns`.

**Images:** `remotePatterns` allow only the configured API host and `res.cloudinary.com`.
`images.dangerouslyAllowLocalIP: true` exists solely so the **development** local storage
driver (`localhost:5000`) can be optimised by Next 16's SSRF-guarded image optimiser. In
production `NEXT_PUBLIC_API_URL` points at the real API host and only pattern-approved hosts
are ever fetchable, so it introduces no production exposure. It can be removed later if the
local driver is retired.

**SEO:** `metadataBase`, `openGraph.url`, `robots`, `sitemap` and the canonical URL are all
derived from `NEXT_PUBLIC_SITE_URL` (fallback `https://jazaritech.com`). Set it to the real
public domain — do not rely on a domain the company does not own.

---

## 8. Environment variables (names only — never values)

### `Backend` (Vercel → Project → Settings → Environment Variables)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | yes | `production` on Vercel |
| `MONGODB_URI` | yes | Hosted MongoDB (Atlas) connection string |
| `JWT_SECRET` | yes | JWT signing secret (≥ 32 chars in production) |
| `JWT_EXPIRES_IN` | no | Session lifetime (default `7d`) |
| `JWT_COOKIE_NAME` | no | Session cookie name (default `jazari_admin`) |
| `COOKIE_SECURE` | yes (prod) | `true` — cookie only over HTTPS |
| `COOKIE_SAMESITE` | yes (prod) | `none` when frontend/API are cross-site (see §9) |
| `CLIENT_ORIGIN` | yes | Exact allowed frontend origin(s), comma separated |
| `TRUST_PROXY` | no | Trusted proxy hops (default `1`) |
| `PUBLIC_API_URL` | no | Public base URL of the API (local asset URLs) |
| `PORT` | no | Ignored on Vercel (platform assigns the port) |
| `LOG_FORMAT` | no | morgan format |
| `JSON_BODY_LIMIT` | no | JSON body size (see §10) |
| `CLOUDINARY_CLOUD_NAME` | yes (prod) | Logo/image storage |
| `CLOUDINARY_API_KEY` | yes (prod) | Logo/image storage |
| `CLOUDINARY_API_SECRET` | yes (prod) | Logo/image storage |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | seed only | Super Admin seeded by `npm run seed` |
| `SEED_RESET_ADMIN_PASSWORD` | no | Reset the configured account's password on seed |
| `DEMO_ADMIN_EMAIL` | no | Legacy/demo account deactivated on seed |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | no | General rate limit |
| `LOGIN_RATE_LIMIT_MAX` | no | Login attempts |
| `SUBMISSION_RATE_LIMIT_MAX` | no | Intake submissions |
| `VISITOR_RATE_LIMIT_MAX` | no | Visitor tracking |
| `SENSITIVE_RATE_LIMIT_MAX` | no | Team + password operations |
| `VISITOR_DEDUPE_HOURS` | no | Visitor dedupe window |

### `frontend` (Vercel → Project → Settings → Environment Variables)

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_API_URL` | yes | API base URL incl. `/api` (also drives image `remotePatterns`) |
| `NEXT_PUBLIC_SITE_URL` | yes | Public site URL (metadata, canonical, robots, sitemap) |

---

## 9. Cookies across `*.vercel.app` origins

`*.vercel.app` is on the Public Suffix List, so
`jazaritech-frontend.vercel.app` and `jazaritech-backend.vercel.app` are treated as
**different sites**, not subdomains of one site. The admin session cookie is therefore
**cross-site**, and browsers silently drop a cross-site cookie that is not
`SameSite=None; Secure`.

Production configuration that works with two separate `*.vercel.app` hosts:

```
COOKIE_SECURE=true
COOKIE_SAMESITE=none
CLIENT_ORIGIN=https://<frontend>.vercel.app
```

If both apps are later moved under one **registrable custom domain** (e.g.
`app.example.com` + `api.example.com`), `SameSite=Lax` becomes viable again. Do not change
these values blindly — match them to the final origin relationship.

---

## 10. Upload size (Vercel request-body limit)

Vercel serverless functions cap the request body at roughly **4.5 MB**. A base64 data URI
adds ~33% over the binary size, so an 8 MB source image cannot reach the API on Vercel.

Handling implemented:

- The admin Logos Manager now **preprocesses client-side** (`frontend/lib/imagePrep.ts`)
  before uploading: it decodes the image, downscales to the same bound the backend pipeline
  already applies (1280×720, never upscaled), and re-encodes to WebP/PNG keeping
  transparency, targeting ≤ ~3.9 M characters (~2.9 MB binary). The prepared data URI is
  reused for both the server-side preview and the final upload.
- If a file still cannot be brought under the limit, the admin sees a clear message asking
  them to resize it — the upload is refused, never silently corrupted.
- The backend validation (`MAX_IMAGE_BYTES` 8 MB, format allow-list) is unchanged and stays
  authoritative.

**Effective upload size:** with preprocessing, typical logos reach the API well under
~4.5 MB. **Future optimisation (planned, not implemented):** direct-to-Cloudinary **signed**
uploads would remove the payload from the serverless function entirely. Recorded in
`PROJECT_NOTES.md` as a planned optimisation.

---

## 11. MongoDB Atlas network access (operational)

Vercel functions use dynamic outbound IPs, so Atlas **Network Access** typically requires
allowing `0.0.0.0/0` (or a broad range). Compensate with:

- a **strong** database password;
- a **least-privilege** Atlas user (a single app database, read/write — not an admin);
- the connection string stored **only** as the `MONGODB_URI` environment variable on Vercel
  (never in code or docs);
- regular credential rotation.

---

## 12. Post-deploy checklist

- [ ] Backend deployed; `GET /api/health` → `200` with `database: "connected"`.
- [ ] Backend env vars set (names in §8) — no value printed anywhere.
- [ ] MongoDB Atlas allows the deployment's egress (see §11).
- [ ] `CLIENT_ORIGIN` equals the exact frontend origin.
- [ ] `COOKIE_SECURE=true`; `COOKIE_SAMESITE` matches the origin relationship (§9).
- [ ] Cloudinary credentials set (production refuses to boot without them).
- [ ] `npm run seed` run once against production (or the Super Admin created) — password
      preserved unless `SEED_RESET_ADMIN_PASSWORD=true`.
- [ ] Frontend deployed; `NEXT_PUBLIC_API_URL` ends with `/api`; `NEXT_PUBLIC_SITE_URL` set.
- [ ] Public homepage renders; product logos load (image optimiser, Cloudinary).
- [ ] Admin login works and the session cookie survives navigation (`/admin/*`).
- [ ] Start-Your-Project submission reaches the database and appears in `/admin/submissions`.
- [ ] Visitor tracking records and appears in `/admin/visitors`.
- [ ] Logo upload works end-to-end (client preprocessing → Sharp → Cloudinary).
- [ ] Robots/sitemap/canonical resolve on the production domain.

---

## 13. Vercel project name typo (`official-webiste`)

The frontend Vercel project is currently named **`official-webiste`** — “webiste” is likely
a typo for “website”.

- **This does not need to change** for deployment correctness. The project name is cosmetic.
- To rename: Vercel → project → **Settings → General → Project Name**; save. Vercel keeps the
  existing domain aliases; a rename may change the default `*.vercel.app` domain, so update
  `CLIENT_ORIGIN`/`NEXT_PUBLIC_API_URL` if the URLs change.
- To add a custom domain: Vercel → project → **Settings → Domains → Add**, then point the
  DNS record at Vercel. Set `NEXT_PUBLIC_SITE_URL` (frontend) accordingly.

Freebuff did not rename any Vercel project.

---

## 14. Verification performed for this document

- `Backend`: `npm run lint` ✅, `npm run build` ✅ (46 files), `NODE_ENV=test npm run smoke` ✅ (144/144,
  the extra 20 assertions covering `seed:prod` safety and idempotency — see §15).
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅ (14 routes),
  `npm run audit:contrast` ✅ (49/49 token pairs ≥ 4.5:1), `node scripts/verify-three.mjs` ✅ (164/164).
- **`vercel.json` schema-validated** against Vercel's official schema
  (`https://openapi.vercel.sh/vercel.json`, which sets `additionalProperties: false`): all three keys
  are valid — `$schema`, `framework: "express"` (present in the framework enum) and `fluid: true`
  (“Enables Fluid compute for the project”). The schema deliberately does **not** allow top-level
  `memory` or `maxDuration`, which is why neither is set here.
- **Entry-point detection** confirmed against Vercel's Express guide: Vercel looks for `app`, `index`
  or `server` at the project root (or under `src/`) exporting the app as the default export —
  `Backend/server.js` does exactly that (`export default app`) and only calls `app.listen()` when
  `process.env.VERCEL` is unset.
- **Serverless simulation (`VERCEL=1`, `NODE_ENV=production`)** — imported `server.js` with no port
  listener, then drove requests through the default export: mongoose `readyState` was **0** after
  import (no eager connection), `GET /api/health` returned **200** with `database:"disconnected"` in
  40 ms, DB-backed routes returned a structured **503 `DATABASE_UNAVAILABLE`** after the 10 s
  server-selection timeout (this machine's IP is not in the Atlas allow-list), and the process kept
  serving every subsequent request — **no `process.exit`, no crash loop**, exit 0. The probe script
  was deleted afterwards; no backend source file was modified by this verification.
- **Bundle size**: `Backend/node_modules` is 71 MB, and Vercel's file tracing ships only what the
  entry imports — far below the 250 MB Vercel Functions limit.
- No secret value is present in this document — variable **names** only.

**Not verifiable from this machine:** a real `vercel build` / `vercel deploy` (the Vercel CLI is not
authenticated here — run `vercel login`, then Option B above), the live Hobby “Blocked” state,
Lighthouse, Firefox and Safari. Two owner-side prerequisites for a working production API: a
`JWT_SECRET` of **≥ 32 characters** (production config refuses shorter values — the local dev `.env`
one is intentionally short) and an Atlas network-access rule that includes Vercel's egress IPs (§11).
---

## 15. Production admin login — seeding & troubleshooting (Task G)

### 15.1 Root cause (measured, not assumed)

The deployed admin login returned `401 UNAUTHORIZED`. A read-only probe against the deployed
database reported:

```
DATABASE_CONNECTED=true   DATABASE_NAME=OfficialWebsite
COUNT_ADMINS=0            COUNT_SERVICES=0      COUNT_PRODUCTS=0
COUNT_PRODUCTTYPETEMPLATES=0                    COUNT_SUBMISSIONS=0
ADMIN_EXISTS=false
HEALTH_STATUS=200   HEALTH_DATABASE=disconnected   HEALTH_ENV=production
LOGIN_STATUS=401    LOGIN_ERROR_CODE=UNAUTHORIZED  LOGIN_COOKIE_ATTRIBUTES=[]
```

**The production database was never seeded.** Every collection was empty (only `visitors` had rows),
so `POST /api/auth/login` had no account to match and `GET /api/services` returned 0 items. The auth
code, hashing and cookie configuration were not the fault.

Two things were therefore shipped:

1. a **guarded, idempotent production seed** (§15.2), and
2. a **same-origin `/api` proxy** so the admin cookie is first-party (§15.3).

> `HEALTH_DATABASE=disconnected` on a cold Vercel instance is **expected**, not an outage: the
> MongoDB connection is intentionally lazy and only established on the first DB-backed request
> (`Backend/middleware/ensureDb.js`). `/api/health` is served before that guard.

### 15.2 Run the production seed (one time)

`scripts/seed-prod.js` **refuses to run** — exit 1, no DB connection, no writes — unless
`CONFIRM_PRODUCTION_SEED=true` is present. It validates `ADMIN_PASSWORD` against the project policy
(8–200 chars, upper + lower + digit) **before** connecting, prints the target **database name only**
(never the host or credentials), and is idempotent: re-running preserves the existing password unless
`SEED_RESET_ADMIN_PASSWORD=true`, and it will never create a second admin.

> The script reads these variables from the **process environment only** — it does not load
> `Backend/.env`. That is deliberate (no accidental production writes from a stray local config), so
> supply `MONGODB_URI` in the shell for this one command. Nothing is written to disk, and no secret
> is echoed.

**Windows CMD**

```bat
cd /d "D:\Jazari Tech Official\Website\Backend"
set "CONFIRM_PRODUCTION_SEED=true"
set "MONGODB_URI=<paste the production Atlas connection string>"
set "ADMIN_EMAIL=<owner email>"
set "ADMIN_PASSWORD=<strong password: 8-200 chars, upper + lower + digit>"
set "ADMIN_NAME=<display name>"
npm run seed:prod

rem then clear them from this shell:
set "MONGODB_URI="
set "ADMIN_PASSWORD="
set "CONFIRM_PRODUCTION_SEED="
```

**PowerShell**

```powershell
cd "D:\Jazari Tech Official\Website\Backend"
$env:CONFIRM_PRODUCTION_SEED = "true"
$env:MONGODB_URI      = "<paste the production Atlas connection string>"
$env:ADMIN_EMAIL      = "<owner email>"
$env:ADMIN_PASSWORD   = "<strong password: 8-200 chars, upper + lower + digit>"
$env:ADMIN_NAME       = "<display name>"
npm run seed:prod

Remove-Item Env:MONGODB_URI, Env:ADMIN_PASSWORD, Env:CONFIRM_PRODUCTION_SEED
```

Expected tail on success (it prints the **database name** and counts, nothing else):

```
[seed:prod] target database: OfficialWebsite
[seed:prod] done.
  admin created: true
  templates:     8
  services:      14
  products:      0
```

Optional flags: `SEED_RESET_ADMIN_PASSWORD=true` (rotate an existing admin's password),
`SEED_SAMPLE_CONTENT=true` (demo products — **off by default in production**),
`DEMO_ADMIN_EMAIL=<email>` (deactivate a legacy/demo account).

### 15.3 Make the admin cookie first-party (same-origin proxy)

If the deployed frontend and API live on **different** `*.vercel.app` hosts, a `SameSite=Lax` cookie is
not sent on the cross-site XHR and an admin is bounced back to `/admin/login` after a successful
sign-in. Fix it by proxying the API through the frontend origin — no cookie-attribute weakening
required:

| Where | Variable | Value |
|-------|----------|-------|
| `frontend` (Vercel project) | `NEXT_PUBLIC_API_URL` | *(empty)* or `/api` |
| `frontend` (Vercel project) | `BACKEND_ORIGIN` | `https://<your-backend>.vercel.app` |

`frontend/next.config.ts` then rewrites `/api/:path*` → `${BACKEND_ORIGIN}/api/:path*` server-side, so
the browser only ever talks to the frontend origin. Leave `BACKEND_ORIGIN` unset for a plain local run
(local dev keeps using `NEXT_PUBLIC_API_URL=http://localhost:5000/api`). Redeploy the frontend after
changing these.

### 15.4 Troubleshooting table

| # | Symptom | Likely cause | Fix |
|---|---------|--------------|-----|
| 1 | Login shows **“Email or password is incorrect.”** | Wrong credentials, **or** the database has no admin account at all | Run the production seed (§15.2), then retry. Verify `/api/services` returns 14 items. |
| 2 | Login shows **“We couldn't reach the authentication service right now.”** | 5xx / `DATABASE_UNAVAILABLE` / network — Atlas unreachable, or env missing | Check the response in DevTools and `GET /api/health`; confirm `MONGODB_URI` is set on the backend project and the Atlas allow-list includes Vercel (§11). |
| 3 | Login *succeeds* but the next page bounces back to `/admin/login` | Cross-site admin cookie (`SameSite=Lax`) is not sent because the frontend and API are on different hosts | Set the same-origin proxy (§15.3): `BACKEND_ORIGIN` on the frontend, `NEXT_PUBLIC_API_URL` empty/relative, then redeploy. |
| 4 | `/api/services` returns `200` with **0 items** | Database unseeded | Run the production seed (§15.2). |
| 5 | `/api/health` reports `database:"disconnected"` on a fresh instance | Expected — the connection is lazy | Issue any DB-backed request; the connection is established on first use. |
| 6 | `npm run seed:prod` exits 1 with **REFUSED** | `CONFIRM_PRODUCTION_SEED` is not set | Set it to `true` for that single run (§15.2). This is the safety guard working. |
| 7 | `npm run seed:prod` prints **missing MONGODB_URI** even though `Backend/.env` has it | The script reads the **process environment only** and does not load `.env` (by design) | Provide `MONGODB_URI` in the same shell command (§15.2). |
| 8 | `503 DATABASE_UNAVAILABLE` after ~10 s on any DB route | Atlas network access does not include Vercel's egress IPs | Add `0.0.0.0/0` (or the Vercel egress range) under Atlas → Network Access; see §11. |

**Security notes.** Never commit a connection string or the admin password; never paste them into a
ticket or screenshot. `seed:prod` prints the database **name** and counts only — verify a run by
reading those, not by echoing the environment.
