import { TeamManager } from "@/components/admin/TeamManager";

/**
 * Super-Admin team management. The sidebar hides this link for normal admins
 * and `AdminShell` redirects them away, but the real boundary is the backend
 * `requireRole("super_admin")` gate on `/api/admin/team`.
 */
export default function TeamPage() {
  return <TeamManager />;
}
