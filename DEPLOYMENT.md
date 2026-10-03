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

`Backend/vercel.json` declares `{ "framework": "express" }`. `Backend/server.js` exports the
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

- `Backend`: `npm run lint` ✅, `npm run build` ✅ (45 files), `NODE_ENV=test npm run smoke` ✅.
- `frontend`: `npm run lint` ✅ (0 problems), `npm run build` ✅.
- No secret value is present in this document — variable **names** only.
