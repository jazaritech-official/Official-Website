"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/brand/Logo";
import { Spinner } from "@/components/ui/Spinner";
import {
  AnalyticsIcon,
  CloseIcon,
  InboxIcon,
  LayersIcon,
  LogoutIcon,
  MenuIcon,
  PaletteIcon,
  UsersIcon,
} from "@/components/icons";
import type { AdminSession } from "@/types/api";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: AnalyticsIcon },
  { href: "/admin/logos", label: "Logos", icon: PaletteIcon },
  { href: "/admin/products", label: "Products", icon: LayersIcon },
  { href: "/admin/submissions", label: "Submissions", icon: InboxIcon },
  { href: "/admin/visitors", label: "Visitors", icon: UsersIcon },
];

const TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/logos": "Logos",
  "/admin/products": "Products",
  "/admin/submissions": "Submissions",
  "/admin/visitors": "Visitors",
};

function SidebarContent({
  pathname,
  admin,
  onLogout,
  onNavigate,
}: {
  pathname: string;
  admin: AdminSession | null;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-5">
        <Link href="/admin/dashboard" aria-label="Jazari admin — dashboard" onClick={onNavigate}>
          <Logo variant="horizontal" sizes="160px" className="h-7 w-auto" />
        </Link>
        <span className="rounded-full border border-line bg-surface-elevated px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted">
          Admin
        </span>
      </div>

      <nav aria-label="Admin" className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200 ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface-elevated hover:text-foreground"
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-line px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <ThemeToggle variant="full" className="flex-1" />
          <button
            type="button"
            onClick={onLogout}
            className="btn btn-ghost btn-icon text-muted hover:text-danger"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogoutIcon size={17} />
          </button>
        </div>
        {admin && (
          <p className="truncate text-xs text-muted" title={admin.email}>
            Signed in as <span className="font-medium text-foreground">{admin.email}</span>
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Authenticated portal chrome: verifies the session via GET /api/auth/me,
 * redirects to /admin/login when it fails (the backend still guards every
 * API route), and provides sidebar + top bar navigation.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api.auth
      .me()
      .then((session) => {
        if (!active) return;
        setAdmin(session);
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        router.replace("/admin/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      router.replace("/admin/login");
    }
  }, [router]);

  const title = TITLES[pathname] ?? "Admin";

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Logo variant="icon" sizes="48px" className="size-12" />
          <Spinner label="Verifying session" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent pathname={pathname} admin={admin} onLogout={logout} />
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-[var(--z-sticky)] bg-[var(--overlay)] transition-opacity duration-300 lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
      />
      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-[var(--z-navigation)] flex w-72 flex-col border-r border-line bg-surface transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          className="btn btn-ghost btn-icon absolute right-3 top-4"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        >
          <CloseIcon size={18} />
        </button>
        <SidebarContent
          pathname={pathname}
          admin={admin}
          onLogout={logout}
          onNavigate={() => setMobileOpen(false)}
        />
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-[var(--z-sticky)] flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
          <button
            type="button"
            className="btn btn-ghost btn-icon lg:hidden"
            aria-label="Open navigation"
            aria-controls="admin-sidebar"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <MenuIcon size={19} />
          </button>

          <div className="min-w-0">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted">
              Jazari Tech <span aria-hidden="true">/</span> Admin
            </p>
            <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted sm:inline-flex">
              {admin?.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="btn btn-outline btn-sm"
              aria-label="Sign out"
            >
              <LogoutIcon size={15} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export default AdminShell;
