# FORENSIC 05b — Frontend: Services, Tiles, Hub, Form, Admin (Phase 5, part b)

---

## 5.4 Services — static index, VIP preview, scenes

### The static index (Task L, unchanged by Task M)

`components/services/ServicesIndex.tsx` (558 lines). Harness suite [20] results:

| check | assertion | result |
|---|---|---|
| S1 | 14 entries rendered at once | pass |
| S2 | none clipped / ellipsised | pass |
| S3 | entries are NOT navigation: no `cursor: pointer`, no link/button inside | pass (`cursors` all ≠ pointer, `interactiveInEntries: 0`) |
| S4 | grouped by backend `category` | pass (`groups` non-empty strings) |
| S5 | section ≤ 1.15 × viewport at 1440×900 | pass |
| S6 | desktop multi-column (≥2) | pass |
| S7 | exactly one interactive control (`#start`) | pass |

**Hover-me cues:** `ServicesIndex.tsx:513-514` renders
`<span class="service-entry__cue"><span class="service-entry__cue-glyph">▶</span> Preview</span>`;
CHECK S8d measured `cue opacity=1` on hover. VERIFIED-REAL.

**One shared floating card:** `ServicePreviewCard` is imported at exactly two places, both in
`ServicesIndex.tsx` (`:12` the component, `:534` the single instance). CHECK S8a reports
`cards: 1`; CHECK S8h proves switching rows morphs the **same DOM node** (`sameNode:true`).

**Mobile bottom sheet:** `ServicePreviewCard.tsx:144` →
``className={`vip${sheet ? " vip--sheet" : ""} …`}`` — the sheet variant exists and is toggled by
viewport. A dedicated check asserting the 390 px sheet was **not found** in the harness →
PRESENT-UNTESTED.

**Lazy loading:** `sceneRegistry.ts` declares 14 `() => import("./scenes/…")` loaders plus a
memoised `loadGeneric()`. `ServicesIndex.tsx:217-222` warms `prefetchScenes(slugs, 3)` on
`requestIdleCallback`, and `:239` prefetches on row focus/hover.

**F-5-003 — CHECK S8o CONTRADICTS THE IMPLEMENTATION (MEDIUM, CONFIRMED).**
S8o asserts `none is fetched on page load`, but `ServicesIndex.tsx:214-221` deliberately warms
three scenes as soon as the section is idle, and `sceneRegistry.ts`'s own header comment says
"the first three scenes are warmed once the section is idle, so the hover itself never waits on
the network". Measured output (identical in both full runs):
```
15 scene chunks (…), fetched before any hover 6, after one hover 6
```
Verdict: **STALE / SELF-CONTRADICTORY CHECK** — Task M added both the prefetch and a check that
forbids prefetch. The check cannot pass unless the prefetch is removed.

### Storyboards and the registry

`sceneRegistry.ts:19-36` maps exactly 14 slugs:

```
software-solutions, business-growth, graphic-designing, marketing, ai-solutions,
e-commerce, mobile-app-development, web-development, ui-ux-design, cloud-and-devops,
cybersecurity, data-and-analytics, it-consulting, automation
```

Verified against live data in this audit: `curl http://localhost:5001/api/services` returned
exactly these 14 slugs in the same order. **14 scene components exist**
(`AiScene, AutomationScene, CloudScene, CommerceScene, ConsultingScene, DataScene, DesignScene,
GrowthScene, MarketingScene, MobileScene, SecurityScene, SoftwareScene, UiUxScene, WebScene`) plus
`GenericScene` and `SceneFrame` = 16 files under `components/services/scenes/`.

Fallback: `loadScene()` → unknown slug → `loadGeneric()`; a loader that rejects also falls back
(`sceneRegistry.ts:56-67`). VERIFIED-REAL.

**F-5-004 — CHECK S8n FAILS: 2 OF 14 SERVICES NEVER OPEN A CARD (HIGH, CONFIRMED — reproduced in
both full runs).**
```
web-development: cards=0 | web-development: scene=null | web-development: title mismatch |
web-development: frames=0 anims=0 | web-development: playing=null | automation: cards=0
```
The harness gives each row three attempts with a 260 ms park + 560 ms settle
(`verify-three.mjs:4499-4514`) and the card still does not open. Rows 1–7 and 9–13 do open
(S8a–S8m pass and the failure list is capped at 6 strings, of which 5 belong to
`web-development` and 1 to `automation`).
Verdict: **REAL REGRESSION** (fails 2/2 runs). Root cause **SUSPECTED, not proven** — the card
floats over the schedule, so a row whose rect is covered by the previously-open card or by the
sticky navbar would swallow the hover; the harness parks the pointer at (4,4) first, which should
prevent that, so a genuine open-timer/focus bug for those two rows is the likelier explanation.
Isolation (single-row repro) was **NOT PERFORMED — NOT VERIFIED**.

**F-5-005 — S8p AND S8q ALSO END AT `cards=0` (MEDIUM, CONFIRMED — 2/2 runs).**
- `CHECK S8p — 12 rapid switches keep exactly one card and a bounded heap` → `cards=0, heap growth 0.00 MB`.
  The heap assertion passes trivially because there is no card to measure.
- `CHECK S8q — reduced motion: the preview opens with a STATIC scene` →
  `{"cards":0,"static":null,"animations":-1,"cardAnimations":-1}`.
  Under `prefers-reduced-motion: reduce` the card **does not open at all** after three attempts
  (`verify-three.mjs:4635-4659`). If confirmed, this is an accessibility defect: reduced-motion
  users lose the preview entirely. Classified **REAL FAILURE** (2/2 runs); root cause NOT VERIFIED.

**F-5-006 — S8r FAILS AS COLLATERAL (LOW, CONFIRMED).** Output
`scene luma σ [["software-solutions",15],["ai-solutions",8]]; pairwise differing pixels 36%` —
only 2 of the 4 sampled scenes (`SCENE_SHOTS = software-solutions, business-growth, ai-solutions,
cybersecurity`) reported, because the others were not open when sampled. Depends on F-5-004.

### Retired checks — is the old "no hover" suite still contradicting the new behaviour?

| old check | state | evidence |
|---|---|---|
| `CHECK S8` "hovering an entry changes no computed style (no affordance)" | **RETIRED** | `verify-three.mjs:4251-4257` — "CHECK S8 is RETIRED (Task M) … would contradict the requested behaviour" |
| S1–S7 (static schedule, no pointer cursor) | **kept unchanged** | they assert layout, not "no hover"; S3 still requires `cursor ≠ pointer` on entries, which the implementation satisfies (the card opens on hover but the row is not a link) |
| harness header comment `:19` "Services Index (static, every discipline visible, **no hover affordance**)" | **STALE DOC** | contradicts S8a–S8r; a comment only |
| `PROJECT_NOTES.md §50` | lists S8a–S8q as replacements | the actual file also has **S8r**, which §50 omits → doc drift |

**Verdict: no stale *assertion* contradicts the new behaviour. Two stale *documents* do
(the harness header at `:19` and `PROJECT_NOTES.md §50`'s incomplete list).**

---

## 5.5 Product cards — Showcase Tile

| requirement | evidence | status |
|---|---|---|
| surface actually opaque | CHECK 76e2 `background-color rgb(255, 255, 255)` and the assertion `/^rgb\(/.test(...)` (an `rgba()` with alpha < 1 would print `rgba`) | VERIFIED-REAL |
| spotlight | `ProductCards.tsx:166` `<span className="tile__spotlight" />`; CHECK 76e `spotlight:true` | VERIFIED-REAL |
| conic border sweep | documented at `ProductCards.tsx:33-35` and implemented in `globals.css` `.tile__*`; **no harness check asserts the sweep** | PRESENT-UNTESTED |
| sheen | `ProductCards.tsx:156` `<span className="tile__sheen" />` | VERIFIED-REAL (present) |
| arrow slide | `ProductCards.tsx:209` `.tile__cta-arrow` | PRESENT-UNTESTED (no check) |
| exactly one LIVE node | CHECK 76e `nodes_green:1` | VERIFIED-REAL |
| tone-aware staging | `ProductCards.tsx:68-69` `stageTone()` returns `light\|dark\|none`; CHECK 76e `tone:"none"` (honest for a logo-less product) | VERIFIED-REAL |
| Visit link correctness | `ProductCards.tsx:211-212` `target="_blank"` + `rel="noopener noreferrer"`; CHECK 76e3 passes (or honestly reports `href:null`) | VERIFIED-REAL |
| `logoId` | `ProductCards.tsx:39` documents the contract; seed products have `logoId: null` → monogram fallback (CHECK 76e4) | VERIFIED-REAL |
| missing logo | CHECK 76e4 `monogram:true, stage:true` — never an empty stage | VERIFIED-REAL |
| missing URL | CHECK 76e3 `href:null` — the Visit row is omitted rather than broken | VERIFIED-REAL |
| very long names | **no check**; `Product.name` is capped at 120 chars by `productRules` (`admin.routes.js:62`) | PRESENT-UNTESTED |
| featured tile rule | CHECK 76f `count<3 ? featured===0 : featured===1` — with 4 products, `featured:1` | VERIFIED-REAL |
| reduced motion / layouts 0/1/2/3/6 | `PROJECT_NOTES.md §50` lists "0/1/2/3/6 layouts" T-checks; suite [12] passed all | VERIFIED-REAL |

**Verdict: 10 of 13 requirements VERIFIED-REAL, 3 PRESENT-UNTESTED. Nothing fake.**

---

## 5.6 Hub — wiring, packets, card-04, double socket

| item | evidence | status |
|---|---|---|
| living connectors / flowing gradient | CHECK 96 `flows:5, bases:5`; CHECK 97 stops `["rgb(33,44,101)","rgb(55,105,169)",…]` | VERIFIED-REAL |
| 2 travelling packets per connector, 10 total, cap 15 | CHECK 96 `packets:10` | VERIFIED-REAL |
| packets ride the real path | CHECK 98 `onPath:true, moved:[24.29,24.29]` | VERIFIED-REAL |
| reduced motion → no packets, static lines stay | CHECK 101 `packets:0, animation:none, opacity:1` | VERIFIED-REAL |
| paused off-screen | CHECK 100 `inView:false → play:"paused"` | VERIFIED-REAL |
| card-04 bottom spacing | `globals.css:2081` comment "Task L — card-04 bottom-spacing fix" + `:2081` rule block; suites [13]/[19] pass at 1920/1440/1366/1024/768/390 | VERIFIED-REAL |
| single socket circle per endpoint | `ServicesHub.tsx:285-290` comment: "There used to be a second ring at the socket … the endpoint read as two concentric circles. The socket is now [single]"; `.hub-card__socket` at `globals.css:2113` | VERIFIED-REAL |
| logo never overlaps a card | suites [13]/[19] overflow/collision checks pass | VERIFIED-REAL |

**The specific defect alleged in task §0(d) — that the card-04 fix *removed* the packets — is NOT
present today: packets, flows and bases all measure non-zero.** (prompt.md §B1 described exactly
that regression; it was repaired before this HEAD.)

---

## 5.7 Start-Your-Project form — field by field vs the Task L spec

| Task L requirement | code evidence | status |
|---|---|---|
| stepper with labelled progress rail | `StartProjectForm.tsx:516-528` — "Step N of 4" + `role="progressbar"` + `aria-label="Project brief progress"` | VERIFIED-REAL |
| back/next preserving data | `goToStep()` at `:366`; state lives in one object | VERIFIED-REAL |
| Review step with an Edit link per section | `:45` step list, `:826-860` `form-review` with `.form-review__edit` "Edit" per section | VERIFIED-REAL |
| inputs ≥ 48 px | asserted by the harness (suite [10] passed) | VERIFIED-REAL |
| labels not placeholder-only | visible `<label>` + `id`-linked errors (`:682`, `:816`) | VERIFIED-REAL |
| autocomplete / inputmode / type | present on the contact fields | VERIFIED-REAL |
| phone-OR-email rule explained up front | `:486` "Three short steps and a review — no account…" + contact helper copy | PRESENT-UNTESTED (no dedicated check) |
| services chips from the backend | `service` step reads `api.services`; CHECK 63 proves one public source | VERIFIED-REAL |
| inline validation + error summary, `role="alert"`, focus moved | `:357-360` (focus-in-effect comment), `:549` summary `role="alert"`, `:682`/`:816` inline `role="alert"`, `:886` submit error `role="alert"` | VERIFIED-REAL |
| 400/429/5xx mapped to distinct friendly messages | harness suite [10] intercepts and passed | VERIFIED-REAL |
| double-submit guard | `isSending` gate | VERIFIED-REAL |
| draft in sessionStorage ONLY, cleared on success | `:49`, `:277-306`; `:295` `delete payload.website` (honeypot never persisted); `:306` clear on success | VERIFIED-REAL |
| honeypot untouched + invisible | `website` field, never persisted, harness asserts untouched | VERIFIED-REAL |
| visible privacy line | present in the form footer | VERIFIED-REAL |
| SuccessModal: reference ID + copy, 3-step "what happens next", Send another, focus trap/Escape, confetti | `SuccessModal.tsx:39-41` three steps, `:62-68` `navigator.clipboard.writeText` with an insecure-context fallback, `:21` `referenceId`, `:48` "Focus trap + Escape come from Modal", `:21` fixed confetti geometry (no `Math.random`) | VERIFIED-REAL |
| mobile layout | suite [5] 390×844 passed | VERIFIED-REAL |

**Verdict: 16/17 VERIFIED-REAL, 1 PRESENT-UNTESTED. This is the most completely delivered
frontend feature after the hero.**

---

## 5.8 Admin portal

| page | route | guard | notes |
|---|---|---|---|
| Overview | `/admin/dashboard` | `app/admin/(portal)/layout.tsx` → `<AdminShell>`; server-side `requireAuth` on every API call | `DashboardClient.tsx` 264 lines |
| Homepage Logos | `/admin/logos` | same | `LogosManager.tsx` 885 lines — the largest admin component |
| Products | `/admin/products` | same | `ProductsManager.tsx` 382 |
| Product Presets | `/admin/product-presets` | same | `ProductPresetsManager.tsx`; CHECK 76c |
| Project Requests | `/admin/submissions` | same | `SubmissionsManager.tsx` 422 |
| Visitors | `/admin/visitors` | same | `VisitorsManager.tsx` |
| Notifications | `/admin/notifications` | same | `NotificationsManager.tsx` 472 (push composer) |
| Admins & Access | `/admin/team` | **`requireRole("super_admin")` on the API** (`admin.routes.js:57`); UI hides items via `superOnly` (`AdminShell.tsx:159`) | `TeamManager.tsx` 519 |
| My Account | `/admin/account` | same | `AccountPanel.tsx` |

**Route guard:** `admin/layout.tsx:7` sets `robots: { index: false, follow: false }`;
`admin/(portal)/layout.tsx` wraps everything in `AdminShell`, which calls
`api.auth.me()` and routes to `/admin/login` on 401. Server-side protection is the `requireAuth`
on the API, not the UI (correct: `auth.js:15-20` says so explicitly).

**Role gating in UI AND server:** UI — `AdminShell.tsx:159`
`items.filter((item) => !item.superOnly || admin?.role === "super_admin")`;
server — only `/team` is role-gated. **A non-super admin sees a reduced sidebar but the API would
still accept its writes to logos/products/submissions** (see F-3-003).

**Loading / empty / error:** all 12 manager components import `EmptyState`/`Spinner`/error
handling (`grep -l` returned all 12). Harness CHECK 70-76d passed (sidebar groups, plain-language
labels, AdminPageHeader, browser titles, every route resolves, Product Presets isolation).

**F-5-007 — ADMIN SCREENS RENDER RAW BACKEND ERROR STRINGS (LOW, CONFIRMED).**
Seven components pass a raw message into a toast/dialog `description`:
```
LogosManager.tsx:709            description={error.message}
NotificationsManager.tsx:392    description={listState.error.message}
ProductsManager.tsx:233         description={listState.error.message}
SubmissionsManager.tsx:222      description={listState.error.message}
TeamManager.tsx:255             description={error.message}
TemplatesPanel.tsx:215          description={error}
VisitorsManager.tsx:155         description={listState.error.message}
```
These are **admin-only** screens and backend 4xx messages are authored copy, so impact is low —
but `TemplatesPanel.tsx:215` passes `error` (an unknown value) rather than `error.message`, and a
5xx in a non-production environment returns the raw internal message (`errorHandler.js:44` only
genericises when `env.isProd`).

**Crash on empty data:** no `undefined.map` / unchecked access patterns found in the managers
(`grep -rn "\.map("` in admin components is always preceded by a `?? []` or a state guard).
**NOT exhaustively verified — PARTIAL.**
