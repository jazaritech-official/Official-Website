import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { LogosManager } from "@/components/admin/LogosManager";

export const metadata: Metadata = { title: "Homepage Logos" };

export default function LogosPage() {
  return (
    <>
      <AdminPageHeader
        group="Content"
        title="Homepage Logos"
        purpose="The logo strip under the hero. Upload, clean backgrounds, reorder and hide."
        where="Renders in the “Our Products” logo wall on the homepage (and nowhere else)."
      />
      <LogosManager />
    </>
  );
}
