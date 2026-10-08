/**
 * BFF route: POST /api/auth/password
 *
 * Self-service password change. The backend re-issues the session cookie on
 * success; the BFF re-emits it host-only so the current device stays signed in
 * on the frontend origin.
 */
import { forwardAuth } from "@/lib/authBff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return forwardAuth(request, "password", { method: "POST" });
}
