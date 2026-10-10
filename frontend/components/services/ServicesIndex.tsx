"use client";

import { useEffect, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIndex } from "@/components/layout/SectionIndex";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ArrowUpRightIcon, iconRegistry, InfoIcon, LayersIcon, RefreshIcon, type IconName } from "@/components/icons";
import {
  SERVICE_CATEGORY_LABELS,
  restingLine,
  serviceCategory,
  sortServices,
  type ServiceCategory,
} from "@/lib/serviceCopy";
import type { Service } from "@/types/api";

/**
 * THE SERVICES INDEX — one static, blueprint-style schedule. Every service is
 * visible at once; nothing is hidden behind a hover, a tab, a rail or a tour.
 *
 * WHY THIS REPLACED THE "DISCIPLINE ATLAS"
 * The Atlas needed scrolling inside a rail, showed one discipline at a time on a
 * mostly-empty stage, expanded a row into a clipped blob, and used hover/pointer
 * affordances for content that has no separate page. The owner asked for every
 * service visible together with no hover affordances, so the Atlas and its CSS
 * were deleted (see PROJECT_NOTES.md §39).
 *
 * This section is therefore deliberately NON-INTERACTIVE: the entries are plain
 * `<li>` content — no `cursor: pointer`, no hover lift, no tilt, no expanding
 * rows, no per-row CTA. The only interactive control is the section-level
 * "Start a project" link.
 *
 * The backend stays the single source of truth: every number, title, summary,
 * tag and group heading comes from GET /api/services (via the resilient
 * `publicContent` loader). `category` decides the grouping; when it is absent
 * the list renders ungrouped and no group name is invented.
 */

interface Group {
  key: string;
  label: string;
  items: Service[];
}

const CATEGORY_ORDER: ServiceCategory[] = ["engineering", "growth", "design", "security", "operations"];

/** A flat, index-stable render plan: group headings + numbered entries. */
type Row =
  | { kind: "head"; key: string; label: string }
  | { kind: "entry"; key: string; index: number; service: Service };

function buildRows(groups: Group[]): Row[] {
  const rows: Row[] = [];
  let index = 0;
  for (const group of groups) {
    rows.push({ kind: "head", key: `head:${group.key}`, label: group.label });
    for (const service of group.items) {
      rows.push({ kind: "entry", key: service._id, index, service });
      index += 1;
    }
  }
  return rows;
}

function buildGroups(services: Service[]): Group[] {
  const sorted = sortServices(services);
  const grouped = new Map<ServiceCategory, Service[]>();
  const ungrouped: Service[] = [];

  for (const service of sorted) {
    const category = serviceCategory(service);
    if (!category) {
      ungrouped.push(service);
      continue;
    }
    const bucket = grouped.get(category);
    if (bucket) bucket.push(service);
    else grouped.set(category, [service]);
  }

  const groups: Group[] = [];
  for (const category of CATEGORY_ORDER) {
    const items = grouped.get(category);
    if (items && items.length > 0) {
      groups.push({ key: category, label: SERVICE_CATEGORY_LABELS[category], items });
    }
  }
  if (ungrouped.length > 0) {
    // Never invent a group name: this bucket is literally "everything else".
    groups.push({ key: "ungrouped", label: groups.length > 0 ? "More disciplines" : "All disciplines", items: ungrouped });
  }
  return groups;
}

export function ServicesIndex() {
  const { data, loading, error, reload } = useApiData(() => api.services(), "services");
  const services = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => buildRows(buildGroups(services)), [services]);
  const sectionRef = useRef<HTMLElement>(null);

  /* One-time scroll reveal (never required for visibility — see rule 8). */
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          node.classList.add("is-inview");
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="services"
      ref={sectionRef}
      aria-labelledby="services-heading"
      data-services-index
      className="services-index relative overflow-hidden border-y border-line bg-surface py-12 sm:py-14"
    >
      <span aria-hidden="true" className="services-index__trace" />
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
              Every discipline we deliver, on one page — so you can see the whole schedule without
              hunting through tabs. Tell us where you are and we will scope the rest.
            </p>
          </Reveal>
        </div>

        {loading ? (
          <div data-services-state="loading" aria-hidden="true">
            <div className="services-index__list mt-10">
              {Array.from({ length: 9 }, (_, index) => (
                <Skeleton key={index} className="h-[4.4rem] w-full" />
              ))}
            </div>
          </div>
        ) : error ? (
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
          <div className="mt-7" data-services-state="loaded">
            <ol className="services-index__list" data-services-count={services.length}>
              {rows.map((row) => {
                if (row.kind === "head") {
                  return (
                    <li key={row.key} className="services-index__head" data-service-group={row.key}>
                      <h3 className="services-index__head-title">{row.label}</h3>
                      <span aria-hidden="true" className="services-index__head-rule" />
                    </li>
                  );
                }
                const { service, index } = row;
                const Icon = iconRegistry[service.icon as IconName] ?? InfoIcon;
                const chips = (service.highlights ?? []).slice(0, 3);
                return (
                  <li
                    key={row.key}
                    id={`service-${service.slug}`}
                    className="service-entry"
                    data-service-entry={service.slug}
                    style={{ "--i": index } as React.CSSProperties}
                  >
                    <span className="service-entry__num" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="service-entry__icon" aria-hidden="true">
                      <Icon size={17} />
                    </span>
                    <span className="service-entry__body">
                      <span className="service-entry__title">{service.title}</span>
                      <span className="service-entry__short">{restingLine(service, 96)}</span>
                      {chips.length > 0 && (
                        <span className="service-entry__tags">
                          {chips.map((chip) => (
                            <span key={chip} className="service-entry__tag">
                              {chip}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="services-index__cta">
              <a className="services-index__cta-link" href="#start">
                Start a project
                <ArrowUpRightIcon size={15} />
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default ServicesIndex;
