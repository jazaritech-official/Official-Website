import type { MetadataRoute } from "next";

/**
 * Web manifest — declares the real Jazari mark for install/OS surfaces.
 *
 * Icons are generated from the owner logo by `scripts/build-logo-assets.mjs`
 * (`public/brand/icon-192.png`, `public/brand/icon-512.png`). No unrelated PWA
 * behaviour (service worker, offline app shell, display overrides) is added.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jazari Tech Official",
    short_name: "Jazari Tech",
    description:
      "Software platforms, e-commerce, AI, cloud and digital products engineered for businesses that intend to scale.",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#212C65",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
