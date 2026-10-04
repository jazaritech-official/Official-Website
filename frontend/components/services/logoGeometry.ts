/**
 * logoGeometry.ts — GENERATED FILE. Do not edit by hand.
 *
 * Produced by:  frontend/scripts/trace-logo.mjs   (npm run trace:logo)
 * Source:       frontend/public/Main Logo.png — 4096x4096 png, genuine alpha
 * Method:       connected-component segmentation of the source alpha mask,
 *               crack-following contour extraction and Douglas-Peucker
 *               simplification (tolerance 2px in the 4096 source space,
 *               i.e. 0.05% of the mark). Straight artwork edges stay exactly
 *               straight; the artwork's rounded outer corners are reproduced as
 *               tight polylines bounded by that tolerance instead of fitted
 *               Beziers, because measurement showed Bezier corner fitting
 *               DEGRADED silhouette fidelity (IoU 0.872-0.959) versus 0.998 for
 *               the simplified polygon. Gradients are least-squares fitted over
 *               interior pixels and sampled into 16 stops.
 * ViewBox:      0 0 4096 4096  (source pixel coordinates — no rescaling, no lossy steps)
 * Measured:     silhouette IoU 0.99839 vs the source alpha mask (threshold 128)
 *
 * The five pieces match the real artwork. `fold` is carved out of the right band
 * along the crease detected inside it so it can move independently.
 */

export const LOGO_VIEWBOX = "0 0 4096 4096";

export type LogoPieceId = "top" | "right" | "bottom" | "fold" | "leaf";

export interface LogoGradientStop {
  offset: number;
  color: string;
}

export interface LogoGradient {
  /** userSpaceOnUse axis, in source pixel coordinates */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: LogoGradientStop[];
}

export interface LogoPiece {
  id: LogoPieceId;
  label: string;
  /** inline SVG path data — real traced geometry, never a primitive */
  d: string;
  gradient: LogoGradient;
}

export const LOGO_PIECES: LogoPiece[] = [
  {
    id: "top",
    label: "Top band",
    d: "M 2799 838 L 2804 871 L 2802 1099 L 2101 1100 L 2097 1103 L 1773 1404 L 1744 1427 L 1723 1450 L 1582 1577 L 1437 1714 L 788 2309 L 739 2375 L 709 2431 L 693 2475 L 683 2531 L 683 2588 L 691 2646 L 530 2479 L 223 2145 L 187 2095 L 177 2076 L 164 2045 L 154 2007 L 148 1954 L 151 1895 L 161 1850 L 177 1808 L 200 1769 L 225 1736 L 271 1691 L 508 1490 L 674 1355 L 696 1333 L 784 1261 L 1013 1058 L 1039 1038 L 1062 1014 L 1148 940 L 1602 526 L 1615 517 L 1928 223 L 1951 206 L 1976 193 L 2021 180 L 2080 180 L 2122 193 L 2164 219 L 2421 467 L 2509 548 L 2532 573 L 2607 641 L 2633 669 L 2661 692 L 2755 784 L 2773 798 L 2789 817 L 2799 838 Z",
    gradient: {
      x1: 675,
      y1: 2616,
      x2: 2108,
      y2: 196,
      stops: [
        { offset: 0.0000, color: "#021d69" },
        { offset: 0.0667, color: "#022171" },
        { offset: 0.1333, color: "#03277b" },
        { offset: 0.2000, color: "#042e88" },
        { offset: 0.2667, color: "#043492" },
        { offset: 0.3333, color: "#053a9c" },
        { offset: 0.4000, color: "#053da1" },
        { offset: 0.4667, color: "#053b9f" },
        { offset: 0.5333, color: "#05399a" },
        { offset: 0.6000, color: "#0644a6" },
        { offset: 0.6667, color: "#0b60c6" },
        { offset: 0.7333, color: "#1383ed" },
        { offset: 0.8000, color: "#1586f1" },
        { offset: 0.8667, color: "#1382ee" },
        { offset: 0.9333, color: "#1380ed" },
        { offset: 1.0000, color: "#1481ee" },
      ],
    },
  },
  {
    id: "bottom",
    label: "Bottom band",
    d: "M 2880 3331 L 2351 3823 L 2289 3873 L 2226 3903 L 2182 3916 L 2147 3922 L 2062 3922 L 2019 3915 L 1980 3903 L 1942 3886 L 1900 3861 L 1843 3810 L 1287 3208 L 1100 3015 L 807 2723 L 788 2697 L 768 2658 L 752 2596 L 752 2530 L 758 2497 L 768 2467 L 795 2417 L 837 2371 L 922 2299 L 958 2264 L 976 2251 L 1192 2055 L 1214 2038 L 1246 2006 L 1307 1955 L 2179 2829 L 2198 2845 L 2218 2868 L 2610 3247 L 2638 3270 L 2679 3295 L 2737 3318 L 2816 3331 L 2875 3328 L 2879 3328 L 2880 3331 Z",
    gradient: {
      x1: 2308,
      y1: 3850,
      x2: 1305,
      y2: 1965,
      stops: [
        { offset: 0.0000, color: "#032980" },
        { offset: 0.0667, color: "#032a84" },
        { offset: 0.1333, color: "#032d8a" },
        { offset: 0.2000, color: "#04308f" },
        { offset: 0.2667, color: "#043495" },
        { offset: 0.3333, color: "#05389c" },
        { offset: 0.4000, color: "#063da4" },
        { offset: 0.4667, color: "#0743ad" },
        { offset: 0.5333, color: "#0849b6" },
        { offset: 0.6000, color: "#0a4fbe" },
        { offset: 0.6667, color: "#0b57c6" },
        { offset: 0.7333, color: "#0c5dce" },
        { offset: 0.8000, color: "#0d63d3" },
        { offset: 0.8667, color: "#0f68d8" },
        { offset: 0.9333, color: "#106cdc" },
        { offset: 1.0000, color: "#106ddd" },
      ],
    },
  },
  {
    id: "right",
    label: "Right band",
    d: "M 2260 2809 L 2270 2796 L 2298 2777 L 2358 2728 L 2550 2566 L 2818 2329 L 2828 2321 L 2837 2321 L 2841 2318 L 3550 1665 L 3943 2051 L 3968 2084 L 3985 2116 L 3996 2156 L 3999 2180 L 3998 2220 L 3994 2243 L 3975 2295 L 3943 2338 L 3855 2421 L 3507 2766 L 3486 2783 L 3354 2910 L 3009 3221 L 2985 3239 L 2953 3256 L 2914 3269 L 2882 3275 L 2816 3276 L 2776 3269 L 2744 3259 L 2689 3233 L 2650 3201 L 2260 2809 Z",
    gradient: {
      x1: 2831,
      y1: 3268,
      x2: 3549,
      y2: 1675,
      stops: [
        { offset: 0.0000, color: "#065ed0" },
        { offset: 0.0667, color: "#0763d4" },
        { offset: 0.1333, color: "#0967d8" },
        { offset: 0.2000, color: "#0b6bda" },
        { offset: 0.2667, color: "#0c6fde" },
        { offset: 0.3333, color: "#0f75e4" },
        { offset: 0.4000, color: "#127be8" },
        { offset: 0.4667, color: "#137fec" },
        { offset: 0.5333, color: "#1583f0" },
        { offset: 0.6000, color: "#1686f2" },
        { offset: 0.6667, color: "#1689f4" },
        { offset: 0.7333, color: "#178cf7" },
        { offset: 0.8000, color: "#188ff8" },
        { offset: 0.8667, color: "#1992f9" },
        { offset: 0.9333, color: "#1992f9" },
        { offset: 1.0000, color: "#1992f8" },
      ],
    },
  },
  {
    id: "fold",
    label: "Right fold",
    d: "M 2828 2321 L 2829 2030 L 2839 1984 L 2849 1961 L 2862 1941 L 2898 1903 L 2984 1829 L 3251 1580 L 3289 1549 L 3327 1533 L 3373 1530 L 3407 1539 L 3446 1562 L 3551 1665 L 2841 2318 L 2837 2321 L 2828 2321 Z",
    gradient: {
      x1: 2836,
      y1: 2312,
      x2: 3484,
      y2: 1607,
      stops: [
        { offset: 0.0000, color: "#021f6f" },
        { offset: 0.0667, color: "#032270" },
        { offset: 0.1333, color: "#032575" },
        { offset: 0.2000, color: "#042879" },
        { offset: 0.2667, color: "#042b7f" },
        { offset: 0.3333, color: "#042e85" },
        { offset: 0.4000, color: "#05318b" },
        { offset: 0.4667, color: "#053591" },
        { offset: 0.5333, color: "#063897" },
        { offset: 0.6000, color: "#063b9c" },
        { offset: 0.6667, color: "#063ea1" },
        { offset: 0.7333, color: "#063fa5" },
        { offset: 0.8000, color: "#0641a7" },
        { offset: 0.8667, color: "#0642a9" },
        { offset: 0.9333, color: "#0743aa" },
        { offset: 1.0000, color: "#0643a9" },
      ],
    },
  },
  {
    id: "leaf",
    label: "Green leaf",
    d: "M 2817 804 L 3612 805 L 3655 811 L 3685 820 L 3730 843 L 3764 869 L 3796 904 L 3821 943 L 3834 978 L 3844 1027 L 3846 1832 L 3842 1833 L 3532 1525 L 3462 1452 L 2842 834 L 2817 804 Z",
    gradient: {
      x1: 3833,
      y1: 1799,
      x2: 2841,
      y2: 815,
      stops: [
        { offset: 0.0000, color: "#378c10" },
        { offset: 0.0667, color: "#3d9010" },
        { offset: 0.1333, color: "#449510" },
        { offset: 0.2000, color: "#4c9c12" },
        { offset: 0.2667, color: "#57a313" },
        { offset: 0.3333, color: "#60ac14" },
        { offset: 0.4000, color: "#69b215" },
        { offset: 0.4667, color: "#72b817" },
        { offset: 0.5333, color: "#7abf19" },
        { offset: 0.6000, color: "#82c61a" },
        { offset: 0.6667, color: "#89cc1a" },
        { offset: 0.7333, color: "#8fd01a" },
        { offset: 0.8000, color: "#92d21a" },
        { offset: 0.8667, color: "#93d31a" },
        { offset: 0.9333, color: "#90d01a" },
        { offset: 1.0000, color: "#8acb17" },
      ],
    },
  },
];

/** Assembled-logo fidelity, asserted by the browser harness too. */
export const LOGO_TRACE_META = {
  source: "frontend/public/Main Logo.png",
  method: "alpha-mask connected components + crack-following contours + Douglas-Peucker + Bezier corner fitting",
  dpTolerance: 2,
  gradientBins: 16,
  pieces: 5,
  silhouetteIou: 0.99839,
  meanColorError: 4.194,
} as const;

export function logoGradientId(id: LogoPieceId): string {
  return "jazari-logo-grad-" + id;
}
