/**
 * BFF route: GET /api/auth/me
 *
 * Forwards the incoming cookie to the backend and returns its answer untouched.
 * Always `no-store`: a cached "me" would keep an admin signed in after logout.
 */
import { forwardAuth } from "@/lib/authBff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return forwardAuth(request, "me", { method: "GET" });
}
