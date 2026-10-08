import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ProductPresetsManager } from "@/components/admin/ProductPresetsManager";

export const metadata: Metadata = { title: "Product Presets" };

export default function ProductPresetsPage() {
  return (
    <>
      <AdminPageHeader
        group="Content"
        title="Product Presets"
        purpose="Default highlight points for each product type. When you create a product and pick its type, these suggestions fill its highlights — you can always edit, reorder or ignore them."
        where="Presets never render on the public site; they only pre-fill a product's highlight points in the Products editor."
      />
      <ProductPresetsManager />
    </>
  );
}
