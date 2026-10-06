import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { VisitorsManager } from "@/components/admin/VisitorsManager";

export const metadata: Metadata = { title: "Visitors" };

export default function VisitorsPage() {
  return (
    <>
      <AdminPageHeader
        group="Leads"
        title="Visitors"
        purpose="A privacy-respecting log of site visits, used for analytics and security. No personal data is shown."
        where="Recorded automatically on every page of the public site."
      />
      <VisitorsManager />
    </>
  );
}
