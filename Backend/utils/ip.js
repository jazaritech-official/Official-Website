import net from "node:net";

/**
 * Client IP extraction.
 *
 * Trust level comes from `TRUST_PROXY` (set via app.set("trust proxy", …)),
 * so Express only honours X-Forwarded-For hops we actually proxy for —
 * arbitrary clients cannot forge their address through a trusted chain.
 */
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    // req.ip already resolves the trusted chain; use the left-most value that
    // survives Express' trust-proxy handling as a fallback for raw lists.
    const candidate = (req.ip || "").trim() || forwarded.split(",")[0].trim();
    if (candidate) return candidate;
  }
  return req.ip || req.socket?.remoteAddress || "";
}

/**
 * Normalize any IP shape into a stable dedupe key:
 *  - IPv4-mapped IPv6 (::ffff:127.0.0.1) unwrapped to IPv4
 *  - IPv6 expanded → canonical compressed lowercase form
 *  - loopback and unspecified addresses kept distinct
 */
export function normalizeIp(rawIp) {
  if (!rawIp) return "unknown";

  let ip = String(rawIp).trim().toLowerCase();
  // Strip IPv6 zone id (fe80::1%eth0) and surrounding brackets.
  ip = ip.replace(/%.*$/, "").replace(/^\[|\]$/g, "");

  // Zone / port artifacts from some proxies (e.g. "1.2.3.4:5678").
  if (ip.includes(":") && ip.split(":").length === 2 && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
    ip = ip.split(":")[0];
  }

  if (net.isIPv4(ip)) return ip;

  if (net.isIPv6(ip)) {
    // ::ffff:a.b.c.d → a.b.c.d
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
    if (mapped) return mapped[1];
    return compressIpv6(ip);
  }

  return ip;
}

/** Canonical lowercase compressed IPv6 representation. */
function compressIpv6(address) {
  const groups = expandIpv6Groups(address);
  if (!groups) return address;

  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < 8; i += 1) {
    if (groups[i] === 0) {
      if (curStart === -1) curStart = i;
      curLen += 1;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  const parts = groups.map((group) => group.toString(16));
  if (bestLen < 2) return parts.join(":");

  const head = parts.slice(0, bestStart).join(":");
  const tail = parts.slice(bestStart + bestLen).join(":");
  return `${head}::${tail}`;
}

function expandIpv6Groups(address) {
  const [head, tail] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];

  // Embedded IPv4 tail (e.g. ::ffff:192.168.0.1) already handled by unwrap.
  if (headGroups.some((g) => g.includes(".")) || tailGroups.some((g) => g.includes("."))) {
    return null;
  }

  const fill = 8 - (headGroups.length + tailGroups.length);
  if (address.includes("::") && fill < 0) return null;
  const middle = address.includes("::") ? new Array(fill).fill("0") : [];

  const all = [...headGroups, ...middle, ...tailGroups];
  if (all.length !== 8) return null;

  const groups = all.map((g) => Number.parseInt(g || "0", 16));
  return groups.every((g) => Number.isFinite(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

export default getClientIp;
