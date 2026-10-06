import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AccountPanel } from "@/components/admin/AccountPanel";

export const metadata: Metadata = { title: "My Account" };

export default function AccountPage() {
  return (
    <>
      <AdminPageHeader
        group="Settings"
        title="My Account"
        purpose="Your own sign-in details — display name, email and password."
      />
      <AccountPanel />
    </>
  );
}
