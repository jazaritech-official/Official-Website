import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TreasuryManager } from "@/components/admin/TreasuryManager";

export const metadata: Metadata = { title: "Treasury" };

export default function TreasuryPage() {
  return (
    <>
      <AdminPageHeader
        group="Business"
        title="Treasury"
        purpose="The company box (Khazana): what the business kept, what is still to come in, and what is owed to people."
        where="Super Admin only. Settings here drive the default split on every new order and the details printed on the bill."
      />
      <TreasuryManager />
    </>
  );
}
