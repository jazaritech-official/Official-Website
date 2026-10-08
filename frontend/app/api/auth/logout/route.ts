/**
 * BFF route: POST /api/auth/logout
 *
 * Always re-emits the session cookie as cleared (host-only, `Max-Age=0`) so the
 * browser cannot keep a session the server has already forgotten.
 */
import { forwardAuth } from "@/lib/authBff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return forwardAuth(request, "logout", { method: "POST", clearSession: true });
}
