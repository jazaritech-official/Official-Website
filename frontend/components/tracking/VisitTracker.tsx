"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

/**
 * Fires a single visit event per page load through the API client.
 * Failures are swallowed inside `trackVisit` so analytics can never affect
 * the experience. Never runs on admin routes.
 */
export function VisitTracker() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/admin")) return;
    void api.trackVisit({
      page: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || "",
    });
  }, []);

  return null;
}

export default VisitTracker;
