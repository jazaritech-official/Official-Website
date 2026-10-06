import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  // Per-page titles render as e.g. "Project Requests - Jazari Admin".
  title: { default: "Admin", template: "%s - Jazari Admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
