import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { WorkTypesManager } from "@/components/admin/WorkTypesManager";

export const metadata: Metadata = { title: "Work Types" };

/**
 * WORK TYPES — the owner's own price list.
 * "30 Seconds Video = 500", "1 Minute Video = 1000": added here, no code
 * changes. Every order snapshots the name and price it was created with, so
 * editing a price here never rewrites history.
 */
export default function WorkTypesPage() {
  return (
    <>
      <AdminPageHeader
        group="Business"
        title="Work Types"
        purpose="Your price list, in your own words: add a work type, set its price, and every new order can pick it with one tap."
        where="Used by the New order form. Existing orders keep the name and price they were created with — changing a price here only affects future orders."
      />
      <WorkTypesManager />
    </>
  );
}
