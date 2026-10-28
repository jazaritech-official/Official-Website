# FORENSIC 08 — Deployment & Operations (Phase 8)

---

## 8.1 Documented instructions vs actual code

| doc claim | code | verdict |
|---|---|---|
| `DEPLOYMENT.md §6` Root Directory `Backend`, Framework Preset Express, no build step | `Backend/vercel.json` = `{"$schema":…,"framework":"express","fluid":true}`; `Backend/server.js:65` `export default app;` | MATCH |
| `start()` only runs when not on Vercel | `server.js:106` `if (!process.env.VERCEL) { start(); }` | MATCH |
| `GET /api/health` mounted before `ensureDb` | `routes/index.js:11-12` | MATCH |
| Lazy MongoDB cached on `globalThis` | `config/db.js:10-14` | MATCH |
| `503 DATABASE_UNAVAILABLE` instead of `process.exit` | `middleware/ensureDb.js` | MATCH (code also defines the message verbatim) |
| Trust proxy default `1` | `env.js` `readInt("TRUST_PROXY", 1)`; `server.js:20` | MATCH |
| CORS from `CLIENT_ORIGIN`, `credentials: true`, never `*` | `server.js:31-43` | MATCH (measured live) |
| Production refuses the local filesystem driver (fails to boot without Cloudinary) | `env.js` `if (isProd && (!cloudinary…)) problems.push(…)` → `process.exit(1)`; `storageService.js:43-45` warns only when `!isProd` | MATCH |
| `sharp` "ships prebuilt serverless binaries and is compatible with Vercel's Node 20/22 runtimes" | **not testable here** | **NOT VERIFIED** — this audit ran `sharp` on Windows x64 only (F-6-007) |
| §7 Root Directory `frontend`, Build Command `next build` | matches `frontend/package.json` | MATCH |
| `NEXT_PUBLIC_API_URL` must include `/api` | `next.config.ts:4` uses it verbatim as the API base; `lib/api.ts:59` | MATCH |
| `remotePatterns` = API host + `res.cloudinary.com` | `next.config.ts:84-97` | MATCH |
| `dangerouslyAllowLocalIP` is dev-only | present, commented at `next.config.ts:99-105` | MATCH (but see F-8-003) |
| SEO fields derived from `NEXT_PUBLIC_SITE_URL` with `https://jazaritech.com` fallback | `layout.tsx:19`, `robots.ts:4`, `sitemap.ts:4` | MATCH |

**Two documentation gaps** (both already recorded in 02 and 03):

* **F-8-001 — `BACKEND_ORIGIN` and `DIAGNOSTICS` are absent from the `DEPLOYMENT.md §8` frontend
  env table** (`DEPLOYMENT.md:278-283` lists only `NEXT_PUBLIC_API_URL` and
  `NEXT_PUBLIC_SITE_URL`). `BACKEND_ORIGIN` appears at `:513` and `:698`; `DIAGNOSTICS` never
  appears in `DEPLOYMENT.md` at all (`grep -n DIAGNOSTICS DEPLOYMENT.md` → no matches).
  Severity MEDIUM, CONFIRMED.
* **F-8-002 — `DEPLOYMENT.md:698` STATES "`BACKEND_ORIGIN` is runtime config, not only
  build-time" — THIS IS ONLY HALF TRUE (HIGH, CONFIRMED).**
  * True for the BFF: `lib/authBff.ts:53` reads `process.env.BACKEND_ORIGIN` **per request**, and
    `app/api/diag-session/route.ts:47` reads it at request time.
  * **False for the rewrite**: `next.config.ts:71` `rewrites()` is evaluated when Next builds the
    routes manifest. **Measured in this audit:**
    1. the pre-existing build (made without `BACKEND_ORIGIN`) had
       `routes-manifest.json → rewrites: {beforeFiles:[], afterFiles:[], fallback:[]}`;
    2. starting `next start` with `BACKEND_ORIGIN=http://127.0.0.1:5001` **and** hitting
       `/api/services` returned **404 "This page could not be found"**;
    3. after rebuilding *with* `BACKEND_ORIGIN`, the manifest contains
       `"afterFiles":[{"source":"/api/:path*","destination":"http://127.0.0.1:5001/api/:path*"}]`
       and `/api/services` returns 200 JSON.
  Consequence: setting `BACKEND_ORIGIN` **only at runtime** (e.g. after a build, or if the var is
  scoped to "Preview" but not "Production" build) leaves the `/api` proxy **absent**, while the
  `/api/auth/*` handlers still work. The site then falls back to the baked
  `NEXT_PUBLIC_API_URL`, reintroducing exactly the cross-site-cookie failure the BFF was built to
  prevent.

---

## 8.2 The BFF / rewrites design, verified

| path | what handles it | evidence |
|---|---|---|
| `/api/auth/login`, `/logout`, `/me`, `/password` | **Next route handlers** (filesystem beats rewrites) | `app/api/auth/*/route.ts` — comments state this explicitly; `next.config.ts:74` comment |
| `/api/diag-session` | Next route handler, gated | `route.ts:45` |
| `/api/:path*` (everything else) | **rewrite to `${BACKEND_ORIGIN}/api/:path*`** | `next.config.ts:71-75`, proven by the manifest above |
| Cache-Control | `next.config.ts:77-95` adds `no-store` to `/api/auth/:path*` and `/api/diag-session` | headers manifest `headers: 2` |

### What breaks if `NEXT_PUBLIC_API_URL` is set to an absolute URL

`next.config.ts:29-51` `warnOnCookieUnsafeApiUrl()` detects this **only at build time** and only
when `BACKEND_ORIGIN` is empty; it prints a warning. `lib/api.ts:58-59` prefers the proxy when
`NEXT_PUBLIC_API_PROXY === "1"` (which `next.config.ts` bakes from `BACKEND_ORIGIN`). So:

* absolute URL **+ no** `BACKEND_ORIGIN` → browser calls the API cross-site → auth cookie becomes
  third-party → "login works, then every request 401". Warning printed at build, **but only if
  `NODE_ENV === "production"` and only in the build log** (easy to miss).
* absolute URL **+** `BACKEND_ORIGIN` set at build → proxy wins, cookie stays first-party.
* **`NEXT_PUBLIC_API_URL` is inlined into the client bundle at build time** — changing it later in
  Vercel without a redeploy has no effect.

**F-8-003 — THE WARNING IS BUILD-ONLY AND NON-FATAL (MEDIUM, CONFIRMED).**
`next.config.ts:30` `if (process.env.NODE_ENV !== "production") return;` and it only
`console.warn`s. A production deploy with the wrong combination succeeds silently.
Recommended fix (NOT APPLIED): fail the build, or assert at runtime on `/api/auth/me`.

### What breaks if `BACKEND_ORIGIN` has a trailing slash or `/api` suffix

* Trailing slash: **handled** — `next.config.ts:21` `.replace(/\/+$/, "")`.
* `/api` suffix: **NOT handled.** The rewrite destination is
  `${backendOrigin}/api/:path*`, so `BACKEND_ORIGIN=https://host/api` yields
  `https://host/api/api/:path*` → every proxied call 404s.
  `lib/authBff.ts:53` `normalizeApiBase()` does normalise for the BFF, so the two paths would
  **disagree**: login could work while `/api/services` 404s (or vice versa).

**F-8-004 — `BACKEND_ORIGIN` WITH AN `/api` SUFFIX SILENTLY BREAKS THE PROXY (MEDIUM, CONFIRMED).**
Evidence: `next.config.ts:21` only strips slashes; the destination template at `:73` appends
`/api/:path*`. No validation rejects an origin that already ends in `/api`.
Recommended fix (NOT APPLIED): strip a trailing `/api` in `next.config.ts` and log the final
destination at build time.

---

## 8.3 Production-only config traps

| trap | code | state |
|---|---|---|
| `NODE_ENV`-dependent paths | `env.js:4` `isProd` gates Cloudinary requirement, cookie `secure` default, log format, `autoIndex`, pool size, and the 5xx message genericisation (`errorHandler.js:44`) | correct, but **`NODE_ENV` is a Vercel-provided value — never set it manually** |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | defaults `isProd` / `lax` (`env.js:76-77`) | defaults are right for the proxy; `COOKIE_SAMESITE=none` triggers a warning only when `secure` is false |
| `CLIENT_ORIGIN` / CORS | default `http://localhost:3000`; **must be the deployed frontend origin** or the browser gets no `Access-Control-Allow-Origin` | documented at `DEPLOYMENT.md §6` |
| `TRUST_PROXY` | default `1` — correct behind Vercel's edge; controls both `req.ip` (rate limiting) and `X-Forwarded-For` | correct |
| `DIAGNOSTICS` left on | gated (`route.ts:45`), default off | **not in the DEPLOYMENT checklist** — F-8-001 |
| `RATE_LIMIT_MAX` | default 300; unbounded | F-3-011 |
| `AUTH_DEBUG_HEADERS` | default false, warns in prod | OK |
| `CONFIRM_PRODUCTION_SEED` | `seed-prod.js:27` refuses without it | OK |
| build-time vs runtime (see 8.4) | | the central trap |

---

## 8.4 Build-time vs runtime table

| value | when baked | redeploy needed? |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **build** (inlined into the client bundle) | yes, full rebuild |
| `NEXT_PUBLIC_SITE_URL` | **build** (used by `layout.tsx`, `robots.ts`, `sitemap.ts`) | yes |
| `NEXT_PUBLIC_API_PROXY` | **build** (`next.config.ts env` block) | yes |
| `/api/:path*` rewrite (`BACKEND_ORIGIN`) | **build** (`routes-manifest.json`) | yes — **F-8-002** |
| `headers()` for `/api/auth/*` | **build** | yes |
| `content-snapshot.json` | **build** (`prebuild` → `snapshot-content.mjs`) | regenerate before every build |
| `BACKEND_ORIGIN` in the BFF (`authBff.ts`, `diag-session`) | **runtime** (read per request) | no |
| `DIAGNOSTICS` | **runtime** | no |
| Backend: `MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_*`, `VAPID_*`, `COOKIE_*`, `CLIENT_ORIGIN`, `TRUST_PROXY`, rate limits | **runtime** | no |
| Backend `NODE_ENV` | runtime (Vercel sets it) | no |

**What happens if the snapshot script fails during a build:** it cannot fail the build —
`snapshot-content.mjs` catches every fetch error, keeps the previous file, and exits 0
(`:79`, `:99`). If there is no previous file and no data it exits 0 **without writing**, so the
build proceeds with no snapshot at all and the site falls through to the designed ERROR state
(proven by harness CHECK 67).

**A no-cache redeploy is required whenever any `NEXT_PUBLIC_*` or `BACKEND_ORIGIN` changes.**
`DEPLOYMENT.md:694` says to redeploy "with the build cache off" for the Task L `three` removal;
that instruction is **not** repeated for env-var changes, which is the more common case.

**F-8-005 — ENV-CHANGE REDEPLOY INSTRUCTIONS ARE INCOMPLETE (MEDIUM, CONFIRMED).**
`grep -n "cache off" DEPLOYMENT.md` → only `:694` (tied to the `three` removal). Nothing tells
the owner to clear the build cache when `BACKEND_ORIGIN`/`NEXT_PUBLIC_*` change — yet those are
exactly the values the build bakes.

---

## 8.5 OWNER ACTION CHECKLIST (ordered, names only, no values)

Run these in order. Nothing here was executed by this audit.

**A. Before the next deploy**

1. `git status --porcelain` on your machine — confirm only `FORENSIC/` is new (this audit's proof).
2. In Vercel → frontend project → Settings → Environment Variables, confirm these exist for
   **Production and Preview, and are available at BUILD time**:
   `BACKEND_ORIGIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`.
3. Confirm `NEXT_PUBLIC_API_URL` is a **relative** `/api` (or that `BACKEND_ORIGIN` is set — both
   together is the safe combination). Remove any stale absolute cross-site value.
4. In Vercel → frontend project → Settings → Environment Variables, confirm `DIAGNOSTICS` is
   **absent or set to `false`** (it is not in DEPLOYMENT.md §8 — see F-8-001).
5. In Vercel → backend project → Settings → Environment Variables, confirm:
   `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `CLIENT_ORIGIN`,
   `TRUST_PROXY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, and optionally `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
6. Confirm `CLIENT_ORIGIN` equals the deployed frontend origin exactly (scheme + host, no
   trailing slash).
7. Confirm `BACKEND_ORIGIN` has **no trailing `/api`** (F-8-004) — a trailing slash is fine.
8. Deploy the **backend first**, then the **frontend**, with the build cache cleared.

**B. Dependency remediation (owner decision; not applied by this audit)**

9. Upgrade `next` from `16.3.8` to `16.4.3` or later (F-2-011 — 1 critical advisory set).
10. Run `npm audit fix` in `Backend/` for `body-parser` (F-3-016 — 1 high).

**C. Data**

11. If the production database was seeded before Task K/L/M, re-run
    `npm run seed:prod` (with `CONFIRM_PRODUCTION_SEED=true`) so `shortDescription`, `category`
    and `accent` exist — otherwise the services render through the fallback path and copy will
    read as one-word lines (F-6-010 + F-4-004).
12. Decide whether `SEED_SAMPLE_CONTENT` should be `true` in production; with it unset,
    `GET /api/products` returns an empty list and the product section shows its EMPTY state
    (F-4-005).
13. Check Admin → Homepage Logos for entries literally named `Showcase Fixture A` /
    `Showcase Fixture B`, and Admin → Project Requests for harness submissions. If present, they
    were created by `verify-three.mjs:130` (F-4-006) and must be deleted by hand.

**D. Post-deploy verification (manual, from a browser)**

14. Hard-reload `/` and confirm `data-hero="svg-v2"` on the hero element in DevTools.
15. Confirm `GET /api/services` through the **frontend origin** (not the backend origin) returns
    JSON — this proves the build-time rewrite exists (F-8-002).
16. Confirm the admin login survives a page reload (cookie is first-party).
17. Confirm the response headers on `/` now include CSP/HSTS/XFO (F-3-010 — currently absent).
18. Confirm `https://<frontend>/api/diag-session` returns **404**.

**E. Process**

19. Decide whether `frontend/scripts/verify-three.mjs` should become an npm script (F-2-009).
20. Rotate anything ever pasted into a chat log or committed elsewhere — **nothing in this
    repository's git history requires rotation** (see FORENSIC/03 §3.1).
