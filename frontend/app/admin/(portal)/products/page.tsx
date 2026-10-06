import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ProductsManager } from "@/components/admin/ProductsManager";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <>
      <AdminPageHeader
        group="Content"
        title="Products"
        purpose="Your published products. Add each product's name, logo, link and highlight points below."
        where="Renders in the product cards on the homepage. “Product Presets” (below) pre-fill the highlights for a product type."
      />
      <ProductsManager />
    </>
  );
}
