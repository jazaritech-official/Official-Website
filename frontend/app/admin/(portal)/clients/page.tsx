import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ClientsManager } from "@/components/admin/ClientsManager";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <>
      <AdminPageHeader
        group="Business"
        title="Clients"
        purpose="The people and companies you bill. Add a client here and they become selectable in every new order."
        where="Used by the Orders page and printed on the client's bill. Clients are deactivated, never deleted, once they have orders."
      />
      <ClientsManager />
    </>
  );
}
