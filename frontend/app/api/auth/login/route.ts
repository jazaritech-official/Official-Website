/**
 * BFF route: POST /api/auth/login
 *
 * Filesystem routes take precedence over the `/api/:path*` rewrite, so this
 * handler runs instead of the proxy. It forwards to the backend and re-emits the
 * session cookie host-only on the frontend origin (see `lib/authBff.ts`).
 */
import { forwardAuth } from "@/lib/authBff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return forwardAuth(request, "login", { method: "POST" });
}
