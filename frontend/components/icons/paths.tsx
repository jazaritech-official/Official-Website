/**
 * Inline SVG artwork for the Jazari icon system.
 * Hand-drawn on a 24×24 grid, 1.6 stroke — no icon library.
 */

export const paths = {
  code: (
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>
  ),
  cloud: (
    <>
      <path d="M17.2 19H6.8A3.8 3.8 0 0 1 6.4 11.5 6 6 0 0 1 18 10.4a4.3 4.3 0 0 1-.8 8.6Z" />
      <path d="M9.5 15.2a3 3 0 0 0 5.2 1.4" />
    </>
  ),
  chip: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M10 2.5v2M14 2.5v2M10 19.5v2M14 19.5v2M2.5 10h2M2.5 14h2M19.5 10h2M19.5 14h2" />
    </>
  ),
  shield: <path d="M12 3l7 3v5.5c0 4.3-2.9 8.1-7 9.5-4.1-1.4-7-5.2-7-9.5V6Z" />,
  cybersecurity: (
    <>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 8.1-7 9.5-4.1-1.4-7-5.2-7-9.5V6Z" />
      <polyline points="9 12 11.2 14.2 15.4 10" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3c3.2 1.6 5 4.8 5 8.4l-2.4 3.4H9.4L7 11.4C7 7.8 8.8 4.6 12 3Z" />
      <circle cx="12" cy="10" r="1.8" />
      <path d="M9.4 15.2 7.5 19.5l3.1-1.2M14.6 15.2l1.9 4.3-3.1-1.2" />
      <path d="M10.6 18.2c.4 1.4 1.2 2.3 1.4 2.8.2-.5 1-1.4 1.4-2.8" />
    </>
  ),
  chart: (
    <>
      <path d="M3 20h18" />
      <polyline points="4 16 9.5 10.5 13.5 14 20 6.5" />
      <polyline points="15.5 6.5 20 6.5 20 11" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 20h18" />
      <rect x="5" y="12" width="3.4" height="6" rx="1" />
      <rect x="10.3" y="8" width="3.4" height="10" rx="1" />
      <rect x="15.6" y="4.5" width="3.4" height="13.5" rx="1" />
    </>
  ),
  cart: (
    <>
      <circle cx="9.5" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
      <path d="M3 4h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.3L21 8H6" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10.5v3a2 2 0 0 0 2 2h1.5L18 20V4L7.5 8.5H6a2 2 0 0 0-2 2Z" />
      <path d="M7.5 15.5 8.7 20.5" />
      <path d="M20.5 9.5a3.6 3.6 0 0 1 0 5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.2a8.8 8.8 0 0 0 0 17.6c1.4 0 2-.9 2-1.8 0-1.4-1.3-1.7-1.3-2.9 0-.9.7-1.6 1.7-1.6h1.6a4.8 4.8 0 0 0 4.8-4.8c0-3.7-4-6.5-8.8-6.5Z" />
      <circle cx="8" cy="9" r="1.1" />
      <circle cx="12" cy="7" r="1.1" />
      <circle cx="16" cy="9.4" r="1.1" />
      <circle cx="7.2" cy="13.6" r="1.1" />
    </>
  ),
  pen: (
    <>
      <path d="M12.5 20.5H21" />
      <path d="M16.6 3.9a2.1 2.1 0 0 1 3 3L8.4 18.1l-4 1 1-4Z" />
      <path d="M14.6 5.9l3 3" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    </>
  ),
  automation: (
    <>
      <rect x="3" y="4" width="7" height="6" rx="2" />
      <rect x="14" y="14" width="7" height="6" rx="2" />
      <path d="M6.5 10v4.5a3 3 0 0 0 3 3H14" />
      <path d="M17.5 14V9.5a3 3 0 0 0-3-3H10" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.6 4 5.7 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.7-4-9s1.4-6.4 4-9Z" />
    </>
  ),
  mobile: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.6" />
      <path d="M11 18.5h2" />
    </>
  ),
  handshake: (
    <>
      <path d="M8.5 12.5 11 15a1.7 1.7 0 0 0 2.4 0l.4-.4" />
      <path d="m13.6 13.4 1.7-1.7a1.7 1.7 0 0 0 0-2.4l-4.9-4.9a2 2 0 0 0-2.5-.2L4 7.6" />
      <path d="M3 8.5 6.5 5l4 1.4" />
      <path d="m3 8.5 4.5 6.7a1.7 1.7 0 0 0 2.6.2" />
      <path d="m20.9 8.4-4.4-2.6M21 8.5l-2.9 4.3" />
    </>
  ),
  consulting: (
    <>
      <path d="M4 5.5h11a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9l-3.5 3v-3H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
      <path d="M20 10.5h.5a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5V17l-3 2.5" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9.2 17.4a6.5 6.5 0 1 1 5.6 0v1.6a1.5 1.5 0 0 1-1.5 1.5h-2.6a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="M10 21.5h4" />
    </>
  ),
  website: (
    <>
      <rect x="2.8" y="4" width="18.4" height="16" rx="2.4" />
      <path d="M2.8 8.6h18.4" />
      <circle cx="6" cy="6.3" r=".7" />
      <circle cx="8.6" cy="6.3" r=".7" />
      <path d="M6.5 12.5h6M6.5 16h9" />
    </>
  ),
  devops: (
    <>
      <circle cx="6.6" cy="12" r="3.4" />
      <circle cx="17.4" cy="12" r="3.4" />
      <path d="M10 12h4" />
      <path d="M6.6 8.6h4.8a3.4 3.4 0 0 1 0 6.8H6.6" opacity=".55" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.6L12 12.2 3.5 7.6Z" />
      <path d="m3.5 12.4 8.5 4.6 8.5-4.6" />
      <path d="m3.5 16.9 8.5 4.6 8.5-4.6" opacity=".55" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6" />
      <path d="M17.5 14.6A5.6 5.6 0 0 1 21 20" />
    </>
  ),
  star: (
    <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8Z" />
  ),
  arrowRight: (
    <>
      <path d="M4 12h15" />
      <polyline points="13 6 19 12 13 18" />
    </>
  ),
  arrowUpRight: (
    <>
      <path d="M7 17 17 7" />
      <polyline points="8 7 17 7 17 16" />
    </>
  ),
  chevronDown: <polyline points="6 9.5 12 15.5 18 9.5" />,
  chevronRight: <polyline points="9.5 6 15.5 12 9.5 18" />,
  check: <polyline points="20 6.5 9.5 17 4 11.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  moon: <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.7 8.7 0 1 0 10.7 10.7Z" />,
  system: (
    <>
      <rect x="2.8" y="4.5" width="18.4" height="12.5" rx="2.2" />
      <path d="M9 20.5h6M12 17v3.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" />
      <path d="M10.5 10v6.5M13.5 10v6.5" />
    </>
  ),
  upload: (
    <>
      <path d="M20.5 15.5V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3.5" />
      <polyline points="7.5 8 12 3.5 16.5 8" />
      <path d="M12 3.5v11" />
    </>
  ),
  download: (
    <>
      <path d="M20.5 15.5V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3.5" />
      <polyline points="7.5 11 12 15.5 16.5 11" />
      <path d="M12 3.5v12" />
    </>
  ),
  edit: (
    <>
      <path d="M11 4.5H5.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V13" />
      <path d="M17.2 3.3a2.1 2.1 0 0 1 3 3L12 14.5l-3.6.9.9-3.6Z" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 6.2A7.7 7.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3 3.6" />
      <path d="M6.5 7.6A16.5 16.5 0 0 0 2.5 12S6 18 12 18a7.9 7.9 0 0 0 3.4-.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </>
  ),
  externalLink: (
    <>
      <path d="M13.5 4.5H19.5V10.5" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
    </>
  ),
  logout: (
    <>
      <path d="M14.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5" />
      <polyline points="9 8 5 12 9 16" />
      <path d="M5 12h9.5" />
    </>
  ),
  grip: (
    <>
      <circle cx="9.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2.5" />
      <path d="M6.5 15H5.5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2H13a2 2 0 0 1 2 2v1" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M17.66 6.34v4.16" />
      <path d="M17.66 6.34h-4.16" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13.5h4.5l1.6 2.6h5.8l1.6-2.6H21" />
      <path d="M5.6 5h12.8l2.6 8.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4.5Z" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;
