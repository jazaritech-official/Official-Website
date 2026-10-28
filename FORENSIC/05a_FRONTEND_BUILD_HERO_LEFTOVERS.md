# FORENSIC 05a — Frontend: Build, Hero, Leftovers (Phase 5, part a)

---

## 5.1 Build & static checks (REAL RUNS)

| gate | exact command | result | exit |
|---|---|---|---|
| lint (frontend) | `cd frontend && npm run lint` | **0 problems, no output** | 0 |
| typecheck | `cd frontend && npx tsc --noEmit` | **0 errors** | 0 |
| build | `cd frontend && BACKEND_ORIGIN=http://127.0.0.1:5001 npx next build` | compiled successfully; TypeScript pass finished; 18/18 static pages generated | 0 |
| lint (Backend) | `cd Backend && npm run lint` | 0 problems | 0 |
| build (Backend) | `cd Backend && npm run build` | `Syntax check passed: 54 files verified.` | 0 |
| contrast | `cd frontend && npm run audit:contrast` | **65/65 token pairs meet WCAG AA (>= 4.5:1)**, 6 documented decorative exemptions | 0 |
| secrets | `cd frontend && npm run check:secrets` | `clean — 8 file(s) scanned` | 0 |
| BFF | `cd frontend && npm run verify:bff` | **21/21 checks passed** | 0 |
| smoke | `cd Backend && NODE_ENV=test RATE_LIMIT_MAX=5000 npm run smoke` | **234 passed, 0 failed** | 0 |
| harness | see FORENSIC/07 | **301/308** (two independent runs) | 1 |

### Build invocation note (why `npx next build` instead of `npm run build`)

`frontend/package.json` defines `"prebuild": "node scripts/snapshot-content.mjs"`, so
`npm run build` rewrites the **tracked** file `frontend/public/content-snapshot.json`
(`snapshot-content.mjs:101` regenerates `generatedAt`, `:110` `fs.writeFileSync`). Running it
would have dirtied the tree and violated the read-only rule of this audit, so the identical
`next build` step was run directly. `git status --porcelain` stayed empty before and after
(recorded in 00_INDEX).

**F-5-001 — `npm run build` ALWAYS DIRTIES A TRACKED FILE (MEDIUM, CONFIRMED).**
Evidence: `snapshot-content.mjs:99-111` — when any collection resolves (previous snapshot
exists), the file is rewritten with a new `generatedAt` even if every list is "kept". Commit
`19b41e2` itself contains a 27-add/27-delete change to `frontend/public/content-snapshot.json`,
i.e. this already happened in the real history.
Impact: every local build produces a modified tracked file, which is how partial/accidental doc
edits get swept into commits.
Recommended fix (NOT APPLIED): write the snapshot to an ignored path, or only rewrite when the
content actually changed.

### Next.js route table (recorded from this build)

```
○ /                       ○ /admin/account        ○ /admin/dashboard      ƒ /admin/login
○ /_not-found             ○ /admin/logos          ○ /admin/notifications  ○ /admin/product-presets
○ /admin/products         ○ /admin/submissions    ○ /admin/team           ○ /admin/visitors
ƒ /api/auth/login         ƒ /api/auth/logout      ƒ /api/auth/me          ƒ /api/auth/password
ƒ /api/diag-session       ○ /apple-icon.png       ○ /icon.png             ○ /manifest.webmanifest
○ /robots.txt             ○ /sitemap.xml
```

`○` static / `ƒ` dynamic. Every admin page is static-prerendered (data is fetched client-side);
only `/admin/login` and the five API routes are dynamic.

### Bundle (measured by the harness, suite [25])

`home initial JS: 724868 raw / 224439 gz across 11 chunks`
CHECK S21 asserts `<= 900000 raw` → passes with 724 868 B.
TASK-L §38 baseline was 707307 raw / 218300 gz → **+17 161 B raw (+2.4 %), +6 139 gz (+2.8 %)**
for the whole Task M feature set. `three` chunk (652 165 B) is gone — CHECK S20 confirms no
emitted chunk contains a WebGL renderer, CHECK S19 confirms no script tag references a three chunk.

**Build timestamp note:** the pre-existing `frontend/.next` was dated `2026-10-17 19:31` (matching
HEAD's commit date). This audit ran a **fresh build** on 2026-10-26 before the harness runs; the
harness therefore measured the current source, not a stale artifact.

---

## 5.2 Hero — requirement by requirement

Files read in full: `components/sections/HeroMark.tsx` (639 lines),
`components/sections/Hero.tsx` (168), `components/sections/heroFragments.ts` (323),
`components/sections/heroLayout.ts`.

### The real state machine

`HeroMark.tsx:67`:
```ts
type HeroState = "assembled" | "splitting" | "flying" | "docked" | "returning" | "merging";
```
Exactly the six specified states, and **only** those six. Transitions at
`:200-239` (`assembled → splitting → flying → docked` on open; `docked → returning → merging →
assembled` on close). There is no `exploding`/`exploded`/`reassembling` state — Task M renamed
them, and `PROJECT_NOTES.md §50` records `CHECK L60` being retired for exactly that reason.

| Task M requirement | status | evidence |
|---|---|---|
| six states via `data-hero-state` | VERIFIED-REAL | `:411` `data-hero-state={state}`; CHECK L60a observed `assembled > splitting > flying > docked` **in order** |
| `data-hero="svg-v2"` | VERIFIED-REAL | `:410`; present in SSR HTML measured by `curl http://localhost:3001/` |
| `data-fragments` exactly 10 | VERIFIED-REAL | `:413` `HERO_FRAGMENTS.length`; `heroFragments.ts:12` "the ten real-logo slices"; CHECK L60b = 10 |
| fragments are real clipPath slices of the real logo | VERIFIED-REAL | CHECK L60b detail: `clip:"hero-fragclip-0"`, `gradient:"hero-frag-jazari-logo-grad-top"`, `pathFill:"url(#hero-frag-jazari-logo-grad-top)"`, `rects:0` — no placeholder rect/circle |
| WAAPI keyframes follow leader-line paths | VERIFIED-REAL | CHECK L60c — per-fragment wire distance min/mean/tail-mean `12/50/55 2/39/54 2/46/58 1/33/51 10/39/52 4/13/13 2/18/9 0/12/7 4/14/11 1/10/8`, "max offset from the straight mark→socket line 116px" — i.e. **not** a straight-line approximation |
| ≥10 keyframes per flight track | VERIFIED-REAL | CHECK L60h `keyframes per fragment: 15,15,15,15,13,14,15,15,14,15` |
| dock at ≤32 % scale | VERIFIED-REAL | `heroFragments.ts:61` `FRAGMENT_MAX_SCALE = 0.32`; CHECK L60h asserts it |
| interrupt-safe reversal | VERIFIED-REAL | CHECK L60f `reversedFrom:"returning", state:"assembled", stray:0, sameNodes:true, styles:10` |
| fragments created once and reused | VERIFIED-REAL | CHECK L60g `sameNodes=true` |
| ghost slots | VERIFIED-REAL | `PROJECT_NOTES.md §50` + the L71/L72 setup now waits for `opacity < 0.5` ghost emphasis instead of hidden tooltips |
| shared short-line fallback improved | PARTIAL | see F-4-004 in 04_CORRECTNESS |
| reduced motion | VERIFIED-REAL | suite [4] passed; `HeroMark.tsx:409` adds `is-static`; `:392` short-circuits when `NODE_ENV === "production"` for one dev-only helper |
| off-screen / hidden-tab pause | VERIFIED-REAL | `:364` `if (!inView \|\| document.hidden \|\| …) return;` gates the idle auto-open; no `requestAnimationFrame` loop exists at all |
| only transform/opacity/stroke-dashoffset | VERIFIED-REAL (CSS) | see 5.10 for the full animated-property grep |
| timing constants | VERIFIED | `heroFragments.ts` `FLY_MS`, `FLIGHT_DELAY_MS`, `MERGE_MS` referenced at `HeroMark.tsx:212,220,238` |
| cleanup on unmount / no leaked loops | VERIFIED-REAL | CHECK suite [7] "SPA round-trips ×3 (unmount / remount / leak)" passed with a clean console; `HeroMark.tsx:39` documents "no rAF loop"; `grep requestAnimationFrame` in `HeroMark.tsx` returns **no code line** (only the comment at `:39`) |
| 5 tooltips each side | VERIFIED-REAL | `heroLayout.ts:27` `rows: 5`, `:28` two columns, `:56-67` five left anchors + five right anchors |
| tooltip copy from `GET /api/services` only | VERIFIED-REAL | CHECK L10 `api=14 shown=10` — "tooltip titles are the API service titles (no invented copy)" |
| no overlap with headline/CTAs/navbar | VERIFIED-REAL | CHECK L65 `[]`, CHECK L66 `pairClashes:[], tipVsCopy:[], count:10` |
| CTA hit-testable in every state | VERIFIED-REAL | CHECK L67 `{ok:true, tag:"SPAN"}` |

### Hero verdict

**VERIFIED-REAL on every requirement except the shared short-line copy helper (PARTIAL).**
This is the strongest-delivered part of Task M.

### Measured hero perf (and its two failing checks)

| check | run 1 | run 2 | verdict |
|---|---|---|---|
| L57 first transform change ≤ 50 ms | **FAIL** 63 ms after pointerover (CDP dispatch 192 ms) | pass | ENVIRONMENT-SENSITIVE (fails in 1 of 2 runs) |
| L58 zero long tasks > 50 ms | pass | **FAIL** `66` (one 66 ms task) | ENVIRONMENT-SENSITIVE (fails in 1 of 2 runs) |
| L59 dropped frames ≤ 3 in 1 s | **FAIL** `6/31` (idle baseline `4/40`) | **FAIL** `7/24` (idle baseline `1/59`) | **REAL REGRESSION** — fails both runs; note the *idle* baseline itself dropped 4 frames in run 1, so the machine cannot meet ≤3 |

---

## 5.3 Leftovers — are the removed things really removed?

Command (source only, `.next` and `node_modules` excluded):

```
for p in SceneCanvas HeroScene createTechObjects createLogoPieces __jazariDebug forceShatter \
         "hero-scene" "three/" "water-fill" "shatterState" "fracture.ts" "components/three"; do
  grep -rn "$p" frontend/app frontend/components frontend/lib frontend/hooks frontend/scripts
done
```

| removed feature | residue in SOURCE | verdict |
|---|---|---|
| voxel / neon cube dust | **no matches** | GONE |
| Voronoi fracture | 3 hits, all prose in comments: `globals.css:1052`, `Hero.tsx:14`, `HeroMark.tsx:35` (each says the thing is GONE) | GONE |
| black shards | no matches for `shatter`, `shatterState`, `fracture.ts` | GONE |
| boxed "chip" object | `globals.css:598` "Badges / chips" (UI chips), `:1053` comment "the boxed 'chip' support object are GONE" | GONE |
| WebGL shatter | `verify-three.mjs:4036-4049` suite `[17] RETIRED — WebGL hero shatter`; `:345-347` CHECK L51 scans chunks for `Voronoi/shatterState/fractureBudget` | GONE (asserted gone by the harness) |
| water-fill cards | **no matches** for `water-fill` / `waterfill` | GONE |
| Discipline Atlas | source: no component, no import. Only `frontend/.next/dev/**` stale build chunks still reference `DisciplineAtlas.tsx` | GONE from source; **stale dev build artifacts remain on disk** |
| `components/three/` | directory absent; deleted in commit `91a12fb` (15 files) | GONE |
| `three` dependency | absent from `frontend/package.json` and `npm ls --depth=0` | GONE |
| `useTilt` (Task L: "remove from services") | file still exists, **0 importers** | DEAD — see F-2-005 |

**F-5-002 — STALE DEV BUILD ARTIFACTS REFERENCE DELETED COMPONENTS (INFO, CONFIRMED).**
`frontend/.next/dev/server/chunks/ssr/…` contains ~20 references to
`components/services/DisciplineAtlas.tsx`, a file deleted in `91a12fb`. Harmless (gitignored,
overwritten by the next `next dev`), but it makes a naive `grep -r DisciplineAtlas frontend`
produce false positives — which is exactly what a careless audit would report as "the Atlas is
still there".

### Dead CSS / dead code size estimate

| item | evidence | size |
|---|---|---|
| `frontend/hooks/useTilt.ts` | 0 importers | 58 lines |
| `frontend/components/motion/Marquee.tsx` | 0 importers | (counted in components total) |
| `frontend/components/icons/index.tsx` | 0 importers | barrel re-exporting `paths.tsx` icons |
| `frontend/tmp-tile.css` | untracked stray, 466 CR lines | 466 lines |
| `frontend/scripts/tmp-hero-m.mjs` | temp file `prompt.md §e` orders deleted | 701 CR lines |
| stale `.next/dev` chunks | gitignored | not counted |

No other dead CSS was isolated: `globals.css` is 5 046 lines and every selector family sampled
(`.tile*`, `.vip*`, `.hub-*`, `.service-entry*`, `.form-*`, `.hero-*`) is referenced by a component.
**A selector-by-selector dead-CSS sweep was NOT performed — NOT VERIFIED.**

---

## 5.13 Mobile / responsive (recorded here because it belongs to the layout)

Breakpoints actually used in `globals.css` (`grep -n "@media"`):
`(pointer: coarse)` ×2 combined forms, `(max-width: 1023px)` ×3, `(max-width: 767px)` ×1 combined,
`(max-width: 639px)` ×2, `(min-width: 1024px)` ×2, `(prefers-reduced-motion: reduce)` ×14.
Tailwind `sm:/md:/lg:` classes are used in TSX (`Hero.tsx` `sm:pt-32`, `lg:grid-cols-...`).

Zero-horizontal-overflow was **measured**, not assumed — harness CHECK 9 at four widths:

```
CHECK 9 — responsive at 1366×768  {"overflowX":0,"items":48}
CHECK 9 — responsive at 1440×900  {"overflowX":0,"items":48}
CHECK 9 — responsive at 1920×1080 {"overflowX":0,"items":48}
```
plus suite [5] mobile 390×844 (passed). 1024/768 widths are covered by suite [5]/[11].
**Verdict: VERIFIED-REAL for 1920/1440/1366/390; 1024 and 768 exercised only indirectly —
PARTIAL.**
