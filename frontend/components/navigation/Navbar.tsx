"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ArrowRightIcon, CloseIcon, MenuIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";

const LINKS = [
  { href: "#home", label: "Home" },
  { href: "#products", label: "Products" },
  { href: "#services", label: "Services" },
  { href: "#start", label: "Contact" },
];

/**
 * Floating glass pill navigation: slightly larger at the top, shrinking and
 * gaining contrast on scroll. Mobile gets an animated disclosure panel with
 * Escape handling, focus management and full controls.
 */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  /* Scroll state — passive listener + rAF throttle, CSS var writes only. */
  useEffect(() => {
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      setScrolled(y > 16);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(y / max, 1) : 0);
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Mobile panel: Escape closes, focus moves in/out, outside click dismisses. */
  useEffect(() => {
    if (!open) return;

    firstLinkRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(event.target as Node) && !toggleRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-[var(--z-navigation)] pt-3 sm:pt-4">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-toast)] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-contrast"
      >
        Skip to main content
      </a>

      <div className="container-page">
        <div
          className={[
            "glass relative flex items-center justify-between gap-4 rounded-full transition-all duration-300",
            scrolled ? "px-3 py-2 shadow-[var(--shadow-card)]" : "px-4 py-3 sm:px-5 sm:py-3.5",
          ].join(" ")}
        >
          <Link
            href="#home"
            aria-label="Jazari Tech — home"
            className="shrink-0 rounded-full"
            onClick={() => setOpen(false)}
          >
            <Logo variant="horizontal" sizes="180px" priority className="h-7 w-auto sm:h-8" />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-muted transition-colors duration-200 hover:bg-surface hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Link href="#start" className="hidden sm:block">
              <Button size="sm" iconRight={<ArrowRightIcon size={15} />}>
                Get Started
              </Button>
            </Link>

            <button
              ref={toggleRef}
              type="button"
              className="btn btn-ghost btn-icon lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="transition-transform duration-300" style={{ transform: open ? "rotate(90deg)" : "none" }}>
                {open ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
              </span>
            </button>
          </div>

          {/* Scroll progress hairline */}
          <span
            aria-hidden="true"
            className="absolute inset-x-5 -bottom-px h-0.5 origin-left rounded-full bg-accent/80"
            style={{ transform: `scaleX(${progress})`, opacity: scrolled ? 1 : 0.45 }}
          />
        </div>

        {/* Mobile navigation */}
        <div
          id="mobile-menu"
          ref={panelRef}
          hidden={!open}
          className="lg:hidden"
        >
          <div className="glass mt-2 flex flex-col gap-1 rounded-3xl p-3 shadow-[var(--shadow-card)]">
            <nav aria-label="Mobile">
              {LINKS.map((link, index) => (
                <a
                  key={link.href}
                  ref={index === 0 ? firstLinkRef : undefined}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-surface"
                >
                  {link.label}
                  <ArrowRightIcon size={15} className="text-muted" />
                </a>
              ))}
            </nav>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-line px-2 pt-3">
              <ThemeToggle variant="full" />
              <Link href="#start" onClick={() => setOpen(false)} className="flex-1 sm:flex-none">
                <Button size="sm" className="w-full" iconRight={<ArrowRightIcon size={15} />}>
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
