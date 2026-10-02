import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jazaritech.com";
const SITE_NAME = "Jazari Tech Official";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Jazari Tech Official — Technology that moves your business forward",
    template: "%s — Jazari Tech Official",
  },
  description:
    "Jazari Tech builds software platforms, e-commerce, AI solutions, cloud infrastructure and digital products that help businesses scale with confidence.",
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  keywords: [
    "Jazari Tech",
    "software solutions",
    "web development",
    "mobile apps",
    "e-commerce development",
    "AI solutions",
    "cloud and devops",
    "cybersecurity",
    "IT consulting",
    "digital agency",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Jazari Tech Official — Technology that moves your business forward",
    description:
      "Software platforms, e-commerce, AI, cloud and digital products engineered for businesses that intend to scale.",
    images: [{ url: "/brand/logo-horizontal.png", alt: "Jazari Tech" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jazari Tech Official",
    description:
      "Software platforms, e-commerce, AI, cloud and digital products engineered for businesses that intend to scale.",
    images: ["/brand/logo-horizontal.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/brand/app-icon-main.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/brand/app-icon-main.png", sizes: "512x512" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f24" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Runs synchronously during HTML parsing — before first paint — so the stored
 * Light/Dark/System preference is applied without a theme flash.
 */
/**
 * Runs synchronously during HTML parsing — before first paint — so the stored
 * theme is applied without a flash, and the first-load choreography (`js-intro`)
 * is only enabled when JavaScript is available AND motion is allowed. Without
 * JS (or under prefers-reduced-motion) all content renders fully visible.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("jazari-theme");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";document.documentElement.classList.add("js");if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.classList.add("js-intro");}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
