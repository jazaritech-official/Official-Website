/**
 * Admin sign-in page.
 *
 * Server component so the temporary `DIAGNOSTICS` flag can be read at request
 * time (runtime env, not inlined at build time) and passed to the client form —
 * the footer hint and `/api/diag-session` therefore always agree. The form
 * itself is the client component `./LoginForm`.
 */
import type { Metadata } from "next";
import AdminLoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

// Reads `process.env.DIAGNOSTICS` at request time, so toggling diagnostics in the
// hosting dashboard takes effect without a rebuild.
export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  const diagnosticsEnabled = (process.env.DIAGNOSTICS ?? "").trim() === "true";
  return <AdminLoginForm diagnosticsEnabled={diagnosticsEnabled} />;
}
