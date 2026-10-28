# FORENSIC 05c — Frontend: Accessibility, Performance, SEO, Brand (Phase 5, part c)

---

## 5.9 Accessibility

### Automated results actually run in this audit

| gate | result |
|---|---|
| `npm run audit:contrast` | **65 / 65 token pairs pass WCAG AA (≥ 4.5:1)**, exit 0; 6 documented decorative exemptions (`--slate`, `--border`, `--border-strong`, `--grid-tick`, `--growth`, `--accent`) |
| harness suite [8] "Accessibility structure" | all pass |
| harness suite [4] `prefers-reduced-motion` | all pass |
| harness L82–L88 | `L82` button+aria-expanded+aria-controls, `L83` sr-only label, `L84` decorative SVG `aria-hidden`, `L85` service list always in the DOM, `L86` skip link, `L87` exactly one `h1`, `L88` landmarks — **all pass** |

Note: the claimed **51** contrast pairs baseline is now **65**. The number grew; nothing was
removed (the exemption list is documented inside the script itself).

### Manual code inspection

| item | evidence | verdict |
|---|---|---|
| Heading order | SSR HTML of `/`: one `<h1>`; then `<h2 id="products-showcase-heading">`, `product-cards`, `hub`, `services`, `start`, `brand-statement`; one `<h3 tabindex="-1">` (form step title) inside the `start` section; three footer `<h2 class="text-xs…">` column headings | PASS — no level skipped |
| Landmarks | `<header>`, `<nav aria-label="Primary">`, `<nav aria-label="Mobile">`, `<nav aria-label="Footer quick links">`, `<main id="main">`, `<footer>` | PASS |
| Skip link | `components/navigation/Navbar.tsx:87` "Skip to main content" → `a[href="#main"]`; `main#main` exists | PASS |
| Focus-visible | 18 `focus-visible` rules in `globals.css` | PASS |
| Focus management — VIP card | CHECK S8k `aria-describedby="service-preview-card"`, `aria-controls`, `ctaFocusable:true`; `S8l` Escape closes; `S8m` arrow keys move between disciplines; `S8e` `role="dialog"` + `aria-modal="false"` (deliberately non-modal) | PASS |
| Focus management — bottom sheet | `ServicePreviewCard.tsx:167` close button with `aria-label`; focus trap/Escape come from `components/ui/Modal.tsx` for the success dialog | PRESENT-UNTESTED (no check for the sheet specifically) |
| Keyboard operability of hover-only features | rows open on focus (`S8k`), arrows move, Escape closes, `#start` CTA focusable inside the card | PASS |
| Touch equivalent | `pointer: coarse` media blocks at `globals.css:1544`, `:2181`, `:3590`; mobile tooltip list verified by suite [5] | PASS |
| Colour-only information | status is carried by text (`LIVE`, `Preview`, step labels), not colour alone | PASS |
| Touch targets ≥ 44 px | harness suite [10] and [5] assert ≥ 44 px on 390×844 | PASS |
| `aria-live` usage | **exactly one** in the whole app: `admin/Pagination.tsx:48` `aria-live="polite"` | see F-5-008 |

**F-5-008 — NO `aria-live` ON PUBLIC ASYNC STATE CHANGES (MEDIUM, CONFIRMED).**
`grep -rn "aria-live" frontend/app frontend/components` returns a single hit, in the admin
pagination. The public page changes state asynchronously with no live region: the hero's
`data-hero-state` transitions (assembled→…→docked), the VIP preview opening/closing, the services
loading→empty→error transitions, and the form's submit status.
The error summaries do use `role="alert"` (`StartProjectForm.tsx:549,682,816,886`), which is
correct for errors — but nothing announces the hero delivery or the preview dialog.
Recommended fix (NOT APPLIED): add a visually-hidden `aria-live="polite"` region for the hero and
the preview.

**F-5-009 — REDUCED-MOTION COVERAGE IS GLOBAL BUT SHALLOW (LOW, CONFIRMED).**
`globals.css` contains **30** `animation: … infinite` declarations and only **14**
`@media (prefers-reduced-motion: reduce)` blocks. Coverage is achieved by one global rule at
`globals.css:3599-3605`:
```
*, *::before, *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  ...
}
```
plus targeted `animation: none` for the hero glow (`:1614`), services trace (`:2667`), VIP card
(`:3052`), hub logo (`:3306`), view-transitions (`:3378`), logo marquee (`:3881`, which also
switches to `flex-wrap: wrap` — a genuine static equivalent), admin enter (`:3929`).
Verdict: **every animation IS covered** by the global rule; the per-component blocks add proper
static *equivalents* for the six that need them. Not a defect — recorded because a naive count
(30 vs 14) looks like a gap.

**Keyboard operability of hover-only features:** VERIFIED by S8d/S8k/S8l/S8m and by suite [5].
**Hover content has a keyboard equivalent.**

---

## 5.10 Performance

### Infinite / long-running animations

30 `animation: … infinite` declarations in `globals.css` (full list captured; notable ones):
`jt-marquee-left` (42 s, line 778), `jt-hero-wire` (6.5 s, 1145), `jt-hero-breathe` (6 s, 1302),
`jt-spin 110s` (1669), `jt-trace-travel` (1873), `jt-hub-breathe` (9 s, 1945),
`jt-index-trace` (26 s, 2239), `vip-spin 22s` + `vip-ignite` (2762-2763), `jt-vip-live` (2.4 s,
2846), `jt-hub-wire-flow` (3206), `jt-hub-wire-ripple` (3272).

Off-screen / hidden-tab pausing — **measured, not assumed**:

| mechanism | evidence |
|---|---|
| Hub wiring paused off-screen | CHECK 100 → `{"inView":false,"play":"paused"}` |
| Logo marquee paused | `LogoMarquee.tsx:213-230` rAF-driven with an explicit decay/stop; `:56` `loading="lazy"` |
| Services index idle "nudge" gated by in-view | `ServicesIndex.tsx:206` `setInterval` only when `nudgeAllowed`; `:44` comment says it is skipped entirely otherwise |
| Hero idle auto-open gated by in-view + tab visibility | `HeroMark.tsx:364` `if (!inView \|\| document.hidden \|\| …) return` |
| `.is-inview` class gating for section animations | used by hub, services index (CHECK 100/101) |

**F-5-010 — `ServicesIndex.tsx:206` RUNS A `setInterval` (LOW, CONFIRMED).**
`window.setInterval(tick, NUDGE_MS * 2)` is created while `nudgeAllowed` is true and cleared in
the effect cleanup. It is not a leak, but it **is** the only repeating timer in the app; it is
gated by in-view state rather than paused by an IntersectionObserver. VERIFIED by code reading.

`will-change` usage — 4 declarations, all justified:
```
globals.css:712  will-change: opacity, transform;
globals.css:779  will-change: transform;
globals.css:1258 will-change: transform;   (preceded by the comment at :1254
                                             "`will-change` only while something is actually moving.")
globals.css:3685 will-change: transform;
```
No `will-change: filter`, no `will-change` on layout properties.

**Layout-triggering animated properties:** `grep -E "transition:" globals.css` — the animated
property set is `transform`/`opacity`/`stroke-dashoffset`/`background-position` (marquee/sweep).
`background-position` on `.tile__sheen` and the conic sweep does trigger paint but **not**
layout. **PARTIAL: a selector-by-selector audit of all 130 `transition:` declarations was NOT
performed — NOT VERIFIED.**

### Images

* `next/image` used in 6 components (`brand/Logo`, `LogoMarquee`, `ProductCards`,
  `LogosManager`, `ProductEditor`, `ProductsManager`).
* Raw `<img>` only twice, both admin-only inline previews of data-URIs
  (`LogosManager.tsx:492`, `:509`).
* `priority` on the navbar logo (`Navbar.tsx:107`) — correct, it is above the fold.
* `loading="lazy"` on the marquee (`LogoMarquee.tsx:56`).
* Formats: `next.config.ts` `formats: ["image/avif","image/webp"]`, `deviceSizes` up to 1920.

**F-5-011 — OPEN-GRAPH IMAGE IS A 2 MB LOGO PNG (LOW, CONFIRMED).**
`layout.tsx:46` / `:54` reference `/brand/logo-horizontal.png`, which is **2 076 908 bytes**
(measured) and is not 1200×630. Social scrapers will download 2 MB and crop badly.
Recommended fix (NOT APPLIED): generate a dedicated 1200×630 card image.

### Fonts

`layout.tsx:2,8,14` — `next/font/google` `Geist` + `Geist_Mono`, both `display: "swap"`.
Next self-hosts the files at build time, so there is **no third-party font request at runtime**.
VERIFIED.

### Third-party scripts

`grep -rn "<script" frontend/app --include=*.tsx` → exactly two, both inline and same-origin:
`layout.tsx:126` (theme bootstrap) and `:127` (Organization JSON-LD). **No tag manager, no
analytics, no chat widget.** VERIFIED.

### Client vs server components

* `"use client"` files: **40** (command: `grep -rl '"use client"' frontend/app frontend/hooks --include=*.tsx --include=*.ts`).
* `.tsx` files under `app/` + `components/`: **79**.
* Largest client components (lines): `StartProjectForm.tsx` 944, `LogosManager.tsx` 885,
  `HeroMark.tsx` 639, `ProductEditor.tsx` 564, `ServicesIndex.tsx` 558, `TeamManager.tsx` 519,
  `NotificationsManager.tsx` 472, `ServicesHub.tsx` 429, `SubmissionsManager.tsx` 422.
* The whole admin tree is client-side (expected for a dashboard); the public page's server
  components are `app/page.tsx`, `app/layout.tsx` and the section shells.

**F-5-012 — 40 OF 79 COMPONENTS ARE CLIENT COMPONENTS (MEDIUM, CONFIRMED).**
The public above-the-fold hero (`HeroMark.tsx`, 639 lines) is a client component, so its
JavaScript ships in the initial bundle. Measured initial JS: **724 868 raw / 224 439 gz across
11 chunks** (harness suite [25]), within the project's own 900 KB budget but +2.4 % vs the
Task L baseline.

### Hydration risk

`grep -rn "Math.random()" frontend/app frontend/components --include=*.tsx` → **no matches**.
`SuccessModal.tsx:21` explicitly documents "Fixed confetti geometry — no random values, so
renders stay stable". `Date.now()` appears only in effects/handlers.
`localStorage`/`sessionStorage` access is guarded: `publicContent.ts:142`
`if (typeof window === "undefined" || !window.localStorage) return null;` and
`StartProjectForm.tsx:265-277` documents the SSR-safe draft restore with a `document` guard.
**VERIFIED-REAL — no hydration-risky pattern found.**

---

## 5.11 SEO

| item | evidence | verdict |
|---|---|---|
| metadataBase / canonical | `layout.tsx:21` `metadataBase`, `:66` `alternates.canonical: "/"`; CHECK 91 "canonical link is present in the server-rendered head" | VERIFIED-REAL |
| Google verification | `layout.tsx:33` exact token `9sxNHd4zcWdftckBBUCKxc3hiD-qxOpxn03uZXvHChM`; CHECK 90 `count=1` | VERIFIED-REAL (exact string match confirmed) |
| Open Graph | `layout.tsx:42-49` type/url/siteName/title/description/image; CHECK 92 passes | VERIFIED-REAL |
| Twitter card | `layout.tsx:51-55` `summary_large_image` + image; CHECK 92 | VERIFIED-REAL |
| OG image exists | `/brand/logo-horizontal.png` exists (2 076 908 B) | VERIFIED but oversized — F-5-011 |
| robots.txt | `app/robots.ts` → `allow: "/"`, `disallow: ["/admin"]`, sitemap URL | VERIFIED-REAL |
| sitemap.xml | `app/sitemap.ts` → one entry, `lastModified: new Date()` | VERIFIED-REAL (single-page site) |
| JSON-LD validity | CHECK 93 parsed it: `{"type":"Organization","url":"https://jazaritech.com","logo":"https://jazaritech.com/brand/logo-main.png","sameAs":null}` | VERIFIED-REAL |
| noindex on admin | `app/admin/layout.tsx:7` `robots: { index: false, follow: false }`; CHECK 95 measured `<meta name="robots" content="noindex, nofollow"/>` | VERIFIED-REAL |
| favicon / icon / manifest | CHECK 56 (all four declared), 57 (all 200 + correct content types), 58 (3-frame ICO), 60 (manifest 192+512, theme `#212C65`), 61 (PNG magic bytes) | VERIFIED-REAL |
| exactly one `h1` | CHECK 94 `h1=1` | VERIFIED-REAL |
| `X-Robots-Tag` / per-page metadata | only the root layout declares `robots`; admin inherits from `admin/layout.tsx` | VERIFIED-REAL |

**No SEO gap found.** The only nit is the oversized OG image (F-5-011).

---

## 5.12 Brand compliance

### Required tokens

| token | occurrences in `globals.css` |
|---|---|
| `#212C65` Deep Navy | 3 |
| `#3D76BB` Technology Blue | 2 |
| `#A7B3C8` Official Slate | 2 |
| `#95C93D` Growth Green | 2 |

All four exist. VERIFIED-REAL.

### Hard-coded hex outside `globals.css`

Command: `grep -rn -E "#[0-9a-fA-F]{6}\b" frontend/app frontend/components frontend/lib frontend/hooks`

| file:line | value | verdict |
|---|---|---|
| `app/layout.tsx:82` | `#ffffff` theme-color (light) | acceptable — `viewport.themeColor` cannot read CSS vars |
| `app/layout.tsx:83` | `#0a0f24` theme-color (dark) | same |
| `app/manifest.ts:18-19` | `#ffffff`, `#212C65` | acceptable — manifest cannot read CSS vars; `#212C65` **is** a brand token |
| `components/sections/Hero.tsx:57-58` | `#000` inside a `mask-image` gradient | acceptable — masks are alpha-only |
| `components/sections/Hero.tsx:122` | `dark:bg-[#2f5f9e]` avatar tone | **VIOLATION** |
| `components/sections/Hero.tsx:123` | `bg-[#4a5a8f]` avatar tone | **VIOLATION** |
| `components/services/logoGeometry.ts:60-104+` | ~40 gradient stops (`#021d69` … `#1481ee`) | acceptable — this is the **traced logo artwork's real colours**; `PROJECT_NOTES §32` forbids hand-editing it |

**F-5-013 — TWO HARD-CODED BRAND-COLOUR VIOLATIONS (LOW, CONFIRMED).**
`Hero.tsx:122` and `:123` use arbitrary Tailwind hex values for the avatar social-proof circles
instead of `globals.css` tokens. Evidence above. Recommended fix (NOT APPLIED): use tokens.

### Growth Green beyond micro-accent

`grep -rn "95C93D\|var(--growth)" frontend/app/globals.css` → the token is defined and, per the
contrast script's own exemption note, is used for "atlas active tick + one packet head — Growth
Green micro accent, not text". Harness CHECK 97 measured the packet head as
`rgb(149, 201, 61)` = `#95C93D`, i.e. a small moving node.
**No large fill, no text colour, no background** was found using Growth Green.
`grep -rn "var(--growth)" globals.css` occurrences are limited to `.hub__packet`, ticks and dots.
**VERIFIED-REAL — the micro-accent rule holds.**

### `--scene-1..8` scoping

Defined at `globals.css:196-203` inside the top-level `:root` block (NOT scoped to `.scene*`).
Used only by `components/services/scenes/SceneFrame.tsx` (grep for `--scene-` in components →
one file).

**F-5-014 — `--scene-1..8` ARE DECLARED GLOBALLY (LOW, CONFIRMED).**
Claim M13 says "scoped to scenes only". Usage is confined; the *declaration* leaks into `:root`
where every component could reference it. Additionally `--scene-3: #9b7ce8` (violet) and
`--scene-4: #e07bb0` (magenta-pink) sit outside the stated "no orange/pink/purple" brand rule —
they are sanctioned by the Task M scene spec but contradict the brand sentence in
`PROJECT_NOTES.md §14`. Recorded as a documentation/brand conflict, not a bug.

### Palette audit for orange/pink/purple outside `--scene-*`

`grep -n -E "#(e0|d9|f0|c8)[0-9a-f]{4}" globals.css` outside the scene block → no matches beyond
the eight `--scene-*` definitions. **VERIFIED-REAL.**
