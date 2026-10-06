import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DashboardClient } from "@/components/admin/DashboardClient";

export const metadata: Metadata = { title: "Overview" };

export default function DashboardPage() {
  return (
    <>
      <AdminPageHeader
        group="Overview"
        title="Overview"
        purpose="Your business at a glance — visitor traffic, project requests and a quick map of where everything lives."
      />
      <DashboardClient />
    </>
  );
}
