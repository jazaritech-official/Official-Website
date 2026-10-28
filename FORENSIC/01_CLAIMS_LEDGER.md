# FORENSIC 01 — Claims Ledger (Phase 1)

Every deliverable claimed in Tasks H–M, checked against the tree at
HEAD `19b41e28bb51187a4ab916e28cb5f6569a77365d`.

Status labels used exactly as defined: VERIFIED-REAL / PRESENT-UNTESTED / PARTIAL / MISSING /
FAKE-INVENTED / BROKEN / DEAD / NOT VERIFIED.
Evidence is `file:line` or a quoted command with its real output.

Harness line references are to the **first full run** of `verify-three.mjs` (log: PASS 278,
FAIL 7, summary `301/308`). The second full run produced the identical `301/308` total.

---

## TASK H — service states, favicon, content resilience, admin IA

| # | Claim | Where it should be | Evidence | Status | Notes |
|---|---|---|---|---|---|
| H1 | Distinct EMPTY vs ERROR service states | `components/services/ServicesIndex.tsx` | `ServicesIndex.tsx:391` `EmptyState` (error + Retry), `:404` second `EmptyState` | VERIFIED-REAL | Harness CHECK 69 → `state:"empty"`; CHECK 67 → `state:"error", hasRetry:true, blank:false`. Two different states, both proven reachable |
| H2 | Real favicon via Next file conventions, no default Next favicon | `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` | `git ls-files frontend/app` lists all three; sizes 5306 / 1663 / 23666 B | VERIFIED-REAL | CHECK 58 `type:1, frames:3, bytes:5306`; CHECK 59 "favicon is the Jazari mark, NOT the stock Next.js triangle"; CHECK 57 all four declared URLs return 200 with a non-HTML content type |
| H3 | `publicContent.ts` resilience layer: live API → validated localStorage → build snapshot → designed empty/error | `frontend/lib/publicContent.ts` | `:7-8` documents the 4 layers; `:146` `parsed.v !== CACHE_VERSION` rejects; `:263-266` snapshot layer; `:31` `CACHE_VERSION = 2` | VERIFIED-REAL | Proven reachable end-to-end by CHECK 65 (cache), 66 (snapshot), 67 (error), 68 (corrupted cache discarded), 69 (empty) |
| H4 | Snapshot script + `public/content-snapshot.json` | `scripts/snapshot-content.mjs` | file exists (11667 B, `generatedAt 2026-10-17T14:30:53.818Z`); `prebuild` wired in `package.json` | VERIFIED-REAL | Preserves the previous snapshot when the API is unreachable (`snapshot-content.mjs:75-80`) |
| H5 | `check:secrets` | `scripts/check-no-secrets.mjs` | `npm run check:secrets` → `clean — 8 file(s) scanned`, exit 0 | VERIFIED-REAL | **Coverage is only 8 files** — see F-007 in FORENSIC/03 |
| H6 | Admin sidebar groups Content / Leads / Settings | `components/admin/AdminShell.tsx` | `AdminShell.tsx:51,60,73` → `Content`, `Leads`, `Settings` | PARTIAL | CHECK 71 reports **four** groups: `["content","leads","engagement","settings"]`. An `Engagement` group was added later; the claim as written is out of date, the feature is stronger than claimed |

**Task H verdict: 6/6 present, 1 claim text stale (H6). No missing deliverable.**

---

## TASK I — cookie, login verify, SEO, hub wiring, scrim, scroll-margin

| # | Claim | Where | Evidence | Status | Notes |
|---|---|---|---|---|---|
| I1 | `Backend/utils/authCookie.js` | file | exists, 66 lines; `authCookieOptions()` = httpOnly/secure/sameSite/path, no Domain; `clearAuthCookie` uses `maxAge:0` + `expires: new Date(1)` | VERIFIED-REAL | Contract proven by `verify:bff` 21/21 |
| I2 | Login calls `/me` before redirect | `app/admin/login/LoginForm.tsx` | `:77` `.me()`, `:111` `await api.auth.me()`, `:123` a diagnostic string for "Login returned 200 but /auth/me returned 401" | VERIFIED-REAL | Covered by harness suite [23] |
| I3 | Google verification meta tag, value `9sxNHd4zcWdftckBBUCKxc3hiD-qxOpxn03uZXvHChM` | `app/layout.tsx` | `layout.tsx:33` `google: "9sxNHd4zcWdftckBBUCKxc3hiD-qxOpxn03uZXvHChM"` — **exact string match** | VERIFIED-REAL | CHECK 90 → `count=1`, exact token, in server-rendered HTML |
| I4 | Organization JSON-LD with NO invented `sameAs` | `app/layout.tsx:100-130` | comment at `:101-104` states sameAs deliberately omitted; harness CHECK 93 → `sameAs:null` | VERIFIED-REAL | JSON-LD parses (harness parsed it) |
| I5 | Hub living connectors / packets | `components/services/ServicesHub.tsx`, `globals.css` | CHECK 96 `packets:10, flows:5, bases:5`; CHECK 97 brand-derived stops + Growth-Green packet; CHECK 98 packets travel the real path; CHECK 101 reduced-motion → 0 packets | VERIFIED-REAL | Run in this audit, both full runs |
| I6 | `.jt-nav__scrim` | `globals.css` | `globals.css:484` `.jt-nav__scrim` | VERIFIED-REAL | present |
| I7 | `scroll-margin-top: 6rem` | `globals.css` | `globals.css:2307` and `:3463` both `6rem` (`:3926` is `5.5rem`) | VERIFIED-REAL | deep-link landing below the navbar |

**Task I verdict: 7/7 real. Only the hero-shatter part of Task I was later superseded (see K6/L).**

---

## TASK J — Web Push

| # | Claim | Where | Evidence | Status | Notes |
|---|---|---|---|---|---|
| J1 | `pushService` | `Backend/services/pushService.js` | exists; `:23` logs VAPID rejection, `:27` `pushEnabled` | VERIFIED-REAL | |
| J2 | `PushSubscription` + `Notification` models | `Backend/models/` | both exist; `PushSubscription.endpoint` required + unique, `keys.p256dh`/`keys.auth` required | VERIFIED-REAL | |
| J3 | `public/sw.js` | `frontend/public/sw.js` | exists, 3328 B | VERIFIED-REAL | |
| J4 | Opt-in card at 10 s | `components/notifications/NotificationPrompt.tsx` | `:11` `const PROMPT_DELAY_MS = 10_000;` | VERIFIED-REAL | Harness suite [22]; CHECK 117 → VAPID key length 87 |
| J5 | Admin notification composer with service reference | `components/admin/NotificationsManager.tsx` | exists (472 lines); `/admin/notifications` route exists | VERIFIED-REAL | |
| J6 | VAPID public key fetched at runtime, not baked | `frontend/lib/push.ts:8` | "fetched from the API, never baked into the bundle"; route `GET /api/push/public-key` | VERIFIED-REAL | CHECK 117 measured `keyLength:87, url:.../api/push/public-key` |
| J7 | Missing keys non-fatal | `Backend/config/env.js:120-127` | warns and sets `pushEnabled=false`; `pushService` degrades instead of crashing | VERIFIED-REAL | |

**Task J verdict: 7/7 real.**

---

## TASK K — BFF, diagnostics, VAPID subject, rewrites, removed features

| # | Claim | Where | Evidence | Status | Notes |
|---|---|---|---|---|---|
| K1 | BFF handlers `app/api/auth/{login,logout,password,me}` re-emit a host-only, SameSite=Lax, HttpOnly, Secure cookie | `frontend/app/api/auth/*/route.ts` + `lib/authBff.ts` | all four routes exist; `authBff.ts:124` builds `Path=/; HttpOnly; SameSite=Lax` (+`Secure` in prod), drops upstream `Domain`/`SameSite=None`/`Partitioned` | VERIFIED-REAL | `npm run verify:bff` → **21/21 passed** in this audit |
| K2 | `diag-session` gated by `DIAGNOSTICS=true` | `app/api/diag-session/route.ts:45` | `if ((process.env.DIAGNOSTICS ?? "").trim() !== "true") return notFound();` | VERIFIED-REAL | |
| K3 | `AUTH_DEBUG_HEADERS` optional | `Backend/config/env.js:108` | `readBool("AUTH_DEBUG_HEADERS", false)` + production warning at `:111` | VERIFIED-REAL | emits an enum only (`auth.js:34-40`) |
| K4 | `VAPID_SUBJECT` default `mailto:jazaritechofficial@gmail.com` | `Backend/config/env.js:167` | `readOptional("VAPID_SUBJECT", "mailto:jazaritechofficial@gmail.com")` — **exact match** | VERIFIED-REAL | |
| K5 | `rewrites()` build-time | `frontend/next.config.ts:71` | `rewrites()` present; **proved build-time**: the committed build's `routes-manifest.json` had `afterFiles: []`, and starting `next start` with `BACKEND_ORIGIN` set produced **404** on `/api/services`; after rebuilding with `BACKEND_ORIGIN` set the manifest contains the rewrite | VERIFIED-REAL (and it is a deploy trap) | See F-8-00x in FORENSIC/08 |
| K6 | Voronoi hero and Discipline Atlas are GONE and nothing references them | source tree | `grep -ri voronoi\|DisciplineAtlas frontend --include=*.ts --include=*.tsx --include=*.css` excluding `.next/` → only 3 hits, all in **comments** (`globals.css:1052`, `Hero.tsx:14`, `HeroMark.tsx:35`). `components/three/` deleted (commit `91a12fb` removed 15 files) | VERIFIED-REAL | Stale references survive only inside `frontend/.next/dev/` build artifacts, not in source |

**Task K verdict: 6/6 real.**

---

## TASK L — logo references, presets, cache v2, hero SVG v2, services index, form

| # | Claim | Where | Evidence | Status | Notes |
|---|---|---|---|---|---|
| L1 | `Product.logoId` reference + public logo object `{id,url,displayName,alt,tone,hasAlpha,aspectRatio}` | `Backend/models/Product.js:36` (`ref: "Logo"`), `frontend/lib/productLogo.ts:6-7` | both present; `productController` projects `logo` | VERIFIED-REAL | smoke checks 690-731 pass |
| L2 | 409 on deleting a referenced logo | `Backend/controllers/logoController.js:439-451` | `if (referencedBy.length > 0 && !detach) …` | VERIFIED-REAL | smoke: `deleting a referenced logo → 409` + `409 lists the referencing products` both pass |
| L3 | `?detach=true` | `logoController.js:448` | `const detach = req.query.detach === "true" \|\| …` | VERIFIED-REAL | smoke: `detach + delete → 200`, `detached product falls back to logo === null` |
| L4 | `/admin/product-presets` route | `app/admin/(portal)/product-presets/page.tsx` | exists | VERIFIED-REAL | CHECK 76c header/title/active/panel all present; CHECK 76b sidebar link points at it |
| L5 | Cache schema v2 | `frontend/lib/publicContent.ts:31` | `const CACHE_VERSION = 2`, used in the key and in the envelope check `:146` | VERIFIED-REAL | CHECK 64 → keys `jazari:public-content:v2:*`, `privateKeys: []`. **v1 migration: a v1 entry fails `parsed.v !== 2` and is removed (`:148`), then refilled from the API/snapshot — no explicit migration, which is the correct behaviour** |
| L6 | `ApiError.conflict` forwards `details` | `Backend/utils/errors.js:37` | `static conflict(message, details)` → `new ApiError(409, "CONFLICT", message, details)` | VERIFIED-REAL | smoke asserts `error.details.products` contains the referencing product |
| L7 | Hero rebuilt as inline SVG, `data-hero="svg-v2"`, 5 tooltips each side, leader lines | `components/sections/HeroMark.tsx` | `:410` `data-hero="svg-v2"`, `:411` `data-hero-state`, `:413` `data-fragments`; `heroLayout.ts:27` `rows: 5`, `:28` left/right columns, `:56-67` 5 anchors left + 5 right | VERIFIED-REAL | present in SSR HTML (measured `curl` on :3001 → `data-hero="svg-v2"`) |
| L8 | Static services index with all services visible | `components/services/ServicesIndex.tsx` | 558 lines | VERIFIED-REAL | CHECK S1 `entries===14`, S5 viewport fit, S3 no pointer cursor |
| L9 | Start-Your-Project form upgrade | `components/forms/StartProjectForm.tsx` | 944 lines; 4 steps incl. Review (`:45`, `:57`), progress rail (`:516-528` `role="progressbar"`), error summary with focus effect (`:357-360`), `role="alert"` (`:549,682,816,886`), sessionStorage draft never localStorage (`:49,277-306`), honeypot never persisted (`:295`), Edit links per section (`:850-853`) | VERIFIED-REAL | exercised by harness suite [10] (all checks passed) |
| L10 | Hub card-04 spacing / double socket circle audit | `globals.css:2081` ("Task L — card-04 bottom-spacing fix"), `ServicesHub.tsx:285-290` (comment: second SVG ring removed, one socket remains) | both fixes present | VERIFIED-REAL | harness hub suites [13]/[19] passed in both runs |
| L11 | CHECK 83 retired? | `frontend/scripts/verify-three.mjs` | `grep -n "CHECK 83"` → `NO MATCH for 'CHECK 83'`. `grep floating` → no match | VERIFIED-REAL (retired) | Ledger `PROJECT_NOTES.md §41` retires "CHECK 82–90 + the `data-explode` state machine" because the WebGL shatter was deleted. **No orphaned CHECK 83 remains** — the reported defect (e) is NOT reproducible today |

**Task L verdict: 11/11 real.**

---

## TASK M — hero delivery choreography, Showcase Tiles, VIP preview, scenes

Harness suite numbers below are from the two full runs (both `301/308`).

| # | Claim | Evidence | Status | % of spec |
|---|---|---|---|---|
| M1 | Hero states `assembled/splitting/flying/docked/returning/merging` via `data-hero-state` | `HeroMark.tsx:67` type union lists exactly those six; `:411` `data-hero-state={state}` | VERIFIED-REAL | 100 |
| M2 | `data-fragments` exactly 10 | `HeroMark.tsx:413` `data-fragments={reduced ? 0 : HERO_FRAGMENTS.length}`; `heroFragments.ts:311` `HERO_FRAGMENTS`; CHECK L60b "ten fragments exist … own gradient fill + own clipPath, no rect/circle" | VERIFIED-REAL | 100 |
| M3 | clipPath fragments animated with WAAPI keyframes **along leader-line paths** | CHECK L60c (min/mean wire distance reported per fragment, "NOT straight to the socket … max offset 116px"); CHECK L60h `keyframes per fragment: 15,15,15,15,13,14,15,15,14,15` (≥10 real keyframes); `heroFragments.ts:190` `FLIGHT_SAMPLES = 16` | VERIFIED-REAL | 100 |
| M4 | Interrupt-safe reversal | CHECK L60f `reversedFrom:returning, state:assembled, stray:0, sameNodes:true` | VERIFIED-REAL | 100 |
| M5 | Ghost slots (tooltips never hidden) | `PROJECT_NOTES.md §50` records the change; CHECK L71/L72 setup now waits for ghost emphasis `opacity < 0.5` instead of hidden tooltips; both IoU checks passed | VERIFIED-REAL | 100 |
| M6 | Improved shared short-line fallback | `frontend/lib/serviceCopy.ts` `restingLine()` — **executed** (see FORENSIC/04 §4.3) | PARTIAL | ~70 — the guard against a single dangling word does not cover short/one-word inputs |
| M7 | Opaque Showcase Tile: spotlight, conic border sweep, sheen, arrow slide, one LIVE node, Visit, logoId, tone-aware staging | CHECK 76e `alpha:"rgb(255, 255, 255)"`, `nodes_green:1`, `tone:"none"`, `spotlight:true`, `legacy:0`, `id:"PRD-001"`; CHECK 76e2 `background-color rgb(255, 255, 255)` (opaque); CHECK 76e3 `target/rel`; CSS `tile__sheen` (`ProductCards.tsx:156`), `tile__spotlight` (`:166`), `ProductCards.tsx:211-212` `target="_blank" rel="noopener noreferrer"` | VERIFIED-REAL | 100 |
| M8 | Services "hover me" cues | CHECK S8d `cue opacity=1`; `ServicesIndex.tsx:513-514` `service-entry__cue` "▶ Preview" | VERIFIED-REAL | 100 |
| M9 | ONE shared floating VIP card + mobile bottom sheet | `ServicePreviewCard.tsx` imported exactly once (`ServicesIndex.tsx:12,534`); `:144` `vip${sheet ? " vip--sheet" : ""}`; CHECK S8h "switching rows morphs the SAME card node" | VERIFIED-REAL | 100 |
| M10 | Lazy-loaded scene per service | `sceneRegistry.ts` — 14 `() => import(...)` loaders + `loadGeneric()`; CHECK S8o asserts own chunks | PARTIAL | **CHECK S8o FAILS in both runs** |
| M11 | 14 storyboards | `sceneRegistry.ts:19-36` lists exactly 14 slugs, matching the 14 seeded services (verified live: `GET /api/services` returned the same 14 slugs) | PARTIAL | **CHECK S8n FAILS: 2 of 14 rows (`web-development`, `automation`) never open a card** |
| M12 | Scene registry keyed by slug + `GenericScene` fallback | `sceneRegistry.ts:44-70` `loadScene()` → unknown slug → `loadGeneric()`, and loader failure also falls back | VERIFIED-REAL | 100 |
| M13 | `--scene-1..8` tokens scoped to scenes only | defined at `globals.css:196-203` in the **`:root`** block; **used** only by `components/services/scenes/SceneFrame.tsx` | PARTIAL | definition is global, usage is confined. `--scene-3` (#9b7ce8 violet) and `--scene-4` (#e07bb0 magenta-pink) also sit outside the stated "no orange/pink/purple" brand rule |
| M14 | Old "no hover / no pointer" checks retired/replaced explicitly | `verify-three.mjs:4251` "CHECK S8 is RETIRED (Task M)"; replaced by S8a–S8r; `PROJECT_NOTES.md §50` lists the replacements | VERIFIED-REAL | 100 (but the harness's own header comment at `:19` still says "no hover affordance" — stale doc) |

### Task M — measured completion

| area | % genuinely delivered | biggest gap |
|---|---|---|
| Hero delivery choreography (M1–M5) | **100 %** | none found; all five checks pass in both runs |
| Product Showcase Tiles (M7) | **100 %** | none found |
| Services hover/VIP (M8, M9, M12) | **100 %** | none found |
| Scene engine (M10, M11) | **~70 %** | CHECK S8n and S8o fail in both full runs |
| Copy fallback (M6) | **~70 %** | single-word outputs still possible (proved by executing the function) |
| Token scoping (M13) | **~80 %** | `--scene-1..8` declared in `:root` |
| Retirements (M14) | **100 %** | stale harness header comment only |

**Task M verdict: ≈ 88 % genuinely delivered.** Nothing is invented or fake; the gaps are two
failing scene checks, one over-claimed copy helper, and one token-scoping nit.

---

## Cross-cutting: the six alleged historical failures

| alleged failure (task §0) | current evidence | verdict |
|---|---|---|
| (a) work claimed that does not exist | 45 claims checked above; **0 MISSING, 0 FAKE/INVENTED** | **NOT REPRODUCED** at this HEAD |
| (b) Task L phases 1–3 never started | `PROJECT_NOTES.md §38.6` line 2662 literally says "Phases 1–3 (hero) were not attempted"; commit `91a12fb` (Task L) deleted `components/three/*` (15 files) and added `HeroMark.tsx`, `ServicesIndex.tsx`, the rebuilt form | **WAS TRUE AT THE TIME, NOW REMEDIATED** |
| (c) docs overwritten by partial writes | `git log --numstat` for every doc: PROJECT_NOTES 17 commits, **total 12 deletions ever**; DEPLOYMENT 10 commits, **total 6 deletions**; README max 15 deletions in one commit. Current line counts equal `sum(adds) - sum(dels)` exactly (3244-12=3232, 747-6=741) | **NOT REPRODUCED in git history** |
| (d) `verify-bff.mjs` destroyed + invented bearer feature | file parses (`node --check` OK), 240 lines, `git diff HEAD -- frontend/scripts/verify-bff.mjs` empty, touched by exactly **1** commit (`e62174e`), runs **21/21**. Residue scan for `echo-bearer / service-bearer / servicesSlug / SessionMatcher / Host-Admin` over the whole tree **and** `git log -S` over all 25 commits → **no matches in any commit** | **NOT REPRODUCED**; the invented feature left zero residue in this repository |
| (e) orphaned CHECK 83 failure | `grep -n "CHECK 83" verify-three.mjs` → no match; `PROJECT_NOTES.md §41` retires CHECK 82–90 explicitly | **NOT REPRODUCED** |
| (f) Task M state unknown | measured: two independent full runs, both `301/308`, 7 failures with the same 5 stable members | **NOW KNOWN** — see 07_TESTS_HARNESS |

The only allegation that survives this audit in any form is **(b)**, and it is already fixed in
the tree; and the residual truth in **(c)** is that *the build mutates a tracked file* —
`npm run build` → `prebuild` → `snapshot-content.mjs` rewrites
`frontend/public/content-snapshot.json` on every build (this audit deliberately ran
`npx next build` to avoid dirtying the tree; see F-5-001 in FORENSIC/05a).
