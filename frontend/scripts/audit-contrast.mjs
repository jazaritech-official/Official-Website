#!/usr/bin/env node
/**
 * WCAG contrast audit for the design system.
 *
 * Reads the light (`:root`) and dark (`.dark`) token blocks from
 * `app/globals.css`, then checks every token pair the interface actually
 * renders as *text* against the WCAG 2.1 AA thresholds:
 *
 * Every pair below is normal-size text (body copy, labels, links, chips,
 * placeholders), so the required ratio is the WCAG AA 4.5:1 throughout.
 *
 * No dependencies and no browser: it is pure colour maths on the source of
 * truth (the CSS tokens), so it runs in milliseconds and can gate CI.
 *
 * Tokens that are documented as decorative ONLY (e.g. `--slate`, which is the
 * blueprint grid tick colour) are deliberately excluded — see EXEMPT.
 *
 * Usage: node scripts/audit-contrast.mjs
 * Exit code 0 = all pairs pass; 1 = at least one failure.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(HERE, "..", "app", "globals.css");

const AA_NORMAL = 4.5;

/* ------------------------------------------------------------------ colour */

/** "#rgb" | "#rrggbb" -> [r, g, b]; null when the value is not a plain hex. */
function hexToRgb(value) {
  const raw = value.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
function luminance([r, g, b]) {
  const channel = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two [r,g,b] triples. */
function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Flatten `fg` at `alpha` over opaque `bg` (tinted chips/badges). */
const tint = (fg, bg, alpha) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

/** `color-mix`: blend `a` (weight `wA`) with `b` (weight `1 - wA`). */
const mix = (a, b, wA) => a.map((v, i) => v * wA + b[i] * (1 - wA));

/* ------------------------------------------------------------------ parsing */

/** Extract a `{ ... }` block that starts at `selector` (brace-matched). */
function readBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

/** `--token: value;` pairs whose value is a plain hex (skips var()/color-mix). */
function readHexTokens(block) {
  const out = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    const rgb = hexToRgb(match[2]);
    if (rgb) out[match[1]] = rgb;
  }
  return out;
}

/* --------------------------------------------------------------- test plan */

/**
 * `[themeToken, themeBackground, alphaOfBackgroundTint?, themes?]`.
 * `alpha` composites the *background* token at that opacity over the theme's
 * page background — exactly how `bg-<token>/12` renders — so tinted chips are
 * measured at their real, lighter background. `themes` restricts a pair to the
 * theme(s) where the interface actually renders it (e.g. the logo wordmark is
 * `text-primary` on light but `text-foreground` on dark).
 */
const PAIRS = [
  // Light + dark body/system text on every surface.
  ["foreground", "background"],
  ["foreground", "surface"],
  ["foreground", "surface-elevated"],
  ["foreground", "surface-sunken"],
  ["muted", "background"],
  ["muted", "surface"],
  ["muted", "surface-elevated"],
  ["muted", "surface-sunken"],
  ["muted-soft", "background"],
  ["muted-soft", "surface-elevated"],
  // Accent links / eyebrows / icons-as-text.
  ["accent", "background"],
  ["accent", "surface"],
  ["accent", "surface-elevated"],
  ["accent", "surface-sunken"],
  ["accent", "accent-soft"],
  ["primary", "background", undefined, ["light"]],
  // Status text on plain and on its own tinted chip.
  ["success", "background"],
  ["success", "success", 0.12],
  ["warning", "background"],
  ["warning", "warning", 0.12],
  ["danger", "background"],
  ["danger", "danger-soft"],
  ["growth-ink", "background"],
  // Growth tint used by the benefit check glyph in the notification opt-in
  // prompt as well as the status chips.
  ["growth-ink", "growth", 0.12],
];

/** Solid-on-solid pairs: `[textToken, backgroundToken]`. */
const SOLID_PAIRS = [
  ["primary-contrast", "primary"],
  ["accent-contrast", "accent"],
];

/**
 * The lightest services-card fill stop, mirroring `--service-fill-c`:
 * light = accent 92% + white; dark = accent 70% + the navy page background.
 */
const FILL_LIGHTEST = {
  light: { base: "white", weight: 0.92 },
  dark: { base: "background", weight: 0.7 },
};

/**
 * Documented-decorative tokens — never rendered as text, so exempt from AA.
 * Listed explicitly (rather than silently skipped) so the exemption is a
 * visible, reviewable decision.
 */
const EXEMPT = [
  ["slate", "blueprint grid ticks / crosshairs — decorative only"],
  ["border", "hairlines and dividers"],
  ["border-strong", "hairlines and dividers"],
  ["grid-tick", "blueprint crosshair colour (delegates to --slate)"],
  // Discipline Atlas (Task K) — micro-accent dots and node marks, never text.
  ["growth", "atlas active tick + one packet head — Growth Green micro accent, not text"],
  ["accent", "atlas node marks / selected tick / capacity gauge — decorative graphics"],
];

/*
 * Discipline Atlas (Task K) text pairs.
 *
 * The atlas renders text ONLY on the tokens already audited above:
 *   · discipline title          → foreground on surface
 *   · rail short line / index   → muted on surface
 *   · stage description / chips → muted on surface
 *   · stage CTA                 → accent on surface
 *   · hovered/filled row copy   → white on the `--service-fill-c` worst-case
 *     stop (the row reuses the exact same gradient as the previous card, so the
 *     existing service-fill check covers it).
 * No new text-on-background token pair is introduced, so PAIRS is unchanged.
 */

/* -------------------------------------------------------------------- run */

const css = readFileSync(CSS_PATH, "utf8");
const LIGHT = readHexTokens(readBlock(css, ":root {"));
// Match the theme block itself, not the `@custom-variant` declaration earlier
// in the file, which also contains the literal `.dark`.
const DARK = readHexTokens(readBlock(css, "\n.dark {"));
const THEMES = { light: LIGHT, dark: DARK };
// `primary-contrast` and `white` are cross-theme constants.
for (const tokens of Object.values(THEMES)) {
  tokens["primary-contrast"] = tokens["primary-contrast"] ?? hexToRgb("#ffffff");
  tokens.white = hexToRgb("#ffffff");
}

const results = [];
const push = (theme, fgToken, bgLabel, fg, bg, threshold) => {
  const value = ratio(fg, bg);
  results.push({ theme, fgToken, bgLabel, value, threshold, pass: value >= threshold });
};

for (const [theme, tokens] of Object.entries(THEMES)) {
  const page = tokens.background;
  if (!page) continue;

  for (const [fgToken, bgToken, alpha, themes] of PAIRS) {
    if (themes && !themes.includes(theme)) continue;
    const fg = tokens[fgToken];
    const baseBg = tokens[bgToken];
    if (!fg || !baseBg) continue;
    const bg = alpha ? tint(baseBg, page, alpha) : baseBg;
    const label = alpha ? `${bgToken}/${Math.round(alpha * 100)}` : bgToken;
    push(theme, fgToken, label, fg, bg, AA_NORMAL);
  }

  for (const [fgToken, bgToken] of SOLID_PAIRS) {
    const fg = tokens[fgToken];
    const bg = tokens[bgToken];
    if (!fg || !bg) continue;
    push(theme, fgToken, bgToken, fg, bg, AA_NORMAL);
  }

  /*
   * Services-card water-fill: white copy sits on the brand gradient. The
   * LIGHTEST stop (`--service-fill-c`, a color-mix in globals.css) is the
   * worst case, so it is measured here with the same blend the stylesheet uses.
   */
  const fillSpec = FILL_LIGHTEST[theme];
  const accent = tokens.accent;
  const fillBase = tokens[fillSpec.base];
  if (accent && fillBase) {
    const lightest = mix(accent, fillBase, fillSpec.weight);
    push(
      theme,
      "service-fill-contrast",
      `service-fill-c (accent ${Math.round(fillSpec.weight * 100)}% + ${fillSpec.base})`,
      tokens.white,
      lightest,
      AA_NORMAL,
    );
  }
}

/* ---------------------------------------------------------------- reporting */

const failed = results.filter((r) => !r.pass);
const width = Math.max(...results.map((r) => r.fgToken.length));
const bgWidth = Math.max(...results.map((r) => r.bgLabel.length));

console.log(`WCAG 2.1 AA contrast audit — ${CSS_PATH}\n`);
for (const theme of ["light", "dark"]) {
  console.log(`── ${theme} ─────────────────────────────────────────────`);
  for (const r of results.filter((x) => x.theme === theme)) {
    const mark = r.pass ? "✓" : "✗";
    console.log(
      `  ${mark} ${r.fgToken.padEnd(width)} on ${r.bgLabel.padEnd(bgWidth)}  ` +
        `${r.value.toFixed(2).padStart(5)}:1  (need ${r.threshold.toFixed(1)})`,
    );
  }
  console.log("");
}

console.log("Exempt (documented decorative, never text):");
for (const [token, why] of EXEMPT) console.log(`  · --${token} — ${why}`);
console.log("");

if (failed.length > 0) {
  console.error(`✗ ${failed.length} of ${results.length} pairs below WCAG AA:`);
  for (const r of failed) {
    console.error(`   ${r.theme} · ${r.fgToken} on ${r.bgLabel} = ${r.value.toFixed(2)}:1`);
  }
  process.exit(1);
}

console.log(`✓ all ${results.length} token pairs meet WCAG AA (>= 4.5:1)`);
