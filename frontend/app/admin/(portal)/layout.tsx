import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

/** All routes inside this group require a valid admin session. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
