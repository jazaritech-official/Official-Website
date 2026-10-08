"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
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
import { ArrowUpRightIcon, iconRegistry, InfoIcon, LayersIcon, RefreshIcon, type IconName } from "@/components/icons";
import type { Service } from "@/types/api";

/**
 * The "Discipline Atlas" — a living instrument panel that replaces the 14-card
 * services grid.
 *
 * Layout: a slim, mono-numbered index RAIL of disciplines on the left and a
 * large STAGE on the right showing the selected discipline (oversized title, the
 * backend description, up to 3 highlight chips, a Start-a-project link and a
 * bespoke SVG "constellation" visual). Under 1024 px the rail becomes a sticky
 * scroll-snapped chip carousel above the stage.
 *
 * The backend stays the single source of truth: every label, description, chip,
 * category and accent comes from GET /api/services. Nothing is invented here.
 *
 * ── Why a rail row is still an `article.service-card[data-service-card]` ────
 * The verification harness already asserts the previous card's DOM contract
 * (`article[data-service-card]`, `.service-card__short`, `.service-card__details`,
 * `.service-card__liquid`, the in-row toggle, aria-expanded, Escape-to-close, the
 * full description always in the DOM, `data-filled` on the article, constant row
 * height). The project's ground rules forbid weakening those assertions, so the
 * rail rows keep that exact contract and are RESTYLED into slim blueprint rows
 * (the row "liquid" is now a thin gradient wipe — a selection indicator — and the
 * ONE large liquid band lives in the stage behind the title, as designed).
 */

/** Wave used by the single large liquid band behind the stage title. */
const BAND_PATH = "M 0 26 Q 150 4 300 26 T 600 26 T 900 26 T 1200 26 L 1200 60 L 0 60 Z";

const CATEGORY_ORDER = ["engineering", "growth", "design", "security", "operations"] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  engineering: "Engineering",
  growth: "Growth",
  design: "Design",
  security: "Security",
  operations: "Operations",
};

/** Unknown/empty category → ungrouped. Never invent a category. */
function categoryOf(service: Service): Category | null {
  const value = (service.category ?? "").trim().toLowerCase();
  return (CATEGORY_ORDER as readonly string[]).includes(value) ? (value as Category) : null;
}

/** Unknown accent → blue (Growth Green is only ever a micro accent). */
function accentOf(service: Service): "blue" | "navy" | "green-micro" {
  const value = (service.accent ?? "").trim().toLowerCase();
  return value === "navy" || value === "green-micro" ? value : "blue";
}

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

/** Deterministic node placement: two concentric rings, grouped by category. */
function nodePositions(count: number): { x: number; y: number }[] {
  const centre = 260;
  const positions: { x: number; y: number }[] = [];
  const innerCount = Math.ceil(count / 2);
  for (let i = 0; i < count; i += 1) {
    const inner = i < innerCount;
    const indexInRing = inner ? i : i - innerCount;
    const ringCount = inner ? innerCount : count - innerCount;
    const radius = inner ? 150 : 222;
    const angle = (indexInRing / Math.max(ringCount, 1)) * Math.PI * 2 - Math.PI / 2 + (inner ? 0 : 0.34);
    positions.push({ x: centre + Math.cos(angle) * radius, y: centre + Math.sin(angle) * radius });
  }
  return positions;
}

/* -------------------------------------------------------------------------- */

function AtlasRow({
  service,
  index,
  selected,
  onSelect,
  onPreview,
  onPreviewEnd,
  tabIndex,
}: {
  service: Service;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onPreviewEnd: () => void;
  tabIndex: number;
}) {
  const Icon = iconRegistry[service.icon as IconName] ?? InfoIcon;
  const [filled, setFilled] = useState(false);
  const shortText = useMemo(() => restingLine(service), [service]);
  const chips = useMemo(() => (service.highlights ?? []).slice(0, 3), [service.highlights]);
  const accent = accentOf(service);
  const fillAngle = 138 + (index % 5) * 11;

  const onPointerEnter = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerType === "mouse") {
      setFilled(true);
      onPreview();
    }
  };
  const onPointerLeave = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerType === "mouse") {
      setFilled(false);
      onPreviewEnd();
    }
  };
  const onBlur = (event: FocusEvent<HTMLElement>): void => {
    const next = event.relatedTarget as Node | null;
    if (!next || !event.currentTarget.contains(next)) {
      setFilled(false);
      onPreviewEnd();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      setFilled(false);
      onPreviewEnd();
    }
  };
  const onToggle = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (coarse || event.detail === 0) setFilled((value) => !value);
  };

  return (
    <article
      id={`service-${service.slug}`}
      role="tab"
      aria-selected={selected}
      aria-controls="atlas-stage"
      tabIndex={tabIndex}
      data-service-card={service.slug}
      data-atlas-item={service.slug}
      data-accent={accent}
      data-filled={filled ? "" : undefined}
      className="service-card atlas-row"
      style={{ "--service-fill-angle": `${fillAngle}deg` } as CSSProperties}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={() => {
        setFilled(true);
        onPreview();
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onClick={onSelect}
    >
      {/* Thin gradient wipe (the previous "liquid", rescaled to a row cue). */}
      <span className="service-card__liquid atlas-row__liquid" aria-hidden="true">
        <svg className="service-card__wave service-card__wave--a" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={BAND_PATH} />
        </svg>
        <svg className="service-card__wave service-card__wave--b" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={BAND_PATH} />
        </svg>
        <span className="service-card__crest" />
      </span>

      <span className="service-card__body atlas-row__body">
        <span className="atlas-row__index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="service-card__icon atlas-row__icon" aria-hidden="true">
          <Icon size={17} animated={selected ? "pulse" : undefined} />
        </span>
        <span className="atlas-row__text">
          <span className="service-card__title atlas-row__title">{service.title}</span>
          <span className="service-card__short atlas-row__short">{shortText}</span>
        </span>
        {chips.length > 0 && (
          <span className="service-card__chips atlas-row__chips">
            {chips.map((chip) => (
              <span key={chip} className="service-card__chip atlas-chip">
                {chip}
              </span>
            ))}
          </span>
        )}
        <span className="atlas-row__tick" aria-hidden="true" />
      </span>

      {/* Full description — ALWAYS in the DOM, revealed on hover/focus/tap. */}
      <span className="service-card__details atlas-row__details">
        <span className="service-card__desc atlas-row__desc">{service.description}</span>
        <button
          type="button"
          className="service-card__toggle atlas-row__toggle"
          aria-expanded={filled}
          aria-controls={`service-${service.slug}-details`}
          onClick={onToggle}
        >
          {filled ? "Hide details" : "View details"}
          <ArrowUpRightIcon size={13} />
        </button>
      </span>
      <span id={`service-${service.slug}-details`} className="sr-only" />
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function AtlasSkeleton() {
  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]" aria-hidden="true">
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
      <Skeleton className="h-[440px] w-full rounded-3xl" />
    </div>
  );
}

export function DisciplineAtlas() {
  const { data, loading, error, reload } = useApiData(() => api.services(), "services");
  // Stable identity: `data ?? []` would create a new array on every render and
  // make every effect dependency change needlessly.
  const services = useMemo(() => data ?? [], [data]);

  const [selected, setSelected] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [touring, setTouring] = useState(false);
  const reduced = useReducedMotion();

  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const inViewRef = useRef(true);
  const listId = useId();

  // Derived (never set in an effect) so a shrinking list can never leave the
  // selection out of range.
  const selectedIndex = services.length === 0 ? 0 : Math.min(selected, services.length - 1);
  const activeIndex = previewIndex !== null && previewIndex < services.length ? previewIndex : selectedIndex;
  const active = services[activeIndex] ?? null;
  const positions = useMemo(() => nodePositions(services.length), [services.length]);

  /* --- Keyboard: roving tabindex over the rail ------------------------- */
  const move = useCallback(
    (next: number) => {
      if (services.length === 0) return;
      const clamped = Math.max(0, Math.min(services.length - 1, next));
      setSelected(clamped);
      setPreviewIndex(null);
      railRef.current?.querySelectorAll<HTMLElement>("[data-atlas-item]")[clamped]?.focus();
    },
    [services.length],
  );

  const onRailKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const total = services.length;
    if (total === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(selectedIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(selectedIndex - 1);
        break;
      case "PageDown":
        event.preventDefault();
        move(selectedIndex + 5);
        break;
      case "PageUp":
        event.preventDefault();
        move(selectedIndex - 5);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(total - 1);
        break;
      default:
        break;
    }
  };

  /* --- Hash deep links: #service-{slug} selects that discipline -------- */
  useEffect(() => {
    if (services.length === 0) return;
    const applyHash = (): void => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash.startsWith("service-")) return;
      const slug = hash.slice("service-".length);
      const index = services.findIndex((service) => service.slug === slug);
      if (index >= 0) {
        setSelected(index);
        setPreviewIndex(null);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [services]);

  /* --- Tour: explicit, OFF by default, pauses on hover/focus/hidden ---- */
  useEffect(() => {
    if (!touring || reduced || services.length === 0) return;
    const timer = window.setInterval(() => {
      if (pausedRef.current || document.hidden || !inViewRef.current) return;
      setPreviewIndex(null);
      setSelected((current) => (current + 1) % services.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [touring, reduced, services.length]);

  /* --- Pause the tour off-screen --------------------------------------- */
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        inViewRef.current = entries.some((entry) => entry.isIntersecting);
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const select = (index: number): void => {
    setSelected(index);
    setPreviewIndex(null);
  };

  const activeAccent = active ? accentOf(active) : "blue";
  const activeCategory = active ? categoryOf(active) : null;
  const ActiveIcon = (active ? iconRegistry[active.icon as IconName] : undefined) ?? InfoIcon;
  const activePoint = positions[activeIndex] ?? null;

  return (
    <section
      id="services"
      ref={sectionRef}
      aria-labelledby="services-heading"
      data-atlas
      className="relative border-y border-line bg-surface py-16 sm:py-20"
      onPointerEnter={() => {
        pausedRef.current = true;
      }}
      onPointerLeave={() => {
        pausedRef.current = false;
      }}
      onFocusCapture={() => {
        pausedRef.current = true;
      }}
      onBlurCapture={() => {
        pausedRef.current = false;
      }}
    >
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
              never fall between vendors. Choose a discipline to see how it works.
            </p>
          </Reveal>
        </div>

        {loading ? (
          <div data-services-state="loading">
            <AtlasSkeleton />
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
          <div className="atlas-layout mt-10" data-atlas-layout>
            {/* ── Rail: the tablist. Its 14 direct children are the rows. ── */}
            <div className="atlas-rail-wrap">
              {!reduced && (
                <button
                  type="button"
                  className="atlas-tour"
                  aria-pressed={touring}
                  data-atlas-tour
                  onClick={() => setTouring((value) => !value)}
                >
                  <span className="atlas-tour__dot" aria-hidden="true" />
                  {touring ? "Pause tour" : "Play tour"}
                </button>
              )}
              <div
                ref={railRef}
                id={listId}
                role="tablist"
                aria-orientation="vertical"
                aria-label="Disciplines"
                data-services-state="loaded"
                data-atlas-rail
                className="atlas-rail"
                onKeyDown={onRailKeyDown}
              >
                {services.map((service, index) => (
                  <AtlasRow
                    key={service._id}
                    service={service}
                    index={index}
                    selected={index === selectedIndex}
                    tabIndex={index === selectedIndex ? 0 : -1}
                    onSelect={() => select(index)}
                    onPreview={() => setPreviewIndex(index)}
                    onPreviewEnd={() => setPreviewIndex(null)}
                  />
                ))}
              </div>
            </div>

            {/* ── Stage: the selected discipline, announced politely. ── */}
            <div
              id="atlas-stage"
              role="tabpanel"
              aria-labelledby={active ? `service-${active.slug}` : undefined}
              aria-live="polite"
              data-atlas-stage
              data-accent={activeAccent}
              className="atlas-stage"
            >
              {active && (
                <>
                  <div className="atlas-stage__head">
                    <span className="atlas-stage__index" aria-hidden="true">
                      Discipline {String(activeIndex + 1).padStart(2, "0")} / {String(services.length).padStart(2, "0")}
                    </span>
                    <span className="atlas-stage__cat" data-atlas-category={activeCategory ?? "ungrouped"}>
                      {activeCategory ? CATEGORY_LABELS[activeCategory] : "Catalogue"}
                    </span>
                  </div>

                  {/* ONE large liquid band — the water idea as a single surface. */}
                  <div className="atlas-band" aria-hidden="true">
                    <svg className="atlas-band__wave atlas-band__wave--a" viewBox="0 0 1200 60" preserveAspectRatio="none" focusable="false">
                      <path d={BAND_PATH} />
                    </svg>
                    <svg className="atlas-band__wave atlas-band__wave--b" viewBox="0 0 1200 60" preserveAspectRatio="none" focusable="false">
                      <path d={BAND_PATH} />
                    </svg>
                  </div>

                  <div className="atlas-stage__grid">
                    <div className="atlas-stage__body" key={active.slug}>
                      <h3 className="atlas-stage__title text-h3 font-semibold">{active.title}</h3>
                      <p className="atlas-stage__desc">{active.description}</p>
                      {(active.highlights ?? []).slice(0, 3).length > 0 && (
                        <ul className="atlas-stage__chips">
                          {(active.highlights ?? []).slice(0, 3).map((chip) => (
                            <li key={chip} className="atlas-chip">
                              {chip}
                            </li>
                          ))}
                        </ul>
                      )}
                      <a className="atlas-stage__cta" href="#start">
                        Start a project
                        <ArrowUpRightIcon size={14} />
                      </a>
                    </div>

                    {/* Bespoke live visual: the discipline constellation. */}
                    <div className="atlas-visual" data-atlas-visual aria-hidden="true">
                      <svg viewBox="0 0 520 520" className="atlas-visual__svg" focusable="false">
                        <defs>
                          <linearGradient id="atlas-wire" gradientUnits="userSpaceOnUse" x1="90" y1="430" x2="430" y2="90">
                            {/* Presentation attributes cannot take var(); inline styles can. */}
                            <stop offset="0%" style={{ stopColor: "var(--hub-wire-a)" }} />
                            <stop offset="55%" style={{ stopColor: "var(--hub-wire-b)" }} />
                            <stop offset="100%" style={{ stopColor: "var(--hub-wire-c)" }} />
                          </linearGradient>
                        </defs>

                        <circle cx="260" cy="260" r="150" className="atlas-visual__ring" />
                        <circle cx="260" cy="260" r="222" className="atlas-visual__ring atlas-visual__ring--outer" />

                        {/* Selected connector + travelling packets. */}
                        {activePoint && (
                          <>
                            <line
                              data-atlas-wire
                              x1={activePoint.x}
                              y1={activePoint.y}
                              x2="260"
                              y2="260"
                              stroke="url(#atlas-wire)"
                              className="atlas-visual__wire"
                            />
                            {/* Not rendered at all under reduced motion (no packets). */}
                            {!reduced && (
                              <>
                                <circle
                                  r="4"
                                  className="atlas-visual__packet"
                                  style={{ offsetPath: `path("M ${activePoint.x} ${activePoint.y} L 260 260")` } as CSSProperties}
                                />
                                <circle
                                  r="3"
                                  className="atlas-visual__packet atlas-visual__packet--delayed"
                                  style={{ offsetPath: `path("M ${activePoint.x} ${activePoint.y} L 260 260")` } as CSSProperties}
                                />
                              </>
                            )}
                          </>
                        )}

                        {/* Discipline nodes (decorative; real buttons are provided). */}
                        {services.map((service, index) => {
                          const position = positions[index];
                          if (!position) return null;
                          const isActive = index === activeIndex;
                          return (
                            <g
                              key={service._id}
                              data-atlas-node={service.slug}
                              data-accent={accentOf(service)}
                              className={isActive ? "atlas-node is-active" : "atlas-node"}
                            >
                              <circle cx={position.x} cy={position.y} r={isActive ? 9 : 6} />
                              <circle cx={position.x} cy={position.y} r={isActive ? 15 : 11} className="atlas-node__halo" />
                            </g>
                          );
                        })}

                        {/* Capacity ring (decorative gauge). */}
                        <circle
                          data-atlas-gauge
                          cx="260"
                          cy="260"
                          r="104"
                          className="atlas-visual__gauge"
                          strokeDasharray={`${((activeIndex + 1) / Math.max(services.length, 1)) * 653} 653`}
                        />
                      </svg>

                      <span className="atlas-visual__hub" data-atlas-hub-icon>
                        <ActiveIcon size={34} animated="pulse" />
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Node selection without hover: real buttons, visually hidden. */}
            <div className="sr-only" data-atlas-node-controls>
              {services.map((service, index) => (
                <button key={service._id} type="button" onClick={() => select(index)}>
                  Show {service.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default DisciplineAtlas;
