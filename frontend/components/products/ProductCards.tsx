"use client";

import Image from "next/image";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIndex } from "@/components/layout/SectionIndex";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { productLogoAlt, productLogoUrl, isLogoReference } from "@/lib/productLogo";
import { ArrowUpRightIcon, ChartIcon, LayersIcon, RefreshIcon } from "@/components/icons";
import type { Product } from "@/types/api";

/**
 * SHOWCASE TILE — the product card.
 *
 * WHAT THIS REPLACES (Task M)
 * The "Specimen Plate": a framed, gridded specimen window with corner ticks, a
 * dashed spec list, a drawn-in spectrum trace and a translucent surface that let
 * the page's blueprint grid show THROUGH the card (the owner's screenshot showed
 * exactly that mess). The new tile is minimal and calm — one opaque surface, one
 * 1px ring, a spotlight stage, an inline highlight line and a Visit row — but it
 * is still alive: a breathing LIVE node, a slowly drifting spotlight, a one-shot
 * conic border sweep, a sheen that crosses the surface, a pointer-following tilt
 * and staggered highlight reveals, all on hover/focus-within and all reversible.
 *
 * THE DATA CONTRACT IS UNCHANGED
 * `Product.logoId` and the public `logo: {id,url,displayName,alt,tone,hasAlpha,
 * aspectRatio}` object, the `PRD-00N` plate id, exactly ONE Growth-Green node,
 * the `target="_blank" rel="noopener noreferrer"` Visit link, the monogram
 * fallback and the tone-aware staging all survive the redesign.
 *
 * MOTION RULES
 * Only `transform` and `opacity` are animated. The pointer tilt writes two CSS
 * custom properties from ONE rAF-throttled handler (fine pointers only, never
 * under `prefers-reduced-motion`), and the hover styles are mirrored on
 * `:focus-within` so keyboard users get the same state.
 *
 * Exported so the admin editor can render a live, real preview of the card.
 */

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

/** Tone-aware backdrop: a dark logo sits on a light stage, a light logo on navy. */
function stageTone(product: Product): "light" | "dark" | "none" {
  if (!isLogoReference(product.logo)) return "none";
  const tone = product.logo.tone;
  return tone === "light" || tone === "dark" ? tone : "none";
}

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
  const highlights = product.highlightPoints.slice(0, 3);
  const hasLink = Boolean(product.productUrl);
  const [logoFailed, setLogoFailed] = useState(false);
  const reduced = useReducedMotion();

  const cardRef = useRef<HTMLElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const frameRef = useRef<number | null>(null);
  const nextRef = useRef<{ x: number; y: number } | null>(null);

  /* One rAF-throttled pointer handler: a single layout read on enter, then only
     custom-property writes (no per-frame measurement, no rAF loop). */
  const apply = useCallback(() => {
    frameRef.current = null;
    const node = cardRef.current;
    const rect = rectRef.current;
    const next = nextRef.current;
    if (!node || !rect || !next || rect.width === 0 || rect.height === 0) return;
    const nx = (next.x - rect.left) / rect.width - 0.5;
    const ny = (next.y - rect.top) / rect.height - 0.5;
    node.style.setProperty("--tile-tilt", `${(nx * 3).toFixed(2)}deg`);
    node.style.setProperty("--tile-shift-x", `${(nx * 6).toFixed(2)}px`);
    node.style.setProperty("--tile-shift-y", `${(ny * 4).toFixed(2)}px`);
  }, []);

  const onPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (reduced || event.pointerType !== "mouse") return;
      rectRef.current = cardRef.current?.getBoundingClientRect() ?? null;
    },
    [reduced],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (reduced || event.pointerType !== "mouse") return;
      nextRef.current = { x: event.clientX, y: event.clientY };
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(apply);
    },
    [apply, reduced],
  );

  const onPointerLeave = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const node = cardRef.current;
    if (!node) return;
    node.style.removeProperty("--tile-tilt");
    node.style.removeProperty("--tile-shift-x");
    node.style.removeProperty("--tile-shift-y");
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <article
      ref={cardRef}
      className={`tile group h-full ${featured ? "tile--featured" : ""}`}
      data-product-card=""
      data-product-plate=""
      data-featured={featured ? "true" : undefined}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <span aria-hidden="true" className="tile__ring" />
      <div className="tile__inner">
        <span aria-hidden="true" className="tile__sheen" />

        <div className="tile__head">
          <span className="tile__id">{plateId(product, index)}</span>
          <span className="tile__node" title="Live">
            Live
          </span>
        </div>

        <div className="tile__stage" data-tone={stageTone(product)} data-product-stage>
          <span aria-hidden="true" className="tile__spotlight" />
          <span aria-hidden="true" className="tile__ground" />
          {url && !logoFailed ? (
            <Image
              src={url}
              alt={alt}
              width={320}
              height={180}
              sizes="(max-width: 640px) 70vw, 320px"
              className="tile__logo"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            /* Designed monogram fallback — never a broken-image icon. */
            <span className="tile__monogram text-gradient" aria-hidden="true">
              {monogram(product.name) || "JT"}
            </span>
          )}
        </div>

        <div className="tile__meta">
          <h3 className="tile__title">{product.name}</h3>
          <span className="tile__category">{product.category}</span>
          {highlights.length > 0 && (
            <p className="tile__highlights">
              {highlights.map((point, pointIndex) => (
                <Fragment key={point}>
                  {pointIndex > 0 && <span aria-hidden="true" className="tile__dot" />}
                  <span
                    className="tile__highlight"
                    style={{ "--highlight-index": pointIndex } as CSSProperties}
                  >
                    {point}
                  </span>
                </Fragment>
              ))}
            </p>
          )}
        </div>

        <div className="tile__foot">
          {hasLink ? (
            <span className="tile__action-wrap">
              <a
                href={product.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tile__action"
                data-product-action
              >
                Visit
                <ArrowUpRightIcon size={15} className="tile__action-arrow" />
              </a>
              <span aria-hidden="true" className="tile__action-rule" />
            </span>
          ) : (
            <span className="tile__muted-action">
              <ChartIcon size={15} />
              Case study coming soon
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function TileSkeleton() {
  return (
    <div className="tile h-full" aria-hidden="true">
      <div className="tile__inner">
        <div className="tile__head">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-12 rounded" />
        </div>
        <Skeleton className="mt-4 aspect-[16/9] w-full rounded-lg" />
        <Skeleton className="mt-4 h-5 w-2/3" />
        <Skeleton className="mt-3 h-3 w-1/3 rounded" />
        <Skeleton className="mt-4 h-3.5 w-5/6" />
        <Skeleton className="mt-auto h-4 w-24 pt-6" />
      </div>
    </div>
  );
}

/**
 * Section 4 — curated product presentation cards. Data comes from
 * `GET /api/products`; the grid is intentionally a showcase, not a database
 * listing. The first tile is wide ("featured") when there are three or more.
 */
export function ProductCards() {
  const { data, loading, error, reload } = useApiData(() => api.products(), "products");
  const products = data ?? [];

  return (
    <section aria-labelledby="product-cards-heading" className="relative pb-16 pt-6 sm:pb-24">
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
              <TileSkeleton key={index} />
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
                  delay={(index % 3) * 60}
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
