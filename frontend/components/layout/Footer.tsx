import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Reveal } from "@/components/motion/Reveal";
import { ServiceLinks } from "@/components/layout/ServiceLinks";
import { ArrowRightIcon } from "@/components/icons";

const QUICK_LINKS = [
  { href: "#home", label: "Home" },
  { href: "#products", label: "Products" },
  { href: "#hub", label: "Services hub" },
  { href: "#services", label: "Services" },
  { href: "#start", label: "Start your project" },
];

// Placeholder social destinations — replace with the official profile URLs.
const SOCIALS = [
  { label: "LinkedIn", short: "in", href: "https://www.linkedin.com/" },
  { label: "X", short: "X", href: "https://x.com/" },
  { label: "Facebook", short: "f", href: "https://www.facebook.com/" },
  { label: "GitHub", short: "gh", href: "https://github.com/" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer relative z-[1] border-t border-line">
      <span aria-hidden="true" className="grid-crosshair hidden lg:block" style={{ left: "calc(50% - 5px)", top: -6 }} />
      <hr aria-hidden="true" className="hairline" />
      <div className="container-page py-14">
        <Reveal className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* Brand */}
          <div>
            <Logo variant="full" sizes="96px" className="h-9" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Jazari Tech Official builds software, commerce, AI and cloud systems for businesses
              that intend to scale — engineered properly the first time.
            </p>
            <ul className="mt-5 flex gap-2.5">
              {SOCIALS.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-xs font-semibold lowercase text-muted transition-colors duration-200 hover:border-accent/50 hover:text-accent"
                  >
                    {social.short}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick links */}
          <nav aria-label="Footer quick links">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Quick links</h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-muted transition-colors duration-200 hover:text-foreground">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Services (API-driven) */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Services</h2>
            <div className="mt-4">
              <ServiceLinks limit={6} />
            </div>
          </div>

          {/* CTA */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Work with us</h2>
            <p className="mt-4 text-sm text-muted">
              Tell us what you’re building. We respond with a clear scope, timeline and next step.
            </p>
            <Link
              href="#start"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-accent/60 hover:text-accent"
            >
              Start your project
              <ArrowRightIcon size={15} />
            </Link>
          </div>
        </Reveal>

        {/* Privacy notice */}
        <p className="mt-12 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-xs text-muted">
          <span className="badge-dot" aria-hidden="true" />
          We log visits for analytics and security.
        </p>

        {/* Bottom bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-xs text-muted">
          <p>
            © {year} Jazari Tech Official. All rights reserved.
          </p>

          {/* Discreet admin entry — security lives in backend authentication. */}
          <Link
            href="/admin/login"
            aria-label="Administration"
            title="Administration"
            className="inline-flex size-5 items-center justify-center rounded-full text-foreground opacity-[0.14] transition-opacity duration-300 hover:opacity-80 focus-visible:opacity-80"
          >
            <span aria-hidden="true" className="size-1.5 rotate-45 bg-current" />
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
