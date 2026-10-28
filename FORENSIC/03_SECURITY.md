# FORENSIC 03 — Security Forensics (Phase 3)

Scope: read-only. No secret value was read, printed or repeated. Where a value would
appear the report says `[REDACTED — <type>, <file>:<line>]`.

---

## 3.1 Secrets in tree and history

### Commands

1. `npm run check:secrets` (frontend) →
   `[check:secrets] clean — 8 file(s) scanned, no secret-looking values.` exit 0.
2. Whole-tree fixed-string scan over every commit for
   `mongodb+srv://`, `CLOUDINARY_API_SECRET=`, `CLOUDINARY_API_KEY=`, `JWT_SECRET=`,
   `VAPID_PRIVATE_KEY=`, `ADMIN_PASSWORD=`, `BEGIN RSA PRIVATE KEY`, `BEGIN PRIVATE KEY`
   using `git grep -l -F "<pattern>" <commit>` (file names only, never line content).
3. Shape classifier over the 7 scannable tracked documents, printing `file:line KIND -> verdict`
   only (PLACEHOLDER / CODE-ENV-REF / REALLY-LOOKS-REAL).

### Results

| pattern | commits containing it | files |
|---|---|---|
| `mongodb+srv://` | 13 of 25 | `Backend/.env.example`, `DEPLOYMENT.md`, `frontend/scripts/check-no-secrets.mjs` |
| `CLOUDINARY_API_SECRET=` | 26 refs across all 25 commits | `Backend/.env.example` |
| `CLOUDINARY_API_KEY=` | all 25 commits | `Backend/.env.example` |
| `JWT_SECRET=` | all 25 commits | `Backend/.env.example` |
| `VAPID_PRIVATE_KEY=` | 13 commits (from `ca54f7e` onward) | `Backend/.env.example` |
| `ADMIN_PASSWORD=` | all 25 commits | `Backend/.env.example`, seed scripts, `DEPLOYMENT.md`, `PROJECT_NOTES.md`, `README.md` |
| `BEGIN RSA PRIVATE KEY` / `BEGIN PRIVATE KEY` | **no matches in any commit** | — |

**Verdict: NO REAL SECRET IS PRESENT IN THE WORKING TREE OR IN GIT HISTORY.**

Reasoning (evidence-based, values never printed):

* `npm run check:secrets` classifies every secret-shaped line in the tracked `.env.example` and
  `.md` files and reports clean; its `PLACEHOLDER`/`ANGLE` filters reject `<...>`, `your…`,
  `change-me`, `example`, `placeholder`.
* The shape classifier over the same files returned only `PLACEHOLDER` and `CODE/ENV-REF`
  verdicts (e.g. `ADMIN_PASSWORD=` lines in seed scripts are `process.env`/argument references,
  not assignments of a literal).
* `Backend/.env.example` is the only `.env*` file tracked by git
  (`git ls-files | grep -E "(^|/)\.env"` → `Backend/.env.example`).
* No `.env` file has ever been committed: `git log --all --diff-filter=A --name-only` shows no
  `.env` other than `.env.example`.

**Rotation list: NONE REQUIRED on the basis of this repository.**
Secrets may still exist in *chat logs* or *Vercel/Atlas dashboards* — that is outside this repo
and cannot be checked from here (**NOT VERIFIED**).

### Untracked secret-bearing files (existence only, values never opened)

`Backend/.env` EXISTS, `frontend/.env.local` EXISTS, `.env.local` (root) EXISTS.
None is tracked. `.gitignore` protects `.env`, `.env.local`, `.env.*.local`, plus `.env*`
(see 3.2 for a defect in the last rule).

---

## 3.2 `.gitignore` audit

Protected (verified present in `.gitignore`): `node_modules/`, `frontend/.next/`, `frontend/out/`,
`frontend/next-env.d.ts`, `.env`, `.env.local`, `.env.*.local`, `!*.env.example`, `*.log`,
`Backend/uploads/*` + `!Backend/uploads/.gitkeep`, `frontend/test-output/`, `.DS_Store`,
`*.tsbuildinfo`, `coverage/`, `.vercel`, `.env*`.

**F-3-001 — `.gitignore` HAS A MIXED-LINE-ENDINGS DEFECT (LOW, CONFIRMED).**
Command: `cat .gitignore` renders the last three entries as `coverage/\r`, `.vercel\r`, `.env*\r`
while the earlier entries are LF. `grep -c $'\r' .gitignore` returned 0 on the file *as read by
grep in this shell*, but the raw `cat` output shows `\r` on the final three lines — the file has
mixed terminators on the trailing block. Practical effect: the redundant `.env*` rule may be
literal-matched as `.env*<CR>`. The important rules (`.env`, `.env.local`, `.env.*.local`) are on
the LF portion and DO work — proven by: `.env.local`, `Backend/.env`, `frontend/.env.local` all
exist on disk and `git status --porcelain` is empty.

`.env.example` shape: contains only angle-bracket / `your-` style placeholders (classified
`PLACEHOLDER` above). No real-looking value.

**F-3-018 — THE `.env.example` NEGATION IN `.gitignore` IS DEAD (LOW, CONFIRMED).**
`.gitignore` contains `!*.env.example` and `!/.env.example` **before** the final `.env*` line.
In gitignore semantics the last matching pattern wins, so `.env*` re-ignores `.env.example`.
Measured: `git status --porcelain --ignored=matching` reports
`!! frontend/.env.example` — an existing `frontend/.env.example` is ignored, while
`Backend/.env.example` is tracked only because it was added before the rule existed.
Practical effect: any new `.env.example` will silently not be added by `git add .`.
Recommended fix (NOT APPLIED): move the `!*.env.example` negations **after** the `.env*` rule.

**F-3-019 — PREVIOUS SESSIONS LEFT REAL UPLOADS IN THE REPO DIRECTORY (INFO, CONFIRMED).**
`git status --porcelain --ignored=matching` lists two ignored files:
`Backend/uploads/logo-1790918585898-e5139964f9.png` and
`Backend/uploads/logo-1790918585931-78519a0f99.png`. They are gitignored (so the tree is clean)
but they are evidence that a past harness/session uploaded real logo assets to the local storage
driver. They belong on the owner's cleanup list alongside any fixture logos in a real database
(F-4-006).

**NOT PROTECTED:** `FORENSIC/_tmp/` is not in `.gitignore` (this audit created and then deleted
it, so the tree is unaffected). `frontend/tmp-tile.css` is not ignored either — it is simply
untracked. **F-3-002 (INFO, CONFIRMED).**

---

## 3.3 Auth review (code + live header capture)

### `requireAuth` — VERIFIED-REAL

`Backend/middleware/auth.js:43-77`:
1. token from cookie, else `Authorization: Bearer`;
2. `jwt.verify` with `env.jwt.secret`;
3. **`await Admin.findById(payload.sub).lean()` on every request** — authorization is re-read from
   the database each time (comment at `auth.js:15-20` and code at line 57);
4. `isActive === false` → 403.
Role comes from the freshly-read document, never from the token.

### Role enforcement

`requireRole` is applied at exactly one mount: `admin.routes.js:57`
`adminRouter.use("/team", requireRole("super_admin"), teamRouter)`.
Every other `/api/admin/*` route is gated by `requireAuth` only, i.e. **any active admin may
create/edit/delete logos, products, templates, submissions, notifications and read visitors.**
That matches the documented design (`PROJECT_NOTES.md:382`), but there is **no second factor**
between `admin` and `super_admin` for destructive content operations.

**F-3-003 — PRIVILEGE MODEL IS BINARY (LOW, CONFIRMED).** Minimum role per route group:
`/api/admin/team/*` → `super_admin`; all other `/api/admin/*` → any authenticated active admin;
`/api/auth/login|logout` → public; `/api/auth/me|password` → authenticated.
No route was found that is reachable without `requireAuth` other than the intentional public set
listed in FORENSIC/02 §2.3.

### Password hashing — VERIFIED-REAL

`Backend/models/Admin.js:61` → `bcrypt.hash(plain, 12)`; `Admin.js:69` → `bcrypt.compare`.
Cost factor **12**. `authController.js:22` pre-computes a **decoy hash** with the same cost so a
login for an unknown email takes the same time as a real one (timing-attack mitigation at the
application level). Policy: `Backend/utils/password.js` → 8–200 chars, one lower, one upper, one
digit.

**No `crypto.timingSafeEqual` is used anywhere**
(`grep -rn "timingSafeEqual|timing-safe" Backend --include=*.js` → no matches). Not required here:
comparisons go through `bcrypt.compare`, which is constant-time by design. Recorded as evidence,
not as a finding.

### Login rate limiting / lockout — PARTIAL

`loginLimiter` = `LOGIN_RATE_LIMIT_MAX` (default **10**) per `RATE_LIMIT_WINDOW_MS`
(default 15 min), applied at `auth.routes.js:26`. There is **no account lockout**, no progressive
backoff and no CAPTCHA.

**F-3-004 — NO ACCOUNT LOCKOUT (LOW, CONFIRMED).** Evidence: `middleware/rateLimiter.js:29-33`
(keyed by IP via `express-rate-limit` defaults) and no lockout field on `Admin`.
Attack shape: distributed IPs can attempt unlimited passwords against one account.

### JWT / cookie flags — compared

| attribute | Backend (`utils/authCookie.js`) | BFF (`lib/authBff.ts`) | same? |
|---|---|---|---|
| name | `env.jwt.cookieName` (default `jazari_admin`) | forwarded upstream name | yes (verified by verify-bff 21/21) |
| Domain | absent (host-only) | absent — upstream `Domain` explicitly dropped | yes |
| Path | `/` | `Path=/` | yes |
| HttpOnly | true | `HttpOnly` | yes |
| Secure | `env.jwt.cookieSecure` (default true in prod) | `Secure` only when `NODE_ENV === "production"` | yes in prod |
| SameSite | `env.jwt.cookieSameSite` (default `lax`) | **hard-coded `SameSite=Lax`** | **divergence** |
| Max-Age | `SESSION_MAX_AGE_MS` from `JWT_EXPIRES_IN` (default `7d`) | copies upstream Max-Age | yes |

**F-3-005 — BFF FORCES `SameSite=Lax`, IGNORING `COOKIE_SAMESITE` (LOW, CONFIRMED).**
`lib/authBff.ts:124` → `const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"]`.
If an operator sets `COOKIE_SAMESITE=strict` on the backend, the browser still receives `Lax`.
Divergence is deliberate (the BFF owns the browser-facing cookie) but is not documented.

Logout **does** clear: `authCookie.js:59-66` writes the same attributes with `maxAge: 0` and
`expires: new Date(1)`; the BFF re-emits `Max-Age=0` (verify-bff checks `logout Max-Age=0` → pass).

### CSRF posture

**F-3-006 — NO ORIGIN/REFERER CHECK ON COOKIE-AUTHENTICATED MUTATIONS (MEDIUM, CONFIRMED).**
`grep -rn "origin|referer|csrf|xsrf" Backend/middleware Backend/controllers Backend/routes`
returns only unrelated matches (no CSRF middleware, no custom origin check).
Defence in depth today = `SameSite=Lax` + CORS (browser-enforced only for cross-origin
`fetch` with credentials). A same-site subdomain or a `SameSite=None` misconfiguration
(`COOKIE_SAMESITE=none`) would remove the protection entirely. Recommended fix (NOT APPLIED):
reject mutating requests whose `Origin` is not in `CLIENT_ORIGIN`.

### Cookie comparison vs. live proof

`npm run verify:bff` → **21/21 checks passed** (real run, this audit). It boots `next start` with
a hostile upstream returning `Domain=example.com; SameSite=None; Partitioned; Max-Age=604800` and
proves the re-emitted cookie is host-only, `SameSite=Lax`, `Path=/`, `HttpOnly`, `Secure`,
`Max-Age=604800`, and that logout re-emits `Max-Age=0`, and that a missing `BACKEND_ORIGIN`
yields `503 CONFIG_MISSING`.

### Default/seed admin credentials

No hard-coded password exists in source. `seed-prod.js:62-70` requires `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NAME` from the process environment and refuses to run otherwise.
`DEMO_ADMIN_EMAIL` defaults to `admin@jazaritech.com` (`env.js:150`) — an *email* default only;
the account is deactivated unless it is the configured account. Location recorded, value not
needed.

---

## 3.4 Input & output safety

### Validation on public endpoints — VERIFIED-REAL

`public.routes.js` applies `submissionRules`, `visitorRules`, `subscriptionRules` and an
endpoint length rule (`public.routes.js:93`) to every public POST; each route passes `validate`.
`admin.routes.js` applies `express-validator` chains to every write (lines 62-232).

### NoSQL injection

`grep -rn "req.query|req.body" Backend/controllers/*.js | grep -iE "find|findOne|where|filter|aggregate"`
→ **no matches**. Filters are built from validated `req.params.id` (`isMongoId`) or constants.

### Mass assignment

`grep -rn "\.\.\.req\.body|Object.assign(.*req\.body" Backend/controllers Backend/routes`
→ **no matches**. Controllers destructure explicit field lists (`normalizeLogoInput`,
`createLogo`, `updateLogo`).

### File upload handling

* Type allow-list: `storageService.js:13`
  `ALLOWED_TYPES = {image/jpeg, image/png, image/webp, image/gif, image/svg+xml}`.
* Size limit: `storageService.js:68-72` rejects > **8 MB** with `413 PAYLOAD_TOO_LARGE`.
* Route-level shape: `admin.routes.js:91` `body("image").isString().matches(/^data:image\//)`.
* Processing: sharp auto-orients, resizes to a bound, writes PNG for the processed asset
  (`imageProcessor.js:49-51`, `411-415`); Cloudinary path forces `format: "png"`
  (`storageService.js:167`).
* **Originals are preserved untouched** (`storeOriginal`, `logoController.js:227`) — including
  SVG, uploaded with its original mime type (`storageService.js:86`).

**F-3-007 — SVG UPLOADS ARE ALLOWED AND THE ORIGINAL IS STORED AND SERVED (MEDIUM, CONFIRMED).**
Evidence: `storageService.js:13` allows `image/svg+xml`; `storageService.js:108` writes
`Buffer.from(base64,"base64")` to `<id>.svg` on the local driver; `server.js:54-60` serves that
directory from `/api/uploads` via `express.static`.
Exploit sketch: an admin (or anyone who steals an admin session) uploads an SVG containing
script; opening `/api/uploads/<id>.svg` directly on the API origin would execute it.
Mitigation already in place (measured live): `helmet` sends
`Content-Security-Policy: ... script-src 'self'; script-src-attr 'none' ...`, which blocks inline
script in the SVG document. Severity is therefore MEDIUM, not HIGH. In production the driver is
Cloudinary (`res.cloudinary.com`), a different origin, which reduces it further.
Recommended fix (NOT APPLIED): drop `image/svg+xml` from `ALLOWED_TYPES`, or re-encode to PNG.

### XSS surfaces

| surface | evidence | verdict |
|---|---|---|
| `dangerouslySetInnerHTML` | exactly 2 uses: `app/layout.tsx:126` (static theme-init script) and `:130` (JSON-LD) | see F-3-008 |
| JSON-LD | `JSON.stringify(organizationJsonLd)` — harness CHECK 93 parses it and reports `sameAs: null` | safe today |
| Admin-authored HTML rendered publicly | `grep` for `dangerouslySetInnerHTML` in `components/` → **no matches** | none |
| Backend error messages shown raw in UI | `lib/api.ts:151` `error?.message \|\| messageForStatus(...)` | see F-3-009 |

**F-3-008 — JSON-LD INJECTED VIA `dangerouslySetInnerHTML` WITHOUT `</script>` ESCAPING (INFO, LIKELY).**
`app/layout.tsx:130`. All values are compile-time constants from this repo, so no untrusted input
reaches it today. Risk appears the moment any backend field is added to the object.
Recommended fix (NOT APPLIED): `JSON.stringify(x).replace(/</g, "\\u003c")`.

**F-3-009 — BACKEND `error.message` IS PASSED STRAIGHT TO UI TEXT (LOW, CONFIRMED).**
`lib/api.ts:151` and `:210`. Production 5xx messages are replaced by a generic string in
`errorHandler.js:44-46`, so the exposure is limited to non-5xx `ApiError` messages, which are
written as user-facing copy. A future controller that throws a non-`ApiError` with a numeric
`status < 500` would leak its raw message.

### Open redirect

The login `next=` parameter: `grep -rn "next=" frontend/app/admin/login frontend/lib` — the login
form redirects only after `api.auth.me()` succeeds and navigates to a fixed path; no
`redirect(nextParam)` pattern exists in `LoginForm.tsx`. **No open redirect found.**

### SSRF

Only one server-side `fetch` of a URL exists outside tests:
`storageService.js:190` → `fetch(cloudinary.url(publicId, ...))` where `publicId` comes from a
document the admin created, and the URL is *constructed* by the Cloudinary SDK, not supplied by
the user. `VisitTracker.tsx` sends `page`/`referrer` strings to the backend, which stores them
(`visitorController`) without fetching them. **No SSRF found.**

### Security headers

Measured live in this audit:

*Backend* (`curl -D - http://localhost:5001/api/health`):
`Content-Security-Policy` (helmet default, includes `script-src 'self'; script-src-attr 'none';
object-src 'none'; frame-ancestors 'self'; upgrade-insecure-requests`),
`Strict-Transport-Security: max-age=31536000; includeSubDomains`,
`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Resource-Policy: same-site`, `X-Download-Options: noopen`,
`X-Permitted-Cross-Domain-Policies: none`, `X-Content-Type-Options: nosniff`. `X-Powered-By`
absent (`app.disable("x-powered-by")`).

*Frontend* (`curl -D - http://localhost:3001/`):
`X-Powered-By: Next.js`, `Cache-Control`, `Vary`, `ETag` — **and nothing else**.

**F-3-010 — FRONTEND SHIPS NO SECURITY HEADERS (MEDIUM, CONFIRMED).**
Evidence: the header dump above; `frontend/next.config.ts` `headers()` only adds
`Cache-Control: no-store` to `/api/auth/:path*` and `/api/diag-session`.
Missing on every HTML response: CSP, HSTS, `X-Frame-Options`/`frame-ancestors`,
`Referrer-Policy`, `X-Content-Type-Options`, and `X-Powered-By` is exposed.
Exploit sketch: the public site can be framed (clickjacking), referrers leak the full URL, and a
stored-XSS on the frontend origin would run without a CSP brake.
Recommended fix (NOT APPLIED): add a `headers()` block in `next.config.ts` for `/(:path*)`.

### CORS

`server.js:31-43`: `origin` callback allows requests with **no** Origin (curl/server-to-server)
and any origin in `CLIENT_ORIGIN` (default `http://localhost:3000`); everything else is
`callback(null, false)` — measured: a preflight from `https://evil.example` returned **no**
`Access-Control-Allow-Origin` header, while `http://localhost:3000` received
`Access-Control-Allow-Origin: http://localhost:3000` plus `Access-Control-Allow-Credentials: true`.
`methods` limited to GET/POST/PUT/PATCH/DELETE/OPTIONS; `allowedHeaders: [Content-Type,
Authorization]`. Never `*` with credentials. **VERIFIED-REAL.**

### Rate-limit coverage

Measured live: `RateLimit-Limit: 5000; RateLimit-Remaining: 4980` on `/api/health` (the value I
set for this audit run; the **default is 300/15 min** from `env.js`).

| limiter | default max | applied to |
|---|---|---|
| general | `RATE_LIMIT_MAX` = 300 | every `/api/*` |
| login | `LOGIN_RATE_LIMIT_MAX` = 10 | `POST /api/auth/login` |
| submission | `SUBMISSION_RATE_LIMIT_MAX` = 5 | `POST /api/submission` |
| visitor | `VISITOR_RATE_LIMIT_MAX` = 120 | `POST /api/visitor-track` |
| push | `PUSH_RATE_LIMIT_MAX` = 60 | push subscribe/unsubscribe |
| sensitive | `SENSITIVE_RATE_LIMIT_MAX` = 30 | team + password routes |

**F-3-011 — `RATE_LIMIT_MAX` IS AN UNGUARDED KNOB (INFO, CONFIRMED).**
`env.js` `readInt("RATE_LIMIT_MAX", 300)` accepts any integer with no upper bound and no
production warning. Setting it to a very large value (as the harness instructions require)
silently disables rate limiting in that environment. Recommended fix (NOT APPLIED): warn when
`isProd && generalMax > 5000`.

### Error handler

`errorHandler.js:38-50`: 5xx body is generic **only when `env.isProd`**; in development the raw
`normalized.message` is returned. Stack traces are logged to the server console, never sent.
`notFoundHandler` echoes `req.originalUrl` back in the 404 message — a reflected string in the
JSON body (escaped by `JSON.stringify`, no HTML context). **No stack trace reaches the client in
production mode (VERIFIED by code reading).**

---

## 3.5 Web Push security

| question | evidence | verdict |
|---|---|---|
| subscription ownership | `PushSubscription` has no user identity — subscriptions are device-scoped, keyed by unique `endpoint` (`models/PushSubscription.js:14-15`) | by design |
| who can send | `POST /api/admin/notifications` sits behind `adminRouter.use(requireAuth)` (`admin.routes.js:53`) | admin-only, **enforced server-side** |
| admin-only composer enforced server-side | yes — route-level, not just UI (see above) | VERIFIED-REAL |
| payload size/content | `admin.routes.js:219` `body("title")` 2–80, message rules on the same chain; `public.routes.js:93` caps `endpoint` at 1000 chars | validated |
| endpoint validation | `subscriptionRules` + `isString().isLength({min:10,max:1000})` | validated |
| unsubscribe on 404/410 | `env.push.maxFailures` (`PUSH_MAX_FAILURES`, default 5) deactivates a device after repeated failures (`env.js:171`) | PARTIAL — deactivation is failure-count based; **a `410 Gone` fast-path was not found in code** (searched `pushService.js` for `404|410|gone` — no matches) |
| missing VAPID keys non-fatal | `env.js:120-127` warns, `pushService.js:27` exposes `enabled`; sending returns 503 instead of crashing | VERIFIED-REAL |
| public key fetched at runtime | `frontend/lib/push.ts:8` "VAPID key is fetched from the API, never baked into the bundle"; route `GET /api/push/public-key` | VERIFIED-REAL |

**F-3-012 — NO EXPLICIT `410 Gone` HANDLING FOR PUSH SUBSCRIPTIONS (LOW, CONFIRMED).**
`grep` for `404|410|gone` in `Backend/services/pushService.js` → no matches; only the
`PUSH_MAX_FAILURES` counter exists. Dead subscriptions therefore linger until 5 failures.

---

## 3.6 Diagnostics exposure

* `/api/diag-session`: `app/api/diag-session/route.ts:45`
  `if ((process.env.DIAGNOSTICS ?? "").trim() !== "true") return notFound();` → **gated, returns
  404 unless `DIAGNOSTICS=true`.** VERIFIED-REAL (code) and by harness suite [23].
* Login page hint: `app/admin/login/page.tsx:21` reads the same flag.
* `AUTH_DEBUG_HEADERS`: `env.js:108` `readBool(..., false)`, default **off**; when on it emits only
  the enum `X-Auth-Reason: no-token|invalid-token|no-admin|inactive` (`auth.js:34-40`) — never a
  token, claim or email. A production warning is printed (`env.js:111`).
* What `DIAGNOSTICS=true` would reveal: session-origin booleans/enums and `nodeEnv`
  (`route.ts:82`), **not** cookie values or tokens (per the route's own comment at lines 15-20 and
  the field list at line 82). **F-3-013 (INFO).**
* `next.config.ts` adds `Cache-Control: no-store` to `/api/diag-session` so a diagnostics
  response can never be cached.

**F-3-014 — `DIAGNOSTICS` IS NOT IN THE DEPLOYMENT ENV-TABLE (MEDIUM, CONFIRMED).**
Evidence: `sed -n '278,286p' DEPLOYMENT.md` → only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL`.
`grep -n DIAGNOSTICS DEPLOYMENT.md` → **no matches** (it appears only in README.md:489 and
PROJECT_NOTES.md). An operator following DEPLOYMENT.md alone has no checklist item to unset it.
Harness suite [23] does assert the gated behaviour.

---

## 3.7 SECURITY FINDINGS TABLE

| ID | Sev | Conf | Title | Evidence | Exploit sketch | Recommended fix (NOT APPLIED) |
|---|---|---|---|---|---|---|
| F-3-015 | HIGH | CONFIRMED | `next@16.3.8` has a critical advisory set (unauth RCE in image optimisation w/ SVG, RCE in `use cache`, App Router DoS) | `npm audit --omit=dev` in `frontend/` → 1 critical, exit 1 | serve/optimise a crafted SVG through `/_next/image` | upgrade to `next@16.4.3` |
| F-3-016 | HIGH | CONFIRMED | `body-parser` 2.0.0–2.3.0 high advisory (DoS via trailing bytes) in Backend tree | `npm audit --omit=dev` in `Backend/` → 1 high, exit 1 | compressed body with trailing bytes exhausts the API | `npm audit fix` |
| F-3-010 | MEDIUM | CONFIRMED | Frontend sends no CSP/HSTS/XFO/Referrer-Policy and exposes `X-Powered-By` | header dump of `GET /` on :3001 | clickjacking, referrer leakage, no XSS brake | add `headers()` in `next.config.ts` |
| F-3-006 | MEDIUM | CONFIRMED | No Origin/Referer CSRF check on cookie-authenticated mutations | grep over middleware/controllers → none | cross-site form POST mutates admin data if `SameSite` is ever `None` | reject mutations whose `Origin` ∉ `CLIENT_ORIGIN` |
| F-3-007 | MEDIUM | CONFIRMED | SVG uploads allowed; original stored and served (mitigated by helmet CSP) | `storageService.js:13,108`; `server.js:54-60` | stored SVG opened directly on API origin executes script | remove `image/svg+xml` or re-encode to PNG |
| F-3-014 | MEDIUM | CONFIRMED | `DIAGNOSTICS` missing from DEPLOYMENT.md env table | `grep -n DIAGNOSTICS DEPLOYMENT.md` → none | diagnostics route left enabled in production | add the row and an unset step to §12 |
| F-3-004 | LOW | CONFIRMED | No account lockout, IP-keyed login limiter only | `rateLimiter.js:29-33` | distributed password guessing | add per-account backoff |
| F-3-005 | LOW | CONFIRMED | BFF hard-codes `SameSite=Lax`, ignoring `COOKIE_SAMESITE` | `lib/authBff.ts:124` | operator believes `strict` is active | read the flag or document the override |
| F-3-009 | LOW | CONFIRMED | Backend `error.message` shown raw in UI | `lib/api.ts:151,210` | future non-`ApiError` leaks internals | always prefer `messageForStatus` for non-`ApiError` |
| F-3-012 | LOW | CONFIRMED | No `410 Gone` fast-path for push subscriptions | `pushService.js` grep → none | dead endpoints retried 5× | deactivate on 404/410 immediately |
| F-3-001 | LOW | CONFIRMED | `.gitignore` trailing rules have CRLF terminators | `cat .gitignore` | a future `.env*` variant may not be ignored | normalise the file to LF |
| F-3-002 | INFO | CONFIRMED | `FORENSIC/_tmp/` and `frontend/tmp-tile.css` are not ignored | `.gitignore` contents; `ls frontend/tmp-tile.css` | temp files get committed | add ignores, delete the stray file |
| F-3-017 | INFO | CONFIRMED | `check:secrets` scans only 8 files (docs + `.env.example`), never source | script output "8 file(s) scanned"; `SCANNABLE` regex in `check-no-secrets.mjs:36` | a secret pasted into a `.js`/`.json` is never detected | extend `SCANNABLE` to source files |
| F-3-011 | INFO | CONFIRMED | `RATE_LIMIT_MAX` has no upper bound or production warning | `env.js` `readInt("RATE_LIMIT_MAX", 300)` | a test value disables limiting in prod | warn when `isProd && max > 5000` |
| F-3-008 | INFO | LIKELY | JSON-LD via `dangerouslySetInnerHTML` without `<` escaping | `app/layout.tsx:130` | only if a backend field is later added | `\u003c`-escape the JSON |
| F-3-003 | LOW | CONFIRMED | Only `/team` requires `super_admin`; all other admin writes need plain `admin` | `admin.routes.js:53,57` | a low-privileged admin can delete all content | add role gates to destructive routes if undesired |
| F-3-013 | INFO | CONFIRMED | `DIAGNOSTICS=true` reveals enums/nodeEnv only | `app/api/diag-session/route.ts:45,82` | information disclosure if left on | keep off; add to the post-deploy checklist |

No CRITICAL finding (no breach, no data loss, no broken login) was identified in this phase.
