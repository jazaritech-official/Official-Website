import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { NotificationsManager } from "@/components/admin/NotificationsManager";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <AdminPageHeader
        group="Engagement"
        title="Notifications"
        purpose="Send browser notifications to everyone who opted in — announce a service, a launch or an offer. Compose from one of your services or write your own message."
        where="Shown as a device notification to visitors who enabled them on the public site."
      />
      <NotificationsManager />
    </>
  );
}
