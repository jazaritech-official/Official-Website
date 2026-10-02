import type { NextConfig } from "next";

// The API origin is read from the environment so components never hardcode it.
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
let apiHost = "localhost";
let apiProtocol = "http";
let apiPort: string | undefined = "5000";
try {
  const parsed = new URL(apiUrl);
  apiHost = parsed.hostname;
  apiProtocol = parsed.protocol.replace(":", "");
  apiPort = parsed.port || undefined;
} catch {
  // Fall back to the localhost defaults above.
}

const nextConfig: NextConfig = {
  images: {
    // Product/logo artwork comes from the API (local dev driver or Cloudinary).
    remotePatterns: [
      {
        protocol: (apiProtocol === "https" ? "https" : "http") as "http" | "https",
        hostname: apiHost,
        ...(apiPort ? { port: apiPort } : {}),
        pathname: "/**",
      },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
    // Next 16 blocks upstream images that resolve to private IPs (SSRF guard).
    // In development the local storage driver serves uploads from
    // localhost:5000, which that guard rejects with a misleading 400. Only
    // hosts matching `remotePatterns` above can ever be fetched, so enabling
    // it here re-opens exactly the pattern-approved localhost API — set
    // NEXT_PUBLIC_API_URL to the real API host in production.
    dangerouslyAllowLocalIP: true,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
};

export default nextConfig;
