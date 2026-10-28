# FORENSIC 00 — Index & Executive Summary

Task F — deep forensic audit of the whole Jazari Tech Official project.
**READ-ONLY.** No source file, config, script, test or doc was modified. The only change to the
repository is this `FORENSIC/` folder.

---

## 0. Environment & baseline (Phase 0 — chain of custody)

Recorded **before** any analysis, `date` = `Mon, Oct 26, 2026 5:55:57 PM` local.

| item | value | command |
|---|---|---|
| OS | `MINGW64_NT-10.0-26300 DESKTOP-O7QIP0E 3.6.9-b4195d69.x86_64` (MSYS/Git-Bash on Windows) | `uname -a` |
| node | `v24.18.0` | `node -v` |
| npm | `11.16.0` | `npm -v` |
| branch | `main` | `git branch --show-current` |
| HEAD | `19b41e28bb51187a4ab916e28cb5f6569a77365d` | `git rev-parse HEAD` |
| commits | **25** | `git rev-list --count HEAD` |
| authors | **25 / 25 — `Sibghat Ullah <ullahsibghat786@gmail.com>`** | `git shortlog -sne` |
| remote | `origin https://github.com/jazaritech-official/Official-Webiste.git` (no token in the URL) | `git remote -v` |
| stash | **`stash@{0}: On main: repair-bff`** — one pre-existing stash, never touched | `git stash list` |
| `git status --porcelain` (before) | **empty — CLEAN** | |
| `git diff --stat` (before) | **empty — no diff** | |

### Working tree vs HEAD

Every tracked file was identical to HEAD at the start. Untracked/ignored files present before the
audit: `.env.local` (root), `Backend/.env`, `frontend/.env.local`, `frontend/.env.example`,
`frontend/next-env.d.ts`, `frontend/tsconfig.tsbuildinfo`, `frontend/tmp-tile.css`,
`frontend/test-output/`, `frontend/.next/`, `node_modules/` ×3, `.vercel/`, `.freebuff/`,
`.baseline-wt/frontend/`, `Backend/uploads/logo-*.png` ×2.

**Files modified in the last 48 hours:** none of the tracked tree (the working tree was clean).
The newest tracked change is HEAD itself, committed 2026-10-17 — nine days before this audit.
The only recent mtimes are build/ignored artifacts (`frontend/.next` rebuilt by this audit).

### Phase 0.3 — script damage check

`node --check` on **every** tracked `.js/.mjs` under `frontend/scripts`, `Backend/scripts`, and
every other tracked `.js` → **all 59 files OK, zero parse failures.**

`frontend/scripts/verify-bff.mjs` specifically:

| question | answer | command |
|---|---|---|
| does it parse? | **YES** | `node --check` → OK |
| identical to HEAD? | **YES** | `git diff HEAD -- frontend/scripts/verify-bff.mjs` → empty |
| was a broken version ever committed? | **NO EVIDENCE** | `git log --follow --oneline -- <file>` → exactly **one** commit: `e62174e "Some Chnages of Notification"`. Only one version exists in history, so no truncation/rewrite event is recorded in git |
| does it still contain 21 checks? | **YES** | 240 lines; `grep -c` of the check pattern → 21 |
| does it run? | **YES** | `npm run verify:bff` → **`BFF verification: 21/21 checks passed`**, exit 0 |

### Phase 0.4 — invented-feature residue

Patterns searched over the **working tree** (tracked + untracked, excluding `node_modules`,
`.next`, `.git`): `echo-bearer`, `service-bearer`, `servicesSlug`, `SessionMatcher`, `Host-Admin`.

**Result: no matches for any of the five patterns.** (First attempt used `rg`, which is not on
this shell; the scan was re-run with `grep -rn` and reported above — the null result is real.)

Patterns then searched over **all 25 commits** with `git log --all --oneline -S"<pattern>"`:
**none of the five terms was ever added or removed in any commit.**

`bearer` occurs in exactly three files, all legitimate:
`Backend/middleware/auth.js` (the `Authorization: Bearer` header),
`Backend/scripts/smoke.js` (test assertions), `PROJECT_NOTES.md:166,382,2453` (documentation of
`requireAuth` accepting a bearer token).

**The invented "service-bearer / echo-bearer / servicesSlug / SessionMatcher / Host-Admin"
feature left ZERO residue in this repository.**

### Phase 0.5 — docs integrity

| doc | commits touching it | lines added | lines deleted | current lines | arithmetic check |
|---|---|---|---|---|---|
| `PROJECT_NOTES.md` | 17 | 3 244 | **12** | 3 232 | 3244 − 12 = 3232 ✓ |
| `DEPLOYMENT.md` | 10 | 747 | **6** | 741 | 747 − 6 = 741 ✓ |
| `README.md` | 14 | ~1 000 | max **15** in one commit | 553 | no commit lost >30 % |
| `prompt.md` | 1 | 138 | 1 | 137 | ✓ |

**No commit ever lost more than 30 % of a doc's lines.** The largest single deletion in the whole
history is 15 lines (`README.md`, `e92f7cc`). The alleged partial-write overwrite is **not
reproducible inside git** (F-9-002).

Section headings for every doc are recorded in `09_HISTORY_AND_AGENT_BEHAVIOUR.md` §9.3 (what is
missing/stale) and were enumerated with `grep -n "^#{1,3} "` during the audit: `PROJECT_NOTES.md`
has 50 numbered sections, `DEPLOYMENT.md` 15, `README.md` 14.

### Phase 0.6 — large / strange files

* Ten tracked PNGs > 1 MB (largest 3 939 107 B) — F-2-001.
* Three groups of byte-identical duplicates — F-2-002.
* CRLF/LF mixture across the repo — F-2-003.
* **No file contains a NUL byte** (`grep -qP '\x00'` over all tracked text → no matches).
* **No truncated final line detected** (all JS parses; all report files end on a complete sentence).

---

## EXECUTIVE SUMMARY (one page)

**Health verdict.** The code is in far better shape than the project's own history suggests.
Every one of the 45 deliverable claims from Tasks H–M that I checked exists in the tree — nothing
is missing, nothing is invented, and none of the six historical failures alleged in the brief is
reproducible at this HEAD. The real problems are elsewhere: **two genuinely broken user-visible
behaviours** (2 of 14 service previews never open; the preview does not open at all under
reduced-motion), **a production misconfiguration trap that is documented incorrectly**
(`BACKEND_ORIGIN` is build-time for the rewrite, but the deployment guide says it is runtime), a
**critical dependency advisory** on `next@16.3.8`, **six marketing claims on the homepage that the
site's own data contradicts**, and a `README.md` that still describes a deleted 3D layer as live.
Trust-wise: the docs are *append-only and intact* (12 deleted lines in 17 commits), the harness
contains **no weakened assertion**, and **no secret was ever committed** — but commit messages are
so non-descriptive that history cannot be audited without reading every diff.

### Top 10 most important findings

1. **F-2-011 (HIGH)** — `next@16.3.8` has a **critical** advisory set, including unauthenticated
   RCE in the image optimisation API when SVGs are involved.
2. **F-8-002 (HIGH)** — `DEPLOYMENT.md:698` says `BACKEND_ORIGIN` is runtime config; the `/api`
   rewrite is **build-time only**. Measured: runtime-only → 404 on `/api/services`.
3. **F-4-001 (HIGH)** — six unbacked claims in the first viewport, including "140+ products
   shipped" when the API returns **4**.
4. **F-5-004 (HIGH)** — `web-development` and `automation` never open the VIP preview card
   (2/2 runs).
5. **F-5-005 (MEDIUM→HIGH impact)** — the preview does not open at all under
   `prefers-reduced-motion` (2/2 runs) — an accessibility failure.
6. **F-4-006 (HIGH)** — the harness logs in as admin and writes `Showcase Fixture A/B` logos into
   whichever API it points at.
7. **F-9-004 (HIGH)** — `README.md` §9 documents `frontend/components/three/` as live while line
   530 says it was deleted; the file contradicts itself.
8. **F-3-010 (MEDIUM)** — the frontend sends **no** security headers at all (no CSP, HSTS,
   X-Frame-Options, Referrer-Policy) and exposes `X-Powered-By`.
9. **F-2-012 (HIGH)** — `body-parser` high-severity DoS advisory in the Backend tree.
10. **F-4-004 (MEDIUM)** — the "improved short-line fallback" still returns one-word lines
    (`Strategy`, `Pipelines`, `A`); its own doc comment is false.

### Scoreboard — findings by severity per phase

| phase | area | CRITICAL | HIGH | MEDIUM | LOW | INFO | total |
|---|---|---|---|---|---|---|---|
| 0–1 | baseline & claims ledger | 0 | 0 | 0 | 0 | 0 | 0 (no defect; 6 allegations not reproduced) |
| 2 | inventory & architecture | 0 | 2 | 2 | 5 | 1 | 10 |
| 3 | security | 0 | 0 | 4 | 8 | 6 | 18 |
| 4 | correctness & data-flow | 0 | 2 | 4 | 4 | 1 | 11 |
| 5 | frontend (UI/motion/a11y/perf) | 0 | 1 | 7 | 8 | 2 | 18 |
| 6 | backend | 0 | 0 | 3 | 5 | 1 | 9 |
| 7 | tests & harness | 0 | 0 | 1 | 2 | 1 | 4 |
| 8 | deployment & ops | 0 | 1 | 3 | 0 | 0 | 4 |
| 9 | history & agent behaviour | 0 | 1 | 1 | 0 | 3 | 5 |
| **TOTAL** | | **0** | **7** | **25 rows / 21 distinct** | **26** | **15** | **69 distinct** |

(Phase rows overlap slightly where a finding spans two phases; the distinct total is 69, listed
once each in `10_FINDINGS_REGISTER.md`, which holds 73 rows because four are cross-reference
aliases.)

---

## TRUTH MAP — Tasks H to M

| task | % genuinely delivered | the one biggest gap |
|---|---|---|
| **H** — service states, favicon, content resilience, admin IA | **100 %** | sidebar claim says 3 groups, there are **4** (`engagement` added) — a stale claim, not a missing feature |
| **I** — cookie, login `/me`, SEO, hub wiring, scrim, scroll-margin | **100 %** | none; all 7 verified, hub packets measured at `packets:10, flows:5, bases:5` |
| **J** — Web Push | **100 %** | no end-to-end send to a real device is automated (NOT VERIFIED) |
| **K** — BFF, diagnostics, VAPID subject, rewrites, removed features | **100 %** | `rewrites()` is build-time — correct as claimed, but the deployment guide mis-states it (F-8-002) |
| **L** — logo references, presets, cache v2, SVG hero, services index, form | **100 %** | none; CHECK 83 is properly retired, the card-04/socket fixes are present |
| **M** — hero choreography, Showcase Tiles, VIP preview, 14 scenes | **≈ 88 %** | the scene engine: `S8n` (2 of 14 services never open a card) and `S8o` (check contradicts the prefetch) fail in **two independent full runs** |

Per-area Task M detail: hero choreography **100 %**, Showcase Tiles **100 %**, hover/VIP **100 %**,
scene engine **~70 %**, copy fallback **~70 %**, token scoping **~80 %**, retirements **100 %**.

---

## HARNESS NUMBERS (all measured in this audit)

| gate | result | exit |
|---|---|---|
| `npm run check:secrets` | clean — **8 files scanned** | 0 |
| `npm run lint` (frontend) | **0 problems** | 0 |
| `npx tsc --noEmit` | **0 errors** | 0 |
| `npm run build` (equivalent `npx next build`) | compiled, **18/18 static pages**, 22 routes | 0 |
| `npm run verify:bff` | **21 / 21** | 0 |
| `npm run audit:contrast` | **65 / 65** AA | 0 |
| `Backend npm run smoke` | **234 / 234** | 0 |
| `Backend npm run lint` / `build` | 0 / `54 files verified` | 0 |
| `verify-three.mjs` run 1 | **301 / 308** (278 ✓, 7 ✗) | 1 |
| `verify-three.mjs` run 2 (isolated) | **301 / 308** (278 ✓, 7 ✗) | 1 |
| `NO_WEBGL=1` | **10 / 10** | 0 |
| `npm audit --omit=dev` (frontend) | **1 critical** | 1 |
| `npm audit --omit=dev` (Backend) | **1 high** | 1 |

**Screenshots: NOT VERIFIED by eye.** The harness wrote 180 PNGs to
`frontend/test-output/screenshots/` during these runs. This audit did **not** open and describe
them, because doing so would require driving a browser for visual inspection, which the task did
not require. They are available for the owner to look at; no visual claim is made here.

---

## REPORT FILES (line counts measured with `wc -l`)

| file | lines |
|---|---|
| `FORENSIC/00_INDEX_AND_EXECUTIVE_SUMMARY.md` | this file |
| `FORENSIC/01_CLAIMS_LEDGER.md` | 150 |
| `FORENSIC/02_INVENTORY_ARCHITECTURE.md` | 362 |
| `FORENSIC/03_SECURITY.md` | 407 |
| `FORENSIC/04_CORRECTNESS_DATAFLOW.md` | 253 |
| `FORENSIC/05a_FRONTEND_BUILD_HERO_LEFTOVERS.md` | 186 |
| `FORENSIC/05b_FRONTEND_SERVICES_TILES_HUB_FORM_ADMIN.md` | 226 |
| `FORENSIC/05c_FRONTEND_A11Y_PERF_SEO_BRAND.md` | 243 |
| `FORENSIC/06_BACKEND.md` | 244 |
| `FORENSIC/07_TESTS_HARNESS.md` | 178 |
| `FORENSIC/08_DEPLOYMENT_OPS.md` | 199 |
| `FORENSIC/09_HISTORY_AND_AGENT_BEHAVIOUR.md` | 151 |
| `FORENSIC/10_FINDINGS_REGISTER.md` | 133 |
| `FORENSIC/11_REMEDIATION_ROADMAP.md` | 233 |

Each file was read back after writing (tail verified) — none ends mid-sentence.
`FORENSIC/05` is split into `05a`/`05b`/`05c` because the phase exceeds 600 lines.

---

## REPO STATE — BEFORE vs AFTER

| | before | after |
|---|---|---|
| `git status --porcelain` | empty | `?? FORENSIC/` **only** |
| `git diff --stat` | empty | **empty** |
| HEAD | `19b41e2` | `19b41e2` (unchanged) |
| stashes | `stash@{0}: repair-bff` | unchanged (untouched) |
| tracked files modified | 0 | **0** |
| commits / branches | 25 / untouched | unchanged (no commit, push, stash, reset, checkout, rebase) |

`FORENSIC/_tmp/` was never created (raw harness logs lived in the OS temp directory outside the
repo and were left there by the tool runner). The only artifact this audit added **inside** the
repository is `FORENSIC/` itself.

Side effects to be aware of, none of them tracked files:
* `frontend/.next/` was rebuilt (gitignored) — a fresh production build dated 2026-10-26.
* `frontend/test-output/screenshots/` gained 180 PNGs from the harness runs (gitignored; the
  directory already existed).
* Two background servers were started and are still running for the owner to stop if desired:
  in-memory backend on **:5001** and `next start` on **:3001**. Ports 3000 and 5000 belong to a
  **different project** (`IrhassInn`) and were never touched.
