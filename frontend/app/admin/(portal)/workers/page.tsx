import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PayeesManager } from "@/components/admin/PayeesManager";

export const metadata: Metadata = { title: "Workers & Referrers" };

export default function WorkersPage() {
  return (
    <>
      <AdminPageHeader
        group="Business"
        title="Workers & Referrers"
        purpose="The people who do the work and the people who bring the client in. These are not accounts — nobody signs in here."
        where="Pickable in every order's Shares section. The owed / paid-out totals come from the orders themselves."
      />
      <PayeesManager />
    </>
  );
}
