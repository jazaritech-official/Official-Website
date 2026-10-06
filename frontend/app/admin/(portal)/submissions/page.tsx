import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SubmissionsManager } from "@/components/admin/SubmissionsManager";

export const metadata: Metadata = { title: "Project Requests" };

export default function SubmissionsPage() {
  return (
    <>
      <AdminPageHeader
        group="Leads"
        title="Project Requests"
        purpose="People who filled the “Start Your Project” form. Mark each one New, Contacted or Closed."
        where="Created whenever someone submits the “Start Your Project” form on the public site."
      />
      <SubmissionsManager />
    </>
  );
}
