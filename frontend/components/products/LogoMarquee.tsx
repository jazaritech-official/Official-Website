"use client";

import Image from "next/image";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Marquee } from "@/components/motion/Marquee";
import { Reveal } from "@/components/motion/Reveal";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { LayersIcon, RefreshIcon } from "@/components/icons";
import type { PublicLogo } from "@/types/api";

function LogoTile({ logo }: { logo: PublicLogo }) {
  return (
    <div className="group flex h-16 w-44 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-elevated px-5 shadow-[var(--shadow-subtle)] transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 sm:w-48">
      <Image
        src={logo.secureUrl}
        alt={logo.alt || logo.name}
        width={176}
        height={56}
        sizes="(max-width: 640px) 176px, 192px"
        className="max-h-10 w-auto max-w-full object-contain"
      />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-center gap-4">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-44 rounded-2xl sm:w-48" />
      ))}
    </div>
  );
}

/**
 * Section 3 — product logo marquee.
 * Two counter-scrolling rows (CSS transforms, infinite, pause on hover, edge
 * fade). Only visible logos are shown, ordered by sortOrder; loading, error
 * and empty states are all designed rather than blank.
 */
export function LogoMarquee() {
  const { data, loading, error, reload } = useApiData(() => api.logos(), "logos");
  const logos = data ?? [];

  const rowA = logos.filter((_, index) => index % 2 === 0);
  const rowB = logos.filter((_, index) => index % 2 === 1);

  return (
    <section id="products" aria-labelledby="products-heading" className="border-t border-line py-14 sm:py-16">
      <div className="container-page text-center">
        <Reveal variant="fade-in">
          <p className="eyebrow">Our Products</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 id="products-heading" className="mt-3 text-h3 font-semibold">
            Platforms growing businesses already run on
          </h2>
        </Reveal>
        <Reveal delay={150}>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
            A portfolio of commerce, operations and AI products — engineered, hosted and maintained
            by Jazari Tech.
          </p>
        </Reveal>
      </div>

      <div className="mt-9 space-y-4">
        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <div className="container-page">
            <EmptyState
              title="We couldn't load the product logos"
              description={error.message}
              icon={<RefreshIcon size={22} />}
              action={
                <Button variant="outline" size="sm" onClick={reload}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : logos.length === 0 ? (
          <div className="container-page">
            <EmptyState
              title="Products coming soon"
              description="Our product portfolio is being curated for display. Check back shortly to see what we've built."
              icon={<LayersIcon size={22} />}
            />
          </div>
        ) : (
          <>
            <Marquee direction="left" duration={44}>
              {rowA.map((logo) => (
                <LogoTile key={logo._id} logo={logo} />
              ))}
            </Marquee>
            {rowB.length > 0 && (
              <Marquee direction="right" duration={52}>
                {rowB.map((logo) => (
                  <LogoTile key={logo._id} logo={logo} />
                ))}
              </Marquee>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default LogoMarquee;
