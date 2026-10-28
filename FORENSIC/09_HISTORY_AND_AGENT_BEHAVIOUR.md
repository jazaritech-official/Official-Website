# FORENSIC 09 — History & Agent Behaviour (Phase 9)

All commands are read-only: `git log`, `git show --numstat`, `git log -p --follow`,
`git log --diff-filter=A`, `git shortlog -sne`.

---

## 9.1 The 25 commits, one truthful line each

| hash | date | message | files / + / − | what the diff actually did |
|---|---|---|---|---|
| `9ed463d` | 2026-10-01 | First Commit | 2 / +14 | two tiny files — repository bootstrap, no product code |
| `602b958` | 2026-10-02 | First Commit | 125 / +22 054 / −9 | the real initial import: whole backend + frontend + `PROJECT_NOTES.md` (418) + `README.md` (199) + `smoke.js` + `AGENTS.md`/`CLAUDE.md` |
| `5ccc357` | 2026-10-02 | Initial commit | 30 / +3 379 / −60 | next feature slice; adds 246 lines to `PROJECT_NOTES.md` |
| `e92f7cc` | 2026-10-02 | Some Changes | 46 / +2 983 / −301 | broad change across backend + frontend; **message describes nothing** |
| `226eaf7` | 2026-10-02 | Phase One of Prompt Three | 10 / +1 768 / −33 | adds **297 lines to `verify-three.mjs`** — a large harness addition; message is opaque |
| `9a77aaa` | 2026-10-02 | Phase One of Prompt Done | 11 / +1 667 / −163 | adds 219 lines to `PROJECT_NOTES.md` |
| `ad50eeb` | 2026-10-03 | Logo Preview | 11 / +234 / −28 | logo preview feature (15+/1− on `PROJECT_NOTES.md`) |
| `7f84c6e` | 2026-10-03 | Vercel.json added | 6 / +138 / −32 | Vercel config + 42 lines of docs |
| `7cb9a07` | 2026-10-03 | Vercel.json | 1 / +1 | one-line config tweak |
| `cff2e27` | 2026-10-03 | UI Updation | 27 / +2 101 / −45 | large UI addition; docs appended (263) |
| `bf20e5e` | 2026-10-04 | UI Updation | 8 / +2 677 / −337 | **+2 677 lines with no doc change** — message is opaque |
| `6560958` | 2026-10-04 | Files updated | 3 / +258 / −10 | docs only (+223 `PROJECT_NOTES`) |
| `217e3ac` | 2026-10-05 | .md Files updated | 2 / +55 / −2 | docs only — **message matches content** |
| `da8b39b` | 2026-10-06 | Hero Logo Changed | 28 / +2 168 / −671 | hero/logo rework + 127 doc lines |
| `f70a7d2` | 2026-10-06 | Admin Changes | 37 / +1 909 / −103 | admin IA + `check-no-secrets.mjs` + `snapshot-content.mjs` |
| `5612d6f` | 2026-10-07 | Cookiw and Logo Pieces | 7 / +276 / −37 | cookie + logo-piece work; **typo'd message** |
| `ca54f7e` | 2026-10-07 | Some Chnages of Notification | 47 / +5 637 / −110 | the Web Push feature (Task J) — largest single feature commit |
| `e62174e` | 2026-10-08 | Some Chnages of Notification | 37 / +4 704 / −626 | Task K: BFF auth routes, `verify-bff.mjs` (created here), `authCookie.js` |
| `cd1c825` | 2026-10-08 | Hero Section Logo | 1 / +0 / −1 | **one deletion only** — message implies a feature |
| `4db05f8` | 2026-10-08 | Hero Section Logo | 26 / +1 524 / −382 | hero + docs + harness |
| `eadbc07` | 2026-10-08 | trigger deploy | **0 / 0 / 0** | **EMPTY COMMIT** |
| `7a76146` | 2026-10-08 | trigger deploy | **0 / 0 / 0** | **EMPTY COMMIT** |
| `fc4abd8` | 2026-10-09 | vercel | 1 / +3 | three lines of Vercel config |
| `91a12fb` | 2026-10-10 | UI Updated | 46 / +5 210 / **−8 727** | **Task L**: deletes `components/three/*` (15 files) and `DisciplineAtlas.tsx` (643), adds `HeroMark.tsx`, `ServicesIndex.tsx`, rebuilt form, retires harness suites |
| `19b41e2` | 2026-10-17 | Changes | 33 / +7 445 / −842 | **Task M**: 14 scene files, `sceneRegistry.ts`, `heroFragments.ts`, Showcase Tiles, `serviceCopy.ts`, +928 harness lines |

Authors: `git shortlog -sne` → **25 / 25 commits by `Sibghat Ullah <ullahsibghat786@gmail.com>`**.
Single human author; no bot commits.

### Commits whose message does not match the diff

| hash | message | reality | severity |
|---|---|---|---|
| `eadbc07`, `7a76146` | "trigger deploy" | **zero-file commits** — legitimate as deploy triggers, but they inflate the history with no content | INFO |
| `cd1c825` | "Hero Section Logo" | a **single deleted line** — a feature-sized message for a one-line diff | LOW |
| `e92f7cc`, `bf20e5e`, `cff2e27`, `19b41e2`, `91a12fb` | "Some Changes" / "UI Updation" / "Changes" / "UI Updated" | multi-thousand-line changes including security-relevant files (`authCookie.js`, BFF routes, `check-no-secrets.mjs`) | **MEDIUM** — an audit cannot tell from history which commit introduced which security change |
| `ca54f7e`, `e62174e` | both "Some Chnages of Notification" | the second one is *not* primarily about notifications (it is Task K: auth/BFF) | LOW |

**F-9-001 — COMMIT MESSAGES ARE LARGELY NON-DESCRIPITIVE (MEDIUM, CONFIRMED).**
`git log --oneline` gives no way to find a security-relevant change without reading every diff.
This is the root cause of "I no longer trust any summary": even the *commit* summaries in this
project are unreliable.

---

## 9.2 High-risk files (docs, harness, scripts) and suspicious shrinkage

Command: `git show --numstat <c>` filtered for `*.md`, `verify-*`, `smoke.js`, `audit-contrast`,
`snapshot-content`, `check-no-secrets`.

| risk class | commits that touched it | shrinkage observed? |
|---|---|---|
| **Docs** (`PROJECT_NOTES.md`, `DEPLOYMENT.md`, `README.md`) | `19b41e2, 91a12fb, 4db05f8, e62174e, ca54f7e, f70a7d2, da8b39b, 217e3ac, 6560958, 7f84c6e, ad50eeb, 9a77aaa, 226eaf7, e92f7cc, 5ccc357, 602b958` | **NO** — see the numstat table below |
| **Harness** (`verify-three.mjs`) | 16 commits | only `91a12fb` (987+/1488−) and `bf20e5e` shrink it; both are explained by retiring the WebGL/Atlas suites (§41/§50 ledgers) |
| **`verify-bff.mjs`** | **exactly one: `e62174e`** | never shrunk — it was created there and never rewritten |
| **`smoke.js`** | 9 commits | **only ever grew** |
| **`check-no-secrets.mjs`** | `f70a7d2` only | created once, never weakened |

### Doc line-count history (`git log --follow --numstat`)

| doc | commits | total added | total deleted | current lines | arithmetic check |
|---|---|---|---|---|---|
| `PROJECT_NOTES.md` | 17 | 3 244 | **12** | 3 232 | 3244 − 12 = **3232 ✓** |
| `DEPLOYMENT.md` | 10 | 747 | **6** | 741 | 747 − 6 = **741 ✓** |
| `README.md` | 14 | ~1 000+ | max 15 in one commit | 553 | no commit lost >30 % |
| `prompt.md` | 1 | 138 | 1 | 137 | ✓ |

**F-9-002 — NO DOC EVER LOST MORE THAN 30 % OF ITS LINES (INFO, CONFIRMED).**
The largest single deletion to any doc in the entire history is **15 lines** (`README.md`,
commit `e92f7cc`, 45+/15−). `PROJECT_NOTES.md` has lost **12 lines in 17 commits** total.
The alleged "docs overwritten by partial writes" (task §0(c)) **did not happen inside git**.

**F-9-003 — BUT THE BUILD MUTATES A TRACKED DOC-LIKE FILE (MEDIUM, CONFIRMED).**
`frontend/public/content-snapshot.json` was changed by commit `19b41e2` (27+/27−) — a generated
artifact swept into a feature commit. This is the mechanism by which an accidental overwrite
*could* occur (F-5-001).

---

## 9.3 Doc statements that are FALSE or STALE at this HEAD

| # | doc line | what it says | contradicting evidence | status |
|---|---|---|---|---|
| D1 | `README.md:241-280` — **§9 "3D / WebGL layer (public site only)"** | "Code lives in `frontend/components/three/` (`engine.ts`, `SceneCanvas.tsx`, `HeroScene.tsx`, `quality.ts`, `theme.ts`)"; "`three` sits in its own async chunk"; troubleshooting for a WebGL fallback | `ls frontend/components/three` → **directory does not exist**; `npm ls --depth=0` → no `three`; `grep -rn three/ frontend/app` → no matches | **FALSE — an entire README section describes deleted code** |
| D2 | `README.md:246, 261, 263, 277-280, 294, 356-360, 493` | `components/three/createLogoPieces.ts`, `components/three/fracture.ts` "Voronoi fracture of the five traced logo contours" | both files deleted in `91a12fb` | **FALSE** |
| D3 | `README.md:530-531` | "The hero is inline SVG, not WebGL. `three` … are gone from `package.json` and `components/three/*` is deleted" | TRUE | **contradicts D1/D2 inside the same file** |
| D4 | `README.md:132` | "`node scripts/verify-three.mjs` … (**271 checks**)" | measured: **308 checks** (301 pass) | **STALE NUMBER** |
| D5 | `README.md:8` | "lazy-loaded chunk — `/admin` never loads it; see the *3D / WebGL layer* section below" | there is no such chunk | **FALSE** |
| D6 | `PROJECT_NOTES.md:2662` (§38.6) | "**Phases 1–3 (hero) were not attempted.** The hero still uses the Task K support objects + Voronoi fracture" | `HeroMark.tsx` exists (639 lines), `components/three/` deleted, harness L60a–L60h pass | **STALE** — was true when written, fixed in `91a12fb` |
| D7 | `PROJECT_NOTES.md:2666` | "the Hub 'card 04' bottom spacing/collision audit … was **not** done" | `globals.css:2081` "Task L — card-04 bottom-spacing fix" | **STALE** |
| D8 | `PROJECT_NOTES.md §50` | lists retired/changed checks `S8a … S8q` | the harness also contains **`S8r`**, unlisted | **INCOMPLETE** |
| D9 | `verify-three.mjs:19` | header: "Services Index (static, every discipline visible, **no hover affordance**)" | S8a–S8r assert the opposite (rows open a preview on hover) | **STALE COMMENT** |
| D10 | `verify-three.mjs:26` | "Super Admin role/security logic is covered by the BACKEND smoke test … **81 assertions**" | `smoke.js` currently reports **234** | **STALE NUMBER** |
| D11 | `DEPLOYMENT.md:278-283` §8 frontend table | only `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` | `BACKEND_ORIGIN` and `DIAGNOSTICS` are load-bearing | **INCOMPLETE** (F-8-001) |
| D12 | `DEPLOYMENT.md:698` | "`BACKEND_ORIGIN` is runtime config, not only build-time" | the `/api` rewrite is build-time only (F-8-002, measured) | **FALSE AS WRITTEN** |
| D13 | `PROJECT_NOTES.md:2684` | records CHECK 83 as an open, unexplained failure | CHECK 83 no longer exists; retired by §41 | **STALE** (already resolved) |
| D14 | `prompt.md` (committed to the repo, 137 lines) | an operational prompt containing the owner's working instructions | harmless, but it is an *agent instruction file* living in the production repo root | INFO |

**F-9-004 — `README.md` §9 DESCRIBES A DELETED 3D LAYER AS IF IT WERE LIVE (HIGH, CONFIRMED).**
A new developer or agent reading `README.md` first (as `PROJECT_NOTES.md §1` instructs) would try
to build a `components/three/` directory that no longer exists. `README.md` simultaneously says the
hero is SVG (D3) and WebGL (D1).
Recommended fix (NOT APPLIED): delete or mark §9 superseded, the way `PROJECT_NOTES.md §26` was
(correctly) marked at `PROJECT_NOTES.md:652-660`.

---

## 9.4 HONEST SELF-ASSESSMENT

Claims made by earlier agent sessions in this project that **this audit proves false or
exaggerated**, with proof:

| # | earlier claim | proof it is wrong | who was affected |
|---|---|---|---|
| 1 | "`README.md` describes the current stack" (implied by `PROJECT_NOTES.md §1` telling readers to read it first) | README §9 documents a `components/three/` directory that does not exist (D1/D2) while README:530 says it was deleted (D3) — the file contradicts itself | anyone using README as an entry point |
| 2 | "`verify-three.mjs` has 271 checks" (`README.md:132`) | measured **308** | baseline planning |
| 3 | "the smoke test has 81 assertions" (`verify-three.mjs:26`) | measured **234** | baseline planning |
| 4 | "`restingLine` … never returns a single dangling word" (`serviceCopy.ts:50-54`) | executed: returns `Strategy`, `Pipelines`, `A`, `Pipelines` for four inputs (FORENSIC/04 §4.3) | the Task M copy-quality claim |
| 5 | "`BACKEND_ORIGIN` is runtime config, not only build-time" (`DEPLOYMENT.md:698`) | the rewrite is baked into `routes-manifest.json` at build; runtime-only `BACKEND_ORIGIN` produced 404 (F-8-002) | production deploys |
| 6 | "`S8a–S8p` are the replacements" (`verify-three.mjs:4209`, `PROJECT_NOTES §50`) | the file also contains `S8r` | retired-check ledger completeness |
| 7 | "Task M's lazy scene loading is complete" (implied by §49 "the fourteen scenes, as implemented") | **CHECK S8n fails for 2 of 14 services and S8o fails outright** in two independent runs | the Task M completion claim |
| 8 | "the improved shared short-line fallback fixes the Fast/Strategy/Pipelines symptom" (§46.5) | four of six executed inputs still produce one-word lines (F-4-004) | the Task M copy claim |
| 9 | "Everything works" framing of prior summaries | this audit measured **7 failing checks out of 308**, a **critical** dependency advisory and a **high** one, and 6 unbacked marketing claims | the owner's trust |

**What prior sessions got RIGHT (stated so the assessment is not one-sided):**

* The retired-check ledgers (`§41`, `§50`) are accurate and specific — every retirement I checked
  maps to a genuinely deleted subject.
* `PROJECT_NOTES.md §26` carries a correct SUPERSEDED banner.
* The hub-packet regression described in `prompt.md §B1` is **fixed** (CHECK 96 measures
  `packets:10`).
* The invented "service-bearer / echo-bearer / servicesSlug / SessionMatcher / Host-Admin"
  feature left **zero residue** in this repository — not in the working tree, not in any of the
  25 commits (`git log -S` for all five terms returned nothing).
* No assertion was weakened in the harness history (F-7-001).
* No secret was ever committed (FORENSIC/03 §3.1).

**What I could not determine:** whether the failures and stale docs above were introduced by
earlier agent sessions, by the owner, or by interrupted runs — the commit messages (F-9-001) make
that attribution impossible from history alone.
