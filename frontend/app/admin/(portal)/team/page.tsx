import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TeamManager } from "@/components/admin/TeamManager";

export const metadata: Metadata = { title: "Admins & Access" };

/**
 * Super-Admin team management. The sidebar hides this link for normal admins
 * and `AdminShell` redirects them away, but the real boundary is the backend
 * `requireRole("super_admin")` gate on `/api/admin/team`.
 */
export default function TeamPage() {
  return (
    <>
      <AdminPageHeader
        group="Settings"
        title="Admins & Access"
        purpose="Who can sign in to this admin portal, which role they hold, and whether their access is active. Super Admin only."
      />
      <TeamManager />
    </>
  );
}
