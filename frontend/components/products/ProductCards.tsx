"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIndex } from "@/components/layout/SectionIndex";
import { CircuitTrace } from "@/components/layout/CircuitTrace";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { productLogoAlt, productLogoUrl, isLogoReference } from "@/lib/productLogo";
import { ArrowUpRightIcon, ChartIcon, LayersIcon, RefreshIcon } from "@/components/icons";
import type { Product } from "@/types/api";

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

/** Deterministic plate id, e.g. PRD-003 — derived from sortOrder, never invented data. */
function plateId(product: Product, index: number): string {
  const order = Number.isFinite(product.sortOrder) ? product.sortOrder : 0;
  const base = order > 0 ? Math.round(order / 10) : index + 1;
  return `PRD-${String(Math.max(1, base)).padStart(3, "0")}`;
}

/** Tone-aware backdrop: a dark logo sits on white, a light logo on navy. */
function windowTone(product: Product): "light" | "dark" | "colorful" {
  if (!isLogoReference(product.logo)) return "colorful";
  const tone = product.logo.tone;
  return tone === "light" || tone === "dark" || tone === "colorful" ? tone : "colorful";
}

/**
 * Specimen Plate — a product mounted on a blueprint plate: a framed, gridded
 * specimen window, a mono plate id, a spec list whose ticks draw in on reveal,
 * one Growth-Green status node and a spectrum trace to the Visit action.
 *
 * Exported so the admin editor can render a live, real preview of the card.
 */
export function ProductCard({
  product,
  index = 0,
  featured = false,
}: {
  product: Product;
  index?: number;
  featured?: boolean;
}) {
  const url = productLogoUrl(product.logo);
  const alt = productLogoAlt(product.logo, product.name);
  const points = product.highlightPoints.slice(0, 4);
  const hasLink = Boolean(product.productUrl);
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <article
      className={`plate group h-full ${featured ? "plate--featured" : ""}`}
      data-product-plate=""
      data-featured={featured ? "true" : undefined}
    >
      <div className="plate__body">
        <div className="plate__head">
          <span className="plate__id">{plateId(product, index)}</span>
          <span className="plate__node" title="Available">
            Live
          </span>
        </div>

        <div className="plate__window" data-tone={windowTone(product)}>
          <span aria-hidden="true" className="plate__corner plate__corner--tl" />
          <span aria-hidden="true" className="plate__corner plate__corner--tr" />
          <span aria-hidden="true" className="plate__corner plate__corner--bl" />
          <span aria-hidden="true" className="plate__corner plate__corner--br" />

          {url && !logoFailed ? (
            <Image
              src={url}
              alt={alt}
              width={220}
              height={140}
              sizes="(max-width: 640px) 60vw, 220px"
              className="plate__logo object-contain"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            /* Designed monogram fallback — never a broken-image icon. */
            <span className="plate__monogram text-gradient" aria-hidden="true">
              {monogram(product.name) || "JT"}
            </span>
          )}
        </div>

        <h3 className="plate__title">{product.name}</h3>
        <span className="plate__category">{product.category}</span>

        <ul className="plate__specs">
          {points.map((point, pointIndex) => (
            <li
              key={point}
              className="plate__spec"
              style={{ "--spec-index": pointIndex } as CSSProperties}
            >
              <span aria-hidden="true" className="plate__tick" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <div className="plate__foot">
          <span aria-hidden="true" className="plate__trace" />
          {hasLink ? (
            <a
              href={product.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="plate__action"
            >
              Visit
              <ArrowUpRightIcon
                size={15}
                className="transition-transform duration-300 group-hover:-translate-y-0.5"
              />
            </a>
          ) : (
            <span className="plate__action" style={{ color: "var(--muted)" }}>
              <ChartIcon size={15} />
              Case study coming soon
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function PlateSkeleton() {
  return (
    <div className="plate h-full" aria-hidden="true">
      <div className="plate__body">
        <div className="plate__head">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-12 rounded" />
        </div>
        <Skeleton className="mt-4 aspect-[16/10] w-full rounded-lg" />
        <Skeleton className="mt-4 h-5 w-2/3" />
        <Skeleton className="mt-3 h-3 w-1/3 rounded" />
        <div className="mt-5 flex flex-col gap-2.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-4/6" />
        </div>
        <Skeleton className="mt-auto h-4 w-24 pt-6" />
      </div>
    </div>
  );
}

/**
 * Section 4 — curated product presentation cards. Data comes from
 * `GET /api/products`; the grid is intentionally a showcase, not a database
 * listing. The first plate is wide ("featured") when there are three or more.
 */
export function ProductCards() {
  const { data, loading, error, reload } = useApiData(() => api.products(), "products");
  const products = data ?? [];

  return (
    <section aria-labelledby="product-cards-heading" className="relative pb-16 pt-6 sm:pb-24">
      {/* Decorative blueprint markers (never interactive, never over text). */}
      <span aria-hidden="true" className="grid-crosshair hidden lg:block" style={{ right: 28, top: 44 }} />
      <CircuitTrace className="absolute right-0 bottom-0 hidden w-40 opacity-80 lg:block" />
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Reveal variant="fade-in" className="max-w-xl">
            <SectionIndex index="01" label="Products" className="mb-4" />
            <h2 id="product-cards-heading" className="text-h3 font-semibold">
              Built to production standards
            </h2>
            <span aria-hidden="true" className="heading-rule mt-4" />
            <p className="mt-3 text-sm text-muted">
              Every product ships with secure foundations, measurable performance and a roadmap we
              keep maintaining after launch.
            </p>
          </Reveal>
        </div>

        {loading ? (
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <PlateSkeleton key={index} />
            ))}
          </div>
        ) : error ? (
          <div className="mt-9">
            <EmptyState
              title="Products are temporarily unavailable"
              description={error.message}
              icon={<RefreshIcon size={22} />}
              action={
                <Button variant="outline" size="sm" onClick={reload}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : products.length === 0 ? (
          <div className="mt-9">
            <EmptyState
              title="Products coming soon"
              description="We're finalising this showcase. In the meantime, explore the services we deliver every day."
              icon={<LayersIcon size={22} />}
              action={
                <a href="#services">
                  <Button variant="outline" size="sm">
                    See our services
                  </Button>
                </a>
              }
            />
          </div>
        ) : (
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product, index) => {
              const featured = products.length >= 3 && index === 0;
              return (
                <Reveal
                  key={product._id}
                  delay={(index % 3) * 90}
                  className={`h-full ${featured ? "sm:col-span-2 lg:col-span-2" : ""}`}
                >
                  <ProductCard product={product} index={index} featured={featured} />
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default ProductCards;
