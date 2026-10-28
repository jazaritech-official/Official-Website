# FORENSIC 07 — Test & Verification Harness (Phase 7)

Every number in this file is from a command executed during this audit. Commands are quoted so
they can be re-run.

---

## 7.1 The full run, in the required order

| # | gate | exact command | REAL result | exit | baseline claimed |
|---|---|---|---|---|---|
| 1 | secrets | `cd frontend && npm run check:secrets` | `clean — 8 file(s) scanned, no secret-looking values` | 0 | clean |
| 2 | frontend lint | `cd frontend && npm run lint` | **0 problems** (no output) | 0 | 0 |
| 3 | frontend typecheck | `cd frontend && npx tsc --noEmit` | **0 errors** | 0 | 0 |
| 4 | verify-bff | `cd frontend && npm run verify:bff` | **21 / 21 checks passed** | 0 | 21 |
| 5 | audit:contrast | `cd frontend && npm run audit:contrast` | **65 / 65 token pairs meet WCAG AA** | 0 | 51 |
| 6 | Backend smoke | `cd Backend && NODE_ENV=test RATE_LIMIT_MAX=5000 npm run smoke` | **234 passed, 0 failed** | 0 | 222 |
| 7 | verify-three (run 1) | `cd frontend && API_BASE=http://localhost:5001/api node scripts/verify-three.mjs http://localhost:3001` | **301 / 308 checks passed** (log counters: 278 ✓, 7 ✗, 408 lines) | 1 | ~276 |
| 8 | verify-three (run 2, isolated) | identical command | **301 / 308 checks passed** (278 ✓, 7 ✗, 408 lines) | 1 | — |
| 9 | NO_WEBGL=1 | `cd frontend && NO_WEBGL=1 API_BASE=http://localhost:5001/api node scripts/verify-three.mjs http://localhost:3001` | **NO-WEBGL verification (hero must be identical): 10 / 10 checks passed** | 0 | "9 checks" intent |
| 10 | Backend lint | `cd Backend && npm run lint` | 0 problems | 0 | 0 |
| 11 | Backend build | `cd Backend && npm run build` | `Syntax check passed: 54 files verified.` | 0 | 0 |
| 12 | frontend build | `cd frontend && BACKEND_ORIGIN=… npx next build` | compiled, 18/18 static pages, 22 routes | 0 | OK |

Notes on honesty:

* Run 1 and run 2 totals are **identical (301/308)**; only the identity of one failing perf check
  differs (L57 in run 1, L58 in run 2). Run 1 overlapped the Backend smoke test; run 2 did not.
  The overlap is **not** the cause of the 5 stable S8 failures, which reproduce in both.
* The number `276` in `grep -c ✓` is the count of individual ✓ lines; the harness's own summary
  counts 301 passing checks (several checks are aggregated into one ✓ line). Both are quoted so
  neither is mistaken for the other.
* `verify-three.mjs` is **not** wired to any npm script — it must be run directly
  (see F-2-009).

### Prerequisites that were actually followed

* Frontend: production build present and **freshly rebuilt** in this audit (the original
  `frontend/.next` was dated 2026-10-17; a new build was produced 2026-10-26 before the harness).
* Backend: `npm run dev:mem -- --seed` — an ephemeral **in-memory** MongoDB, `NODE_ENV=development`,
  `RATE_LIMIT_MAX=5000`, `PORT=5001` (port 5000 was occupied by an unrelated project).
* Signature confirmed before the run (4 sample products, 14 services with `shortDescription`).
* Port 5000 and port 3000 belong to **a different project** (`D:\Jazari Tech Official\IrhassInn\`,
  serving "Anzara Studio | Premium Online Shopping in Pakistan"). They were **not** touched; this
  audit used 5001 + 3001 instead. This is a deviation from the documented commands and is stated
  here rather than hidden.
* `RATE_LIMIT_MAX=5000` was raised as the harness instructions require; measured headers confirmed
  `RateLimit-Limit: 5000`.
* Stale-build gotcha avoided: the previous `next start` was killed before `next build`.

---

## 7.2 Every failing check, classified

Seven distinct checks fail. Six of them fail in **both** full runs.

| ID | check | what it asserts | observed | verdict |
|---|---|---|---|---|
| L57 | first transform change within 50 ms of the pointer event | reaction latency | run 1: **63 ms** after pointerover (`CDP dispatch 192 ms`); run 2: **pass** | **ENVIRONMENT SENSITIVE** — fails 1/2. The reported CDP dispatch overhead (192 ms) is itself machine load |
| L58 | zero long tasks (> 50 ms) during the explosion | jank | run 1: pass; run 2: **FAIL, one 66 ms task** | **ENVIRONMENT SENSITIVE** — fails 1/2 |
| L59 | dropped frames ≤ 3 in a 1 s window | jank | run 1: **6/31** (idle baseline 4/40); run 2: **7/24** (idle baseline 1/59) | **REAL REGRESSION** — fails 2/2, and the *idle* baseline itself dropped 4 frames in run 1, so the machine cannot meet ≤3. Either the budget is wrong for this hardware or the animation is genuinely janky |
| S8n | all 14 services open a card with their OWN scene | scene engine coverage | `web-development: cards=0 … automation: cards=0` (2 of 14 rows never open, after 3 attempts each) | **REAL REGRESSION** — fails 2/2. Root cause SUSPECTED, not isolated |
| S8o | every scene ships its own lazy chunk, **none fetched on page load**, hovered chunk fetched on demand | lazy loading | `15 scene chunks …, fetched before any hover 6, after one hover 6` | **STALE / SELF-CONTRADICTORY CHECK** — the implementation deliberately warms 3 scenes on idle (`ServicesIndex.tsx:214-221`, `sceneRegistry.ts` header). The check forbids what Task M built. 15 chunks ≥ 8 passes; the prefetch clause can never pass |
| S8r | 4 sampled scenes paint distinct, non-blank illustrations | scene art | only 2 of 4 reported: `luma σ [["software-solutions",15],["ai-solutions",8]]; pairwise differing pixels 36%` | **COLLATERAL of S8n** — the two missing scenes were never open when sampled. The two that did render pass both thresholds |
| S8p | 12 rapid switches keep exactly one card + bounded heap | card leak | `cards=0, heap growth 0.00 MB` | **REAL REGRESSION** — fails 2/2. The heap assertion passes vacuously because there is no card |
| S8q | reduced motion: preview opens with a STATIC scene | a11y | `{"cards":0,"static":null,"animations":-1,"cardAnimations":-1}` — the card does not open at all under `prefers-reduced-motion: reduce` | **REAL REGRESSION** — fails 2/2. If true, reduced-motion users lose the preview. Highest-priority item in this file |

### CHECK 83 specifically

* `grep -n "CHECK 83" frontend/scripts/verify-three.mjs` → **`NO MATCH for 'CHECK 83'`**
* `grep -n "floating" frontend/scripts/verify-three.mjs` → no matches (the check's subject was
  "hero shatter advances to `floating`")
* `PROJECT_NOTES.md:2684` records CHECK 83 as a **single observed failure** during Task L, and
  `PROJECT_NOTES.md §41` (`:2778`) retires **CHECK 82–90 + the `data-explode` state machine**
  because the WebGL shatter was deleted.
* The harness prints `[17] RETIRED — WebGL hero shatter (subject deleted)` and asserts instead
  `CHECK L94 — the retired shatter surface is gone`.

**Verdict: CHECK 83 no longer exists. It SHOULD be (and was) retired. There is no orphaned failing
check. The defect described in task §0(e) is not reproducible at this HEAD.**

---

## 7.3 Weak-assertion hunt

### Live-code scan

| pattern | result |
|---|---|
| `\|\| true` inside a check condition | **no matches** |
| `.skip` / `xit` / `test.skip` | **no matches** (the only `skip` hit is `CHECK L86 — skip link present`) |
| `catch (() => null)` | 4 hits — **all of them JSON parsing of a response body** (`verify-three.mjs:3942, 5044, 5089`), not assertion suppression |
| commented-out checks | none found |
| `// *check` / `todo` suppressions | none found |

### History scan (the "never weaken assertions" rule)

`git log -p --follow -- frontend/scripts/verify-three.mjs | grep -E "^[-+].*(0\.95|≤ 3|50 ms|900 KB)"`:

* **No threshold was lowered.** `0.95` appears only in **added** lines (L71/L72) and in **removed**
  lines belonging to retired fracture checks (145/148) whose subject was deleted.
* `CHECK L72` changed only in wording: `"after explode → reassemble"` → `"after docked → reassemble"`,
  the `>= 0.95` threshold unchanged.
* `CHECK 41` keeps `maxTravelFrac <= 0.08 && maxRotation <= 3.01`.
* `CHECK S21` (`<= 900000 raw`) is a **new** budget added in Task L, not a loosening.
* `L57/L58/L59` are **new** checks added by Task M — they were never weakened because they did not
  exist before.

Harness commit history (13 commits): `19b41e2, 91a12fb, 4db05f8, e62174e, ca54f7e, f70a7d2,
da8b39b, bf20e5e, cff2e27, ad50eeb, 9a77aaa, e92f7cc, 5ccc357`.

**F-7-001 — NO ASSERTION-WEAKENING VIOLATION FOUND (INFO, CONFIRMED).**
The documented pattern in `prompt.md` §2c ("the previous agent wrapped the hub packet probe in
`.catch(() => null)`") is **not present** in the current file — hub CHECK 96 asserts
`packets:10, flows:5, bases:5` with no catch wrapper. Either it was repaired before this HEAD or
it never landed. Verified by reading `verify-three.mjs` around the hub suite.

### One genuine weak spot

**F-7-002 — S8p'S HEAP ASSERTION IS VACUOUS WHEN THE CARD IS CLOSED (LOW, CONFIRMED).**
`verify-three.mjs:4614-4630` measures `heapBefore`/`heapAfter` and asserts bounded growth, but the
observed `cards=0` means nothing was mounted, so `heap growth 0.00 MB` proves nothing. The check
reports PASS for the wrong reason when F-5-005 is present.

---

## 7.4 Coverage gaps — features with NO automated check

| feature | has any check? | note |
|---|---|---|
| Hero delivery choreography | **YES — extensive** (L60a–L60h, L61–L67, L71/L72) | strongest coverage in the repo |
| VIP preview card | **YES** (S8a–S8r) but 4 of them fail | |
| Product Showcase Tiles | **YES** (76e, 76e2, 76e3, 76e4, 76f) | conic sweep, sheen and arrow-slide are unasserted |
| Form upgrade | **YES** (suite [10]) | |
| Push on a production deploy | **NO** | only `GET /api/push/public-key` and the opt-in prompt are checked; an actual end-to-end send to a real device is **NOT VERIFIED** |
| BFF cookie flags in a **real browser** | **NO** | `verify-bff` inspects `Set-Cookie` headers over HTTP, never through a browser cookie jar. Whether Chrome actually stores and re-sends the cookie is **NOT VERIFIED** |
| Mobile bottom sheet of the VIP card | **NO** | `vip--sheet` is never asserted at 390 px |
| `hasAlpha` / `aspectRatio` numeric correctness | **NO** | see F-6-008 |
| Dangling `logoId` (record deleted by bypass) | **NO** | see 4.5 |
| Reduced-motion VIP sheet | partial (S8q exists but fails) | |
| Schema migration of existing production data | **NO** | see F-6-010 |
| Rate-limit behaviour across serverless instances | **NO** | see F-6-006 |
| Security headers on the **frontend** | **NO** | no check asserts CSP/HSTS/XFO on `/` — the gap in F-3-010 is invisible to the harness |
| `npm audit` in CI | **NO** | the critical `next` advisory (F-2-011) is caught by nothing |

---

## 7.5 Test determinism

| risk | found? | evidence |
|---|---|---|
| timing-based waits instead of state | **YES, extensively** | `await sleep(260)`, `sleep(560)`, `sleep(460)`, `sleep(500)`, `sleep(150)` throughout suite [20]; `verify-three.mjs:4499-4514` retries 3× with fixed sleeps |
| network dependency | **YES (by design)** | the harness drives a real backend over HTTP; suite [15] blocks API URLs deliberately |
| random data | **no** | `SuccessModal.tsx:21` documents fixed confetti geometry; `verify-three.mjs` uses a fixed fixture array |
| fixed ports | **YES** | `CHROME` debug port **9333** hard-coded (`verify-three.mjs:72`), `API` defaults to `localhost:5000` (`:77`), screenshot dir fixed, `BFF_STUB_PORT 4521` / `BFF_APP_PORT 3221` in verify-bff |
| machine-load sensitivity | **YES** | L57/L58/L59 — see 7.2. A 66 ms long task and 6/31 dropped frames on a shared Windows box are not reproducible numbers |

**F-7-003 — THE HARNESS IS TIMING-SENSITIVE BY CONSTRUCTION (MEDIUM, CONFIRMED).**
Five of the seven failures are load-dependent (L57, L58, L59, and arguably the S8 settle windows).
The harness has no warm-up, no retry-with-backoff, and no calibration against a measured idle
baseline other than the ad-hoc `idle baseline N/M` printed with L59.
Recommended fix (NOT APPLIED): calibrate the frame budget against the measured idle baseline
(e.g. require `dropped <= idleDropped + 3`) rather than an absolute 3.

**F-7-004 — FIXED DEBUG PORT 9333 CAN COLLIDE (LOW, CONFIRMED).**
`verify-three.mjs:72` `const DEBUG_PORT = 9333;` with no fallback. A second Chrome with DevTools
open, or a parallel harness run, fails immediately. `capture-themes.mjs` uses 9355, so the two
scripts do not collide with each other.

---

## 7.6 Raw evidence files

Raw harness logs were kept outside the repository during the audit and deleted afterwards
(`FORENSIC/_tmp/` removed per §5.2). The exact commands in §7.1 reproduce every number above.
Screenshots produced by the harness remain in `frontend/test-output/screenshots/` (gitignored) —
they are a by-product of the run, **not** an artifact this audit created deliberately, and the
directory was already present before the audit began.
