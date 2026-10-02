"use client";

import Image from "next/image";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useTilt } from "@/hooks/useTilt";
import { Reveal } from "@/components/motion/Reveal";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import {
  ArrowUpRightIcon,
  ChartIcon,
  CheckIcon,
  iconRegistry,
  LayersIcon,
  RefreshIcon,
  type IconName,
} from "@/components/icons";
import type { Product } from "@/types/api";

const CATEGORY_ICON: Record<string, string> = {
  "E-commerce": "cart",
  SaaS: "cloud",
  "AI Tool": "chip",
  "Mobile App": "mobile",
  Website: "website",
  Marketing: "megaphone",
  Design: "palette",
  "ERP / Business Software": "database",
};

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

function ProductCard({ product }: { product: Product }) {
  const iconKey = (CATEGORY_ICON[product.category] ?? "layers") as IconName;
  const CategoryIcon = iconRegistry[iconKey] ?? LayersIcon;
  const points = product.highlightPoints.slice(0, 4);
  const hasLink = Boolean(product.productUrl);
  const tiltRef = useTilt<HTMLElement>();

  return (
    <article ref={tiltRef} className="card card-hover tilt-card group flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface">
          {product.logo ? (
            <Image
              src={product.logo}
              alt={`${product.name} logo`}
              width={56}
              height={56}
              sizes="56px"
              className="size-full object-contain p-1.5"
            />
          ) : (
            <span className="text-gradient text-lg font-semibold">{monogram(product.name) || "JT"}</span>
          )}
        </div>

        <span className="icon-interactive tilt-depth inline-flex rounded-xl bg-accent-soft p-2.5 text-accent">
          <CategoryIcon size={18} animated="pulse" />
        </span>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <h3 className="text-lg font-semibold">{product.name}</h3>
      </div>
      <span className="mt-2 w-fit rounded-full border border-line bg-surface px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted">
        {product.category}
      </span>

      <ul className="mt-5 flex flex-col gap-2.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm text-muted">
            <CheckIcon size={15} className="mt-0.5 shrink-0 text-growth" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        {hasLink ? (
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            Visit product
            <ArrowUpRightIcon
              size={15}
              className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <ChartIcon size={15} />
            Case study coming soon
          </span>
        )}
      </div>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="card flex h-full flex-col p-6" aria-hidden="true">
      <div className="flex items-start justify-between">
        <Skeleton className="size-14 rounded-2xl" />
        <Skeleton className="size-10 rounded-xl" />
      </div>
      <Skeleton className="mt-5 h-5 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/3 rounded-full" />
      <div className="mt-5 flex flex-col gap-2.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-4/6" />
      </div>
      <Skeleton className="mt-auto h-4 w-28 pt-6" />
    </div>
  );
}

/**
 * Section 4 — curated product presentation cards. Data comes from
 * `GET /api/products`; the grid is intentionally a showcase, not a database
 * listing.
 */
export function ProductCards() {
  const { data, loading, error, reload } = useApiData(() => api.products(), "products");
  const products = data ?? [];

  return (
    <section aria-labelledby="product-cards-heading" className="pb-16 pt-6 sm:pb-24">
      <div className="container-page">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Reveal variant="fade-in" className="max-w-xl">
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
              <CardSkeleton key={index} />
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
            {products.map((product, index) => (
              <Reveal key={product._id} delay={(index % 3) * 90} className="h-full">
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default ProductCards;
