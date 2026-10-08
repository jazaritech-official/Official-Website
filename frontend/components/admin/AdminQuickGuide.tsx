"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDownIcon, InfoIcon } from "@/components/icons";

/** One line per section, in sidebar order — plain language for the owner. */
const SECTIONS: { name: string; href?: string; description: string }[] = [
  { name: "Overview", description: "Traffic, activity and what needs your attention — this page." },
  { name: "Homepage Logos", href: "/admin/logos", description: "The logo strip shown under the hero." },
  { name: "Products", href: "/admin/products", description: "The product cards shown on the homepage." },
  {
    name: "Product Presets",
    href: "/admin/product-presets",
    description: "Default highlight points that pre-fill a new product of that type.",
  },
  {
    name: "Project Requests",
    href: "/admin/submissions",
    description: "People who filled the “Start Your Project” form.",
  },
  { name: "Visitors", href: "/admin/visitors", description: "A privacy-respecting log of site visits." },
  { name: "Admins & Access", href: "/admin/team", description: "Who can sign in to this portal (Super Admin only)." },
  { name: "My Account", href: "/admin/account", description: "Your own name, email and password." },
];

const STORAGE_KEY = "jazari:admin:quick-guide-dismissed";

/** Tiny external store over localStorage (SSR-safe, no setState-in-effect). */
const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage unavailable — show the guide
  }
}
const getServerSnapshot = () => false;
function notify() {
  listeners.forEach((callback) => callback());
}

/**
 * A dismissible "What each section does" card for Overview. The dismissal is
 * remembered per viewer in localStorage inside try/catch — if storage is
 * unavailable (private mode, blocked cookies) the guide still renders normally.
 */
export function AdminQuickGuide() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(true);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    notify();
  };

  if (dismissed) return null;

  return (
    <section aria-labelledby="admin-guide-heading" className="card p-5" data-admin-quick-guide="visible">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex rounded-lg bg-accent-soft p-2 text-accent" aria-hidden="true">
            <InfoIcon size={16} />
          </span>
          <h2 id="admin-guide-heading" className="text-base font-semibold text-foreground">
            What each section does
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={open}
            aria-controls="admin-guide-list"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide" : "Show"}
            <ChevronDownIcon size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm text-muted" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>

      {open ? (
        <dl id="admin-guide-list" className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.name} className="flex flex-col gap-0.5 border-l-2 border-line pl-3">
              <dt className="text-sm font-semibold text-foreground">
                {section.href ? (
                  <a href={section.href} className="hover:text-accent">
                    {section.name}
                  </a>
                ) : (
                  section.name
                )}
              </dt>
              <dd className="text-xs leading-relaxed text-muted">{section.description}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export default AdminQuickGuide;
