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
  BellIcon,
  CloseIcon,
  CopyIcon,
  GearIcon,
  InboxIcon,
  LayersIcon,
  LogoutIcon,
  MenuIcon,
  PaletteIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";
import type { AdminRole, AdminSession } from "@/types/api";

interface NavItem {
  href: string;
  label: string;
  icon: typeof AnalyticsIcon;
  /** Visible only to Super Admins. The backend remains the real boundary. */
  superOnly?: boolean;
}

/**
 * Plain-language navigation. ROUTES ARE UNCHANGED — only the labels, the
 * grouping and the browser titles were rewritten so a non-technical owner can
 * read the sidebar. `#product-presets` is an in-page anchor on the Products
 * route (it is a panel there, not a separate route), so no bookmark breaks.
 */
interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const OVERVIEW_ITEM: NavItem = { href: "/admin/dashboard", label: "Overview", icon: AnalyticsIcon };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "content",
    label: "Content",
    items: [
      { href: "/admin/logos", label: "Homepage Logos", icon: PaletteIcon },
      { href: "/admin/products", label: "Products", icon: LayersIcon },
      { href: "/admin/products#product-presets", label: "Product Presets", icon: CopyIcon },
    ],
  },
  {
    id: "leads",
    label: "Leads",
    items: [
      { href: "/admin/submissions", label: "Project Requests", icon: InboxIcon },
      { href: "/admin/visitors", label: "Visitors", icon: UsersIcon },
    ],
  },
  {
    id: "engagement",
    label: "Engagement",
    items: [{ href: "/admin/notifications", label: "Notifications", icon: BellIcon }],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      { href: "/admin/team", label: "Admins & Access", icon: ShieldIcon, superOnly: true },
      { href: "/admin/account", label: "My Account", icon: GearIcon },
    ],
  },
];

const TITLES: Record<string, string> = {
  "/admin/dashboard": "Overview",
  "/admin/logos": "Homepage Logos",
  "/admin/products": "Products",
  "/admin/submissions": "Project Requests",
  "/admin/visitors": "Visitors",
  "/admin/notifications": "Notifications",
  "/admin/team": "Admins & Access",
  "/admin/account": "My Account",
};

function isActive(pathname: string, href: string): boolean {
  // In-page anchors (e.g. `#product-presets`) never take `aria-current`.
  return !href.includes("#") && pathname === href;
}

/** Human-readable role label — never rely on colour alone to convey role. */
export function roleLabel(role: AdminRole | undefined): string {
  return role === "super_admin" ? "Super Admin" : "Admin";
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { href, label, icon: Icon } = item;
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      data-admin-nav-label={label}
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
}

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
          <Logo variant="compact" sizes="72px" className="h-7" />
        </Link>
        <span className="rounded-full border border-line bg-surface-elevated px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted">
          Admin
        </span>
      </div>

      <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-3 pb-2">
        <div>
          <NavLink item={OVERVIEW_ITEM} pathname={pathname} onNavigate={onNavigate} />
        </div>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.superOnly || admin?.role === "super_admin");
          if (items.length === 0) return null;
          return (
            <div key={group.id} data-admin-nav-group={group.id}>
              <p className="px-3.5 pb-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted">
                {group.label}
              </p>
              <div className="space-y-1">
                {items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
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
          <div className="space-y-1.5">
            <p className="truncate text-xs text-muted" title={admin.email}>
              Signed in as <span className="font-medium text-foreground">{admin.name || admin.email}</span>
            </p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
                admin.role === "super_admin"
                  ? "border-accent/35 bg-accent-soft text-accent"
                  : "border-line bg-surface-elevated text-muted"
              }`}
            >
              <ShieldIcon size={12} />
              {roleLabel(admin.role)}
            </span>
          </div>
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

  // Frontend route guard (UX only): a normal admin must not reach /admin/team.
  // The backend `requireRole("super_admin")` remains the real security boundary.
  useEffect(() => {
    if (!ready) return;
    if (pathname === "/admin/team" && admin?.role !== "super_admin") {
      router.replace("/admin/dashboard");
    }
  }, [ready, pathname, admin, router]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      router.replace("/admin/login");
    }
  }, [router]);

  const title = TITLES[pathname] ?? "Admin";

  // Browser tab title, e.g. "Project Requests - Jazari Admin".
  useEffect(() => {
    if (!ready) return;
    document.title = `${title} - Jazari Admin`;
  }, [title, ready]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Logo variant="mark" sizes="48px" className="size-12" />
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
            {admin && (
              <span className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted sm:inline-flex">
                <span className="max-w-[12rem] truncate">{admin.name || admin.email}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${
                    admin.role === "super_admin"
                      ? "border-accent/35 bg-accent-soft text-accent"
                      : "border-line bg-surface-elevated text-muted"
                  }`}
                >
                  {roleLabel(admin.role)}
                </span>
              </span>
            )}
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

        <main key={pathname} className="admin-enter flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export default AdminShell;
