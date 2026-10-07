"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useTilt } from "@/hooks/useTilt";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIndex } from "@/components/layout/SectionIndex";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ArrowUpRightIcon, iconRegistry, InfoIcon, LayersIcon, RefreshIcon, type IconName } from "@/components/icons";
import type { Service } from "@/types/api";

/** Seamless wave: two full periods across the 1200-unit viewBox (period 600). */
const WAVE_PATH =
  "M 0 30 Q 150 6 300 30 T 600 30 T 900 30 T 1200 30 L 1200 60 L 0 60 Z";

/**
 * Resting summary line. Uses the backend's `shortDescription` when present;
 * otherwise the first clause/sentence of `description`, cut at a word boundary.
 * The frontend never invents copy.
 */
function restingLine(service: Service): string {
  const provided = (service.shortDescription ?? "").trim();
  if (provided) return provided;
  const firstSentence = service.description.split(/(?<=[.!?])\s/)[0] ?? service.description;
  const clause = firstSentence.split(/[,;:\u2014\u2013]/)[0] ?? firstSentence;
  const trimmed = clause.trim();
  if (trimmed.length <= 92) return trimmed;
  const cut = trimmed.slice(0, 92);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 40 ? cut.slice(0, lastSpace) : cut}\u2026`;
}

function ServiceCard({ service, index }: { service: Service; index: number }) {
  const Icon = iconRegistry[service.icon as IconName] ?? InfoIcon;
  const tiltRef = useTilt<HTMLElement>();
  const [filled, setFilled] = useState(false);

  const shortText = useMemo(() => restingLine(service), [service]);
  const chips = useMemo(() => (service.highlights ?? []).slice(0, 3), [service.highlights]);
  // Per-card gradient rotation — deterministic, all brand-derived.
  const fillAngle = 138 + (index % 5) * 11;

  const onPointerEnter = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerType === "mouse") setFilled(true);
  };
  const onPointerLeave = (event: ReactPointerEvent<HTMLElement>): void => {
    // Touch keeps its explicitly toggled state.
    if (event.pointerType === "mouse") setFilled(false);
  };
  const onBlur = (event: FocusEvent<HTMLElement>): void => {
    const next = event.relatedTarget as Node | null;
    if (!next || !event.currentTarget.contains(next)) setFilled(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") setFilled(false);
  };
  const onToggle = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    // Touch taps and keyboard activation toggle; mouse clicks rely on hover.
    const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (coarse || event.detail === 0) setFilled((value) => !value);
  };

  return (
    <article
      id={`service-${service.slug}`}
      ref={tiltRef}
      data-service-card={service.slug}
      data-filled={filled ? "" : undefined}
      className="card card-hover card-ticks tilt-card service-card flex h-full flex-col"
      style={{ "--service-fill-angle": `${fillAngle}deg` } as CSSProperties}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={() => setFilled(true)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {/* Rising liquid + two wave crests + the 2px Growth Green crest line. */}
      <div className="service-card__liquid" aria-hidden="true">
        <svg
          className="service-card__wave service-card__wave--a"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={WAVE_PATH} />
        </svg>
        <svg
          className="service-card__wave service-card__wave--b"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={WAVE_PATH} />
        </svg>
        <span className="service-card__crest" />
      </div>

      <div className="service-card__body">
        <span className="service-card__icon icon-interactive tilt-depth inline-flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon size={21} animated="pulse" />
        </span>

        <h3 className="service-card__title text-base font-semibold leading-snug">{service.title}</h3>

        <p className="service-card__short text-sm leading-relaxed text-muted">{shortText}</p>

        {chips.length > 0 && (
          <ul className="service-card__chips flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li
                key={chip}
                className="service-card__chip rounded-full border border-line px-2.5 py-0.5 text-[0.7rem] font-medium text-muted"
              >
                {chip}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="service-card__toggle"
          aria-expanded={filled}
          aria-controls={`service-${service.slug}-details`}
          onClick={onToggle}
        >
          {filled ? "Hide details" : "View details"}
          <ArrowUpRightIcon size={13} />
        </button>
      </div>

      {/* Full description + CTA — ALWAYS in the DOM, revealed on fill. */}
      <div className="service-card__details" id={`service-${service.slug}-details`}>
        <p className="service-card__desc text-muted">{service.description}</p>
        <a className="service-card__cta" href="#start">
          Start a project
          <ArrowUpRightIcon size={13} />
        </a>
      </div>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="card flex h-full flex-col gap-4 p-6" aria-hidden="true">
      <Skeleton className="size-11 rounded-xl" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
    </div>
  );
}

/**
 * Section 5 — service capability grid. Service records (title, copy, icon key)
 * live in MongoDB, so the frontend never keeps a conflicting list.
 */
export function ServicesGrid() {
  const { data, loading, error, reload } = useApiData(() => api.services(), "services");
  const services = data ?? [];

  return (
    <section id="services" aria-labelledby="services-heading" className="relative border-y border-line bg-surface py-16 sm:py-20">
      <span aria-hidden="true" className="grid-crosshair hidden lg:block" style={{ right: 28, top: 40 }} />
      <div className="container-page">
        <div className="max-w-2xl">
          <Reveal variant="fade-in">
            <SectionIndex index="03" label="Services" className="mb-4" />
            <p className="eyebrow">Our Services</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 id="services-heading" className="mt-3 text-h3 font-semibold">
              One partner across engineering, growth and design
            </h2>
            <span aria-hidden="true" className="heading-rule mt-4" />
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Fourteen disciplines under one accountable team — so strategy, build and operations
              never fall between vendors.
            </p>
          </Reveal>
        </div>

        {loading ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true" data-services-state="loading">
            {Array.from({ length: 6 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : error ? (
          /* ERROR — the backend gave no usable data. Connectivity problem, not absence. */
          <div className="mt-10" data-services-state="error">
            <EmptyState
              title="We couldn't load our services"
              description={`${error.message} This is a connection problem, not a missing catalogue — please retry.`}
              icon={<RefreshIcon size={22} />}
              action={
                <Button variant="outline" size="sm" onClick={reload}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : services.length === 0 ? (
          /* EMPTY — the backend answered successfully with zero records. */
          <div className="mt-10" data-services-state="empty">
            <EmptyState
              title="No services published yet"
              description="The service catalogue is being prepared. Tell us what you're building and we'll respond with the right scope."
              icon={<LayersIcon size={22} />}
              action={
                <a href="#start">
                  <Button variant="outline" size="sm">
                    Start your project
                  </Button>
                </a>
              }
            />
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-services-state="loaded">
            {services.map((service, index) => (
              <Reveal key={service._id} delay={(index % 3) * 80} className="h-full">
                <ServiceCard service={service} index={index} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default ServicesGrid;
