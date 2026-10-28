import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OrdersManager } from "@/components/admin/OrdersManager";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <>
      <AdminPageHeader
        group="Business"
        title="Orders"
        purpose="Every job you take: what it costs, what has been paid, and who gets a share when the money comes in."
        where="Nothing here is public. The Bill tab of an order produces the client-facing invoice you can download as an 8K PNG or an SVG."
      />
      <OrdersManager />
    </>
  );
}
