# FORENSIC 10 — Consolidated Findings Register

One row per finding. Sorted by severity, then by area (SEC=security, COR=correctness/data-flow,
FE=frontend, BE=backend, DEP=deployment/ops, HIST=history/docs, TEST=test harness, INV=inventory).
Some findings appear in more than one part file; the canonical ID is the one used in the
"cross-ref" column.

Confidence: CONFIRMED = executed or directly proven by code; LIKELY = strong code evidence, not
executed; SUSPECTED = indirect.

**Severity counts (distinct findings): CRITICAL 0 · HIGH 7 · MEDIUM 21 · LOW 26 · INFO 15 = 69.**
The table holds 73 rows because four findings are repeated as cross-reference aliases
(`F-3-015 = F-2-011`, `F-3-016 = F-2-012`, `F-9-003 = F-5-001`, `F-2-010 = F-8-001`).

---

## CRITICAL

*None.* No breach, no data loss, no site-down condition, no broken login was found.

---

## HIGH

| ID | area | conf | title | file:line / evidence | cross-ref |
|---|---|---|---|---|---|
| F-2-011 | INV | CONFIRMED | `next@16.3.8` carries a **critical** advisory set (unauth RCE in image optimisation with SVG, RCE in `use cache`, App Router DoS) | `npm audit --omit=dev` in `frontend/` → 1 critical, exit 1 | = F-3-015 |
| F-2-012 | INV | CONFIRMED | `body-parser` 2.0.0–2.3.0 **high** advisory (DoS via trailing bytes) | `npm audit --omit=dev` in `Backend/` → 1 high, exit 1 | = F-3-016 |
| F-4-001 | COR | CONFIRMED | Six UNBACKED social-proof claims in the first viewport (`10k+ users`, `140+ products shipped`, `99.9% uptime`, `4.9/5`, `10k+ onboarded`, avatar initials `AK/MR/TS`) — the API returns 4 products | `Hero.tsx:34,35,36,113,135-137,118-124` | — |
| F-4-006 | COR | CONFIRMED | The harness **writes** `Showcase Fixture A` / `Showcase Fixture B` logos into whichever API it is pointed at, using a real admin login | `verify-three.mjs:113-137` | — |
| F-5-004 | FE | CONFIRMED | 2 of 14 services (`web-development`, `automation`) never open the VIP preview card — real regression, 2/2 runs | harness `S8n` output; `verify-three.mjs:4499-4514` | root cause SUSPECTED |
| F-8-002 | DEP | CONFIRMED | `DEPLOYMENT.md:698` claims `BACKEND_ORIGIN` is runtime config — the `/api` **rewrite is build-time only**; measured: runtime-only set → 404, build-time set → manifest rewrite | `next.config.ts:71`; `routes-manifest.json` before/after | — |
| F-9-004 | HIST | CONFIRMED | `README.md` §9 (lines 241-280, 246, 261, 263, 277-280, 294, 356-360, 493) documents `frontend/components/three/` as live while line 530 says it was deleted | `ls frontend/components/three` → absent | contradicts D3 |

---

## MEDIUM

| ID | area | conf | title | file:line / evidence | cross-ref |
|---|---|---|---|---|---|
| F-3-006 | SEC | CONFIRMED | No Origin/Referer CSRF check on cookie-authenticated mutations | grep over `middleware/ controllers/ routes/` → none | — |
| F-3-007 | SEC | CONFIRMED | SVG uploads allowed; original stored and served from `/api/uploads` (mitigated by helmet CSP) | `storageService.js:13,108`; `server.js:54-60` | — |
| F-3-010 | SEC | CONFIRMED | Frontend sends no CSP/HSTS/XFO/Referrer-Policy and exposes `X-Powered-By` | header dump of `GET /` on :3001 | — |
| F-3-014 | SEC | CONFIRMED | `DIAGNOSTICS` absent from `DEPLOYMENT.md §8` env table | `grep -n DIAGNOSTICS DEPLOYMENT.md` → none | = F-8-001 |
| F-4-004 | COR | CONFIRMED | `restingLine()` still returns single-word lines (`Strategy`, `Pipelines`, `A`) — the documented claim "never returns a single dangling word" is false | executed against the real function; `serviceCopy.ts:50-54,56,81-87` | — |
| F-4-008 | COR | CONFIRMED | `BAD_REQUEST`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `SERVICE_UNAVAILABLE` have no dedicated frontend message | `lib/api.ts:81-87` covers only 401/403/404/429/≥500 | — |
| F-5-001 | FE | CONFIRMED | `npm run build` always dirties the tracked `frontend/public/content-snapshot.json` | `snapshot-content.mjs:101,110`; commit `19b41e2` contains a 27/27 change to it | = F-9-003 |
| F-5-003 | FE | CONFIRMED | CHECK S8o forbids the idle scene prefetch that Task M deliberately built — self-contradictory check | `ServicesIndex.tsx:214-221`; `sceneRegistry.ts` header; harness output `fetched before any hover 6` | — |
| F-5-005 | FE | CONFIRMED | S8p (`cards=0`) and S8q (`cards=0` under reduced motion) fail 2/2 runs — reduced-motion users may lose the preview entirely | `verify-three.mjs:4635-4659` | — |
| F-5-008 | FE | CONFIRMED | Only one `aria-live` in the whole app (admin pagination); hero/VIP/services state changes are silent to SRs | `grep -rn "aria-live"` → 1 hit | — |
| F-5-012 | FE | CONFIRMED | 40 of 79 components are `"use client"`; the above-the-fold hero is client-side; initial JS 724 868 B | `grep -rl '"use client"'` → 40; harness suite [25] | — |
| F-6-003 | BE | CONFIRMED | `?detach=true` updates `Product` then deletes `Logo` with **no transaction** — a crash leaves a dangling `logoId` | `logoController.js:448-…`; `grep startSession` → none | — |
| F-6-006 | BE | CONFIRMED | Rate-limiter counters are in-process; behind Vercel each instance counts separately and cold starts reset them | `middleware/rateLimiter.js` (no custom `store`) | — |
| F-6-010 | BE | CONFIRMED | No migration story: a production DB seeded before Tasks K/L/M serves services without `shortDescription`/`category`/`accent` | `grep -rn migrate Backend` → none | causes F-4-004 in prod |
| F-7-003 | TEST | CONFIRMED | Harness is timing-sensitive by construction (fixed `sleep`s, no calibration) — 3 of 7 failures are load-dependent | `verify-three.mjs:4499-4514`; L57/L58/L59 results | — |
| F-8-001 | DEP | CONFIRMED | `BACKEND_ORIGIN` and `DIAGNOSTICS` missing from `DEPLOYMENT.md §8` frontend table | `sed -n '278,286p' DEPLOYMENT.md` | = F-3-014, = F-2-010 |
| F-8-004 | DEP | CONFIRMED | `BACKEND_ORIGIN` ending in `/api` silently produces `/api/api/:path*` → proxy 404s; the BFF normalises but the rewrite does not | `next.config.ts:21,73`; `authBff.ts:53` | — |
| F-8-005 | DEP | CONFIRMED | No instruction to clear the build cache when `NEXT_PUBLIC_*`/`BACKEND_ORIGIN` change (only for the `three` removal) | `grep -n "cache off" DEPLOYMENT.md` → `:694` only | — |
| F-9-001 | HIST | CONFIRMED | Commit messages are non-descriptive ("Changes", "UI Updated", "Some Changes") for multi-thousand-line, security-relevant commits; 2 commits are empty | `git log --oneline` + `--numstat` table in 09 §9.1 | — |
| F-2-010 | INV | CONFIRMED | Env names read but absent from the DEPLOYMENT env table | FORENSIC/02 §2.6 | = F-8-001 |
| F-3-015 | SEC | CONFIRMED | (alias) `next` critical advisory | — | = F-2-011 |
| F-3-016 | SEC | CONFIRMED | (alias) `body-parser` high advisory | — | = F-2-012 |
| F-9-003 | HIST | CONFIRMED | A generated artifact (`content-snapshot.json`) was swept into a feature commit | `git show --numstat 19b41e2` | = F-5-001 |
| F-5-002b | FE | CONFIRMED | Build artifacts in `frontend/.next/dev` still reference the deleted `DisciplineAtlas.tsx` (~20 hits), producing false positives for any residue search | `grep -r DisciplineAtlas frontend/.next/dev` | — |
| F-4-005 | COR | CONFIRMED | `seed:prod` defaults `SEED_SAMPLE_CONTENT` to OFF → 0 products in production after a fresh seed | `seed-prod.js` header + guard | — |

---

## LOW

| ID | area | conf | title | file:line / evidence |
|---|---|---|---|---|
| F-2-001 | INV | CONFIRMED | Ten tracked PNGs exceed 1 MB (largest 3 939 107 B) | `git ls-files \| xargs stat -c%s` |
| F-2-002 | INV | CONFIRMED | Three groups of byte-identical multi-MB assets (~16 MB duplicated) | sha256 table in 02 §2.1 |
| F-2-003 | INV | CONFIRMED | Repo-wide CRLF/LF mixture (e.g. `globals.css` 5 046 CRLF lines, `PROJECT_NOTES.md` all 3 232) | `grep -c $'\r'` |
| F-2-005 | INV | CONFIRMED | Dead modules: `hooks/useTilt.ts`, `components/motion/Marquee.tsx`, `components/icons/index.tsx` | import-graph scan → 0 importers |
| F-2-009 | INV | CONFIRMED | `verify-three.mjs` (the main harness), `capture-products.mjs`, `capture-themes.mjs`, `tmp-hero-m.mjs` have no npm script | `frontend/package.json` scripts |
| F-3-001 | SEC | CONFIRMED | `.gitignore` trailing rules (`.vercel`, `.env*`) carry CR terminators | `od -c .gitignore` → `. e n v * \r \n` |
| F-3-003 | SEC | CONFIRMED | Only `/team` is role-gated; all other admin writes need plain `admin` | `admin.routes.js:53,57` |
| F-3-004 | SEC | CONFIRMED | No account lockout — IP-keyed login limiter only (10 / 15 min) | `rateLimiter.js:29-33` |
| F-3-005 | SEC | CONFIRMED | BFF hard-codes `SameSite=Lax`, ignoring `COOKIE_SAMESITE` | `authBff.ts:124` |
| F-3-009 | SEC | CONFIRMED | Backend `error.message` passed straight to UI text | `lib/api.ts:151,210` |
| F-3-012 | SEC | CONFIRMED | No `410 Gone` fast-path for push subscriptions | `grep 404\|410\|gone pushService.js` → none |
| F-4-002 | COR | CONFIRMED | Cache v1→v2 has no migration; a v1 entry is deleted, so the offline fallback is briefly lost after deploy | `publicContent.ts:146,148` |
| F-4-003 | COR | CONFIRMED | The build snapshot never expires (`generatedAt` written, never read) | `snapshot-content.mjs:101`; `publicContent.ts` |
| F-4-007 | COR | CONFIRMED | JSON body limit 15 MB vs image limit 8 MB are inconsistent | `server.js:46`; `storageService.js:68` |
| F-5-007 | FE | CONFIRMED | Seven admin components render raw `error.message`; `TemplatesPanel.tsx:215` passes `error` not `error.message` | grep results in 05b §5.8 |
| F-5-009 | FE | CONFIRMED | 30 infinite animations vs 14 reduce blocks — covered by one global rule at `globals.css:3599` | counts + the global rule |
| F-5-010 | FE | CONFIRMED | `ServicesIndex.tsx:206` runs a `setInterval` (in-view gated, cleared on cleanup) | code |
| F-5-011 | FE | CONFIRMED | OG image is a 2 076 908 B logo PNG, not a 1200×630 card | `layout.tsx:46,54`; file size |
| F-5-013 | FE | CONFIRMED | Two hard-coded hex colours outside `globals.css` tokens | `Hero.tsx:122,123` |
| F-5-014 | FE | CONFIRMED | `--scene-1..8` declared in `:root`, not scoped to scenes (usage IS confined) | `globals.css:196-203` |
| F-6-001 | BE | CONFIRMED | No `unhandledRejection` / `uncaughtException` handler | `grep server.js` → none |
| F-6-004 | BE | CONFIRMED | Public collection endpoints are unbounded (no `.limit()`) | `logoController.js:175`, `productController.js:96`, `serviceController.js:7` |
| F-6-005 | BE | CONFIRMED | `Product.logoId` queried on delete but not indexed; `Visitor` dedupe query unindexed | `models/Product.js`; `logoController.js:449` |
| F-6-008 | BE | CONFIRMED | No assertion on `hasAlpha` / `aspectRatio` correctness anywhere | harness + smoke greps |
| F-7-002 | TEST | CONFIRMED | S8p's heap assertion is vacuous when `cards=0` (reports PASS for the wrong reason) | `verify-three.mjs:4614-4630` |
| F-7-004 | TEST | CONFIRMED | Hard-coded Chrome DevTools port 9333 with no fallback | `verify-three.mjs:72` |

---

## INFO

| ID | area | conf | title |
|---|---|---|---|
| F-2-006 | INV | CONFIRMED | Stray untracked files: `frontend/tmp-tile.css`, `frontend/tsconfig.tsbuildinfo`, `.baseline-wt/` |
| F-3-002 | SEC | CONFIRMED | `FORENSIC/_tmp/` and `frontend/tmp-tile.css` are not ignored |
| F-3-008 | SEC | LIKELY | JSON-LD injected via `dangerouslySetInnerHTML` without `<` escaping (static values only today) |
| F-3-011 | SEC | CONFIRMED | `RATE_LIMIT_MAX` has no upper bound and no production warning |
| F-3-013 | SEC | CONFIRMED | `DIAGNOSTICS=true` reveals enums + `nodeEnv` only — no cookie/token values |
| F-3-017 | SEC | CONFIRMED | `check:secrets` scans only **8** files; it never looks at `.js`/`.ts`/`.json` source |
| F-4-006b | COR | CONFIRMED | Dashboard buckets by UTC ("Since 00:00 UTC") — locale assumption |
| F-5-002 | FE | CONFIRMED | Stale `.next/dev` build artifacts (alias of F-5-002b) |
| F-6-009 | BE | CONFIRMED | morgan logs full URLs including query strings (no endpoint puts a secret there today) |
| F-7-001 | TEST | CONFIRMED | **No assertion-weakening violation found** in the harness history |
| F-9-002 | HIST | CONFIRMED | **No doc ever lost >30 % of its lines** — max single deletion 15 lines; `PROJECT_NOTES.md` lost 12 lines across 17 commits |
| F-9-005 | HIST | CONFIRMED | `prompt.md` (an agent instruction file) is committed at the repo root |
| F-9-006 | HIST | CONFIRMED | `PROJECT_NOTES.md §50` omits `S8r` from the retired-check list; `verify-three.mjs:19,26` carry stale header numbers |
| F-9-007 | HIST | CONFIRMED | `PROJECT_NOTES.md:2662,2666` still say Task L hero phases and card-04 were "not done" |
| F-5-015 | FE | CONFIRMED | 1024/768 px overflow only exercised indirectly (1920/1440/1366/390 measured) |

---

## Findings explicitly NOT reproduced (task §0 allegations)

| allegation | verdict | evidence |
|---|---|---|
| (a) work claimed that does not exist | **NOT REPRODUCED** — 45 claims checked, 0 MISSING, 0 FAKE/INVENTED | FORENSIC/01 |
| (b) Task L phases 1–3 never started | **WAS TRUE, NOW REMEDIATED** | `PROJECT_NOTES.md:2662` vs the current tree; commit `91a12fb` |
| (c) docs overwritten by partial writes | **NOT REPRODUCED in git** — max deletion 15 lines | FORENSIC/09 §9.2 |
| (d) destroyed `verify-bff.mjs` + invented bearer feature | **NOT REPRODUCED** — parses, identical to HEAD, 1 commit, 21/21; zero residue in tree **and** in all 25 commits (`git log -S`) | FORENSIC/00 Phase 0.3/0.4 |
| (e) orphaned CHECK 83 | **NOT REPRODUCED** — no `CHECK 83` in the harness; retired by §41 | FORENSIC/07 §7.2 |
| (f) Task M state unknown | **NOW KNOWN** — 301/308 twice, 7 failures classified | FORENSIC/07 §7.2 |
