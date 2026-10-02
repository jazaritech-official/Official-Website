"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Reveal } from "@/components/motion/Reveal";
import { Counter } from "@/components/motion/Counter";
import { Skeleton } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { LayersIcon, RefreshIcon } from "@/components/icons";
import type { PublicLogo } from "@/types/api";

/** Minimum visual items per row so the loop always fills ultrawide viewports. */
const MIN_ROW_ITEMS = 12;

/** Turn a display name into a short, safe monogram for the image fallback. */
function monogram(logo: PublicLogo): string {
  const source = (logo.displayName || logo.name || "").replace(/[^\p{L}\p{N} ]/gu, " ").trim();
  if (!source) return "★";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function LogoItem({ logo, clone }: { logo: PublicLogo; clone: boolean }) {
  const [failed, setFailed] = useState(false);
  const label = logo.displayName || logo.name;
  const link = logo.websiteUrl;

  // Optical normalization: every logo shares one optical box, contained and
  // undistorted. Slight per-index size variation keeps the wall from feeling flat.
  const style: CSSProperties = {
    "--logo-opacity": clone ? 0.92 : 1,
  } as CSSProperties;

  const inner = (
    <span className="logo-item__frame">
      {failed ? (
        <span
          className="logo-item__img text-h3 font-semibold tracking-tight text-muted"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          aria-hidden="true"
        >
          {monogram(logo)}
        </span>
      ) : (
        <Image
          src={logo.secureUrl}
          alt={logo.alt || `${label} logo`}
          width={logo.width ?? 320}
          height={logo.height ?? 160}
          sizes="(max-width: 640px) 120px, 200px"
          className="logo-item__img"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <span className="logo-item__label" aria-hidden="true">
        {link ? <span className="logo-item__dot" /> : null}
        {label}
      </span>
    </span>
  );

  if (link) {
    return (
      <a
        className="logo-item"
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        data-logo={logo._id}
        data-tone={logo.tone}
        data-clone={clone ? "true" : undefined}
        aria-hidden={clone ? "true" : undefined}
        tabIndex={clone ? -1 : undefined}
        style={style}
      >
        {inner}
      </a>
    );
  }

  return (
    <span
      className="logo-item"
      data-logo={logo._id}
      data-tone={logo.tone}
      data-clone={clone ? "true" : undefined}
      aria-hidden={clone ? "true" : undefined}
      style={style}
    >
      {inner}
    </span>
  );
}

/** One logical logo plus whether this visual instance is an aria-hidden repeat. */
interface RowEntry {
  logo: PublicLogo;
  clone: boolean;
}

function ShowcaseRow({
  items,
  direction,
  duration,
}: {
  items: RowEntry[];
  direction: "left" | "right";
  duration: number;
}) {
  const render = (cloneAll: boolean) =>
    items.map((entry, index) => (
      <LogoItem key={`${entry.logo._id}-${cloneAll ? "d" : "g"}-${index}`} logo={entry.logo} clone={cloneAll || entry.clone} />
    ));

  return (
    <div className="logo-showcase__viewport">
      <div
        className="logo-showcase__track"
        data-direction={direction}
        style={{ "--logo-speed": `${duration}s` } as CSSProperties}
      >
        <div className="logo-showcase__group">{render(false)}</div>
        {/* Duplicate group guarantees a seamless -50% loop; excluded from a11y. */}
        <div className="logo-showcase__group" aria-hidden="true">
          {render(true)}
        </div>
      </div>
    </div>
  );
}

function ShowcaseSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center justify-center gap-10">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Section 3 — "Our Products" logo wall.
 *
 * Logos float directly on the page: no pill, card, plate or rectangle is ever
 * rendered behind an individual logo. Rows counter-scroll seamlessly, pause on
 * hover/focus/off-screen/hidden-tab, respond subtly to scroll velocity, and
 * collapse to a static wrapped grid under reduced motion.
 */
export function LogoMarquee() {
  const { data, loading, error, reload } = useApiData(() => api.logos(), "logos");
  const reduced = useReducedMotion();
  const logos = useMemo(() => data ?? [], [data]);

  const sectionRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [rows, setRows] = useState(2);
  // Damped speed scale (1 = base). Scroll velocity nudges it toward ~0.82.
  const [speedScale, setSpeedScale] = useState(1);

  /* Rows: 2 by default, 3 on large screens when there is enough content. */
  useEffect(() => {
    const compute = () => {
      const wide = window.matchMedia("(min-width: 1280px)").matches;
      setRows(wide && logos.length >= 7 ? 3 : 2);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [logos.length]);

  /* Off-screen + hidden-tab pause. */
  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setActive(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* Subtle, damped scroll-velocity awareness — one rAF, never layout-thrashing. */
  useEffect(() => {
    if (reduced) return;
    let scrollFrame = 0;
    let decayHandle = 0;
    let last = window.scrollY;
    let impulse = 0; // 0..1 recent scroll energy
    let lastApplied = 1;

    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        const delta = Math.min(Math.abs(window.scrollY - last), 160);
        last = window.scrollY;
        impulse = Math.min(1, impulse + delta / 900);
        scrollFrame = 0;
      });
    };

    const decay = () => {
      impulse *= 0.92; // damped, returns to base
      const scale = 1 - impulse * 0.18; // never faster than ~0.82×
      if (Math.abs(scale - lastApplied) > 0.01) {
        lastApplied = scale;
        setSpeedScale(scale);
      }
      decayHandle = requestAnimationFrame(decay);
    };
    decayHandle = requestAnimationFrame(decay);

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(decayHandle);
    };
  }, [reduced]);

  const rowEntries = useMemo(() => {
    const buckets: PublicLogo[][] = Array.from({ length: rows }, () => []);
    logos.forEach((logo, index) => buckets[index % rows].push(logo));
    return buckets
      .filter((bucket) => bucket.length > 0)
      .map((bucket) => {
        // Repeat each row's set enough times to fill ultrawide viewports with a
        // seamless loop. Repeats stay aria-hidden; only the logical set is exposed.
        const repeat = Math.max(1, Math.ceil(MIN_ROW_ITEMS / bucket.length));
        const items: RowEntry[] = [];
        for (let r = 0; r < repeat; r += 1) {
          bucket.forEach((logo) => items.push({ logo, clone: r > 0 }));
        }
        return items;
      });
  }, [logos, rows]);

  return (
    <section
      id="products"
      ref={sectionRef}
      aria-labelledby="products-showcase-heading"
      className={`logo-showcase border-t border-line py-14 sm:py-16 ${active ? "is-active" : ""}`}
    >
      <div className="logo-showcase__glow" aria-hidden="true" />

      <div className="container-page relative text-center">
        <Reveal variant="fade-in">
          <p className="eyebrow">Our Products</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 id="products-showcase-heading" className="mt-3 text-h3 font-semibold">
            Trusted platforms, real products, one engineering team
          </h2>
          <span className="heading-rule mx-auto mt-4" aria-hidden="true" />
        </Reveal>
        <Reveal delay={150}>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted">
            A growing portfolio of commerce, operations and AI products — designed, built and maintained
            end-to-end by Jazari Tech.
          </p>
        </Reveal>
        {!loading && !error && logos.length > 0 && (
          <Reveal delay={220}>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              <Counter value={logos.length} className="text-accent" /> products showcased
            </p>
          </Reveal>
        )}
      </div>

      <div className="relative mt-10">
        <hr className="logo-showcase__hairline container-page" />

        {loading ? (
          <div className="mt-8">
            <ShowcaseSkeleton />
          </div>
        ) : error ? (
          <div className="container-page mt-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm font-medium text-foreground">We couldn&apos;t load the product showcase.</p>
              <p className="text-sm text-muted">Please try again in a moment.</p>
              <Button variant="outline" size="sm" onClick={reload} iconLeft={<RefreshIcon size={14} />}>
                Try again
              </Button>
            </div>
          </div>
        ) : logos.length === 0 ? (
          <div className="container-page mt-8 text-center">
            <span className="inline-flex items-center gap-2 text-sm text-muted">
              <LayersIcon size={18} /> Product showcase coming soon.
            </span>
          </div>
        ) : reduced ? (
          <div className="container-page mt-8">
            <div className="logo-showcase__grid">
              {logos.map((logo) => (
                <LogoItem key={logo._id} logo={logo} clone={false} />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-8 sm:space-y-10">
            {rowEntries.map((items, index) => (
              <ShowcaseRow
                key={index}
                items={items}
                direction={index % 2 === 0 ? "left" : "right"}
                duration={(58 + index * 9) * speedScale}
              />
            ))}
          </div>
        )}

        <hr className="logo-showcase__hairline container-page mt-8" />
      </div>
    </section>
  );
}

export default LogoMarquee;
