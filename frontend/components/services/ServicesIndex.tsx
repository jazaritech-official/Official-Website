"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Reveal } from "@/components/motion/Reveal";
import { SectionIndex } from "@/components/layout/SectionIndex";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ArrowUpRightIcon, iconRegistry, InfoIcon, LayersIcon, RefreshIcon, type IconName } from "@/components/icons";
import { ServicePreviewCard } from "@/components/services/ServicePreviewCard";
import { prefetchScene, prefetchScenes } from "@/components/services/sceneRegistry";
import {
  SERVICE_CATEGORY_LABELS,
  restingLine,
  serviceCategory,
  sortServices,
  type ServiceCategory,
} from "@/lib/serviceCopy";
import type { Service } from "@/types/api";

/**
 * THE SERVICES INDEX — one blueprint schedule, every discipline visible, PLUS a
 * "hover me" invitation that opens a VIP preview card with an animated scene.
 *
 * WHAT CHANGED (Task M, and a deliberate reversal of Task L)
 * Task L banned hover/pointer affordances because nothing here navigates. The
 * owner has since asked for the OPPOSITE: rows now INVITE interaction and open a
 * floating preview (a non-modal popover — never a navigation, since services
 * still have no pages). The list itself is unchanged: 3 columns, grouped by the
 * backend `category`, equal row heights, `#service-{slug}` deep-link targets and
 * the calm `:target` flash the Hub and the hero tooltips link to.
 *
 * INTERACTION MODEL
 *   · hover (fine pointer)  → hover-intent 90 ms opens the card beside the row;
 *   · focus (keyboard)      → opens immediately; Escape closes; arrows move;
 *   · tap (coarse pointer)  → the card becomes a bottom sheet;
 *   · the pointer may travel row → card without closing (160 ms grace + bridge);
 *   · entering another row MORPHS the same card (one DOM node, one scene).
 *
 * Everything is a progressive enhancement: the list is server-rendered text, and
 * with JS off you simply get the full catalogue as before. All motion is paused
 * unless the section is in view, and the idle "nudge" is skipped entirely for
 * `prefers-reduced-motion` or a hidden tab.
 */

interface Group {
  key: string;
  label: string;
  items: Service[];
}

const CATEGORY_ORDER: ServiceCategory[] = ["engineering", "growth", "design", "security", "operations"];
const HOVER_IN_MS = 90;
const HOVER_OUT_MS = 160;
const NUDGE_MS = 4000;

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

function isSheetViewport(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return coarse || window.innerWidth < 1024;
}

export function ServicesIndex() {
  const { data, loading, error, reload } = useApiData(() => api.services(), "services");
  const services = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => buildRows(buildGroups(services)), [services]);
  const entries = useMemo(
    () => rows.filter((row): row is Extract<Row, { kind: "entry" }> => row.kind === "entry"),
    [rows],
  );
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const [active, setActive] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [sheet, setSheet] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  const [nudge, setNudge] = useState<number | null>(null);

  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const clearTimer = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  /* One-time scroll reveal (never required for visibility — see rule 8). */
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((entry) => entry.isIntersecting)) {
          node.classList.add("is-inview");
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* Motion preferences, the sheet breakpoint and the in-view / visible gates. */
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(motion.matches);
    sync();
    motion.addEventListener("change", sync);

    const resize = () => setSheet(isSheetViewport());
    resize();
    window.addEventListener("resize", resize);

    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);

    const node = sectionRef.current;
    let observer: IntersectionObserver | null = null;
    if (node && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((records) => setInView(records.some((entry) => entry.isIntersecting)), {
        threshold: 0.2,
      });
      observer.observe(node);
    }

    return () => {
      motion.removeEventListener("change", sync);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, []);

  /*
   * Idle "nudge": rotate ONE row at a time — only while the section is in view,
   * the tab is visible, nothing is open and motion is allowed. The timer only
   * advances a counter; whether that counter is DISPLAYED is derived, so turning
   * the gate off needs no state write (and no cascading render).
   */
  const nudgeAllowed = !reduced && inView && visible && active === null && entries.length > 0;
  useEffect(() => {
    if (!nudgeAllowed) return;
    let cursor = -1;
    const tick = () => {
      cursor = (cursor + 1) % Math.min(entries.length, 14);
      setNudge(cursor);
    };
    const first = window.setTimeout(tick, NUDGE_MS);
    const interval = window.setInterval(tick, NUDGE_MS * 2);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [nudgeAllowed, entries.length]);
  const nudgedIndex = nudgeAllowed ? nudge : null;

  /* Warm the first scenes so the first hover is already painted. */
  useEffect(() => {
    if (loading || services.length === 0) return;
    const slugs = entries.map((row) => row.service.slug);
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => prefetchScenes(slugs, 3))
      : window.setTimeout(() => prefetchScenes(slugs, 3), 1200);
    return () => {
      if (window.cancelIdleCallback && typeof idle === "number") window.cancelIdleCallback(idle);
      else window.clearTimeout(idle as number);
    };
  }, [loading, services.length, entries]);

  const openRow = useCallback(
    (index: number, options: { moveFocus?: boolean; element?: HTMLElement | null } = {}) => {
      clearTimer(openTimer);
      clearTimer(closeTimer);
      const row = entries[index];
      if (!row) return;
      const node =
        options.element ??
        (listRef.current?.querySelector<HTMLElement>(`[data-service-entry="${row.service.slug}"]`) ?? null);
      setAnchor(node ? node.getBoundingClientRect() : null);
      if (options.element) restoreFocus.current = options.element;
      setActive(index);
      prefetchScene(row.service.slug);
    },
    [entries],
  );

  const close = useCallback(() => {
    clearTimer(openTimer);
    clearTimer(closeTimer);
    setActive(null);
  }, []);

  const cancelClose = useCallback(() => clearTimer(closeTimer), []);

  const scheduleClose = useCallback(() => {
    clearTimer(closeTimer);
    closeTimer.current = window.setTimeout(() => setActive(null), HOVER_OUT_MS);
  }, []);

  const scheduleOpen = useCallback(
    (index: number, element: HTMLElement) => {
      clearTimer(closeTimer);
      if (sheet) return;
      clearTimer(openTimer);
      /*
       * Reduced motion does NOT disable the preview — it only removes the motion
       * from it: the card opens with no hover-intent delay and no animation, and
       * the scene is drawn in its final state (spec: "card opens instantly with
       * the scene's FINAL STATE drawn statically"). The invitation LOOPS (nudge,
       * shimmer, pointer glyph) are what reduced motion switches off.
       */
      if (reduced) {
        openRow(index, { element });
        return;
      }
      openTimer.current = window.setTimeout(() => openRow(index, { element }), HOVER_IN_MS);
    },
    [openRow, reduced, sheet],
  );

  useEffect(() => () => {
    clearTimer(openTimer);
    clearTimer(closeTimer);
  }, []);

  /* Restore focus to the row when the mobile sheet closes. */
  const dismissSheet = useCallback(() => {
    const target = restoreFocus.current;
    close();
    target?.focus({ preventScroll: true });
  }, [close]);

  /* Escape anywhere inside the section closes the preview. */
  useEffect(() => {
    if (active === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        const row = entries[active];
        const node = row
          ? listRef.current?.querySelector<HTMLElement>(`[data-service-entry="${row.service.slug}"]`)
          : null;
        node?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, close, entries]);

  const entryNodes = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-service-entry]") ?? []);

  /* Arrow keys move between entries (geometric, one layout read per keypress). */
  const moveFocus = (current: HTMLElement, key: string) => {
    const nodes = entryNodes();
    const from = nodes.indexOf(current);
    if (from < 0) return;
    const rect = current.getBoundingClientRect();
    const candidates = nodes
      .map((node, index) => ({ node, index, rect: node.getBoundingClientRect() }))
      .filter((item) => item.node !== current);

    const vertical = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0;
    if (vertical !== 0) {
      const sameRow = candidates.filter((item) => Math.abs(item.rect.top - rect.top) < 8);
      const pool = sameRow.length > 0 ? sameRow : candidates;
      const ahead = pool
        .filter((item) => (vertical > 0 ? item.rect.top > rect.bottom - 4 : item.rect.bottom < rect.top + 4))
        .sort((a, b) => Math.abs(a.rect.top - rect.top) - Math.abs(b.rect.top - rect.top));
      const target = ahead[0] ?? pool.find((item) => item.index > from) ?? pool[pool.length - 1];
      target?.node.focus({ preventScroll: true });
      return;
    }

    const horizontal = key === "ArrowRight" ? 1 : -1;
    const ahead = candidates
      .filter((item) =>
        horizontal > 0
          ? item.rect.left > rect.right - 8 || (Math.abs(item.rect.top - rect.top) < 8 && item.index > from)
          : item.rect.right < rect.left + 8 || (Math.abs(item.rect.top - rect.top) < 8 && item.index < from),
      )
      .sort((a, b) => Math.abs(a.rect.left - rect.left) - Math.abs(b.rect.left - rect.left));
    const target = ahead[0] ?? nodes[(from + horizontal + nodes.length) % nodes.length];
    (typeof target === "object" && "node" in target ? target.node : target)?.focus({ preventScroll: true });
  };

  const activeEntry = active === null ? null : (entries[active] ?? null);

  return (
    <section
      id="services"
      ref={sectionRef}
      aria-labelledby="services-heading"
      data-services-index
      data-inview={inView ? "true" : "false"}
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
              hunting through tabs. Hover any discipline to see how we build it.
            </p>
            <p aria-hidden="true" className="services-index__hint">
              <span className="services-index__hand">☞</span>
              Hover any discipline to see how we build it.
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
          <div className={`mt-7${inView ? " is-inview" : ""}`} data-services-state="loaded">
            <ol ref={listRef} className="services-index__list" data-services-count={services.length}>
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
                const isActive = active === index;
                /*
                 * The popover pattern, stated honestly: the row is a focusable
                 * plain list item whose description IS the preview card while it
                 * is open, so focusing a row announces that service's own copy.
                 * `aria-expanded` is deliberately NOT used — `listitem` does not
                 * support it, and `role="button"` was explicitly ruled out (the
                 * row toggles a preview; it does not perform an action).
                 */
                return (
                  <li
                    key={row.key}
                    id={`service-${service.slug}`}
                    className={`service-entry${isActive ? " is-active" : ""}${nudgedIndex === index ? " is-nudged" : ""}`}
                    data-service-entry={service.slug}
                    data-service-entry-index={index}
                    data-preview-open={isActive ? "true" : undefined}
                    style={{ "--i": index, "--sweep-i": index } as React.CSSProperties}
                    tabIndex={0}
                    aria-controls={isActive ? "service-preview-card" : undefined}
                    aria-describedby={isActive ? "service-preview-card" : undefined}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "touch") return;
                      scheduleOpen(index, event.currentTarget);
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType === "touch") return;
                      cancelClose();
                      scheduleClose();
                    }}
                    onFocus={(event) => {
                      if (sheet) return;
                      openRow(index, { element: event.currentTarget });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (sheet) openRow(index, { element: event.currentTarget });
                        else if (active === index) close();
                        else openRow(index, { element: event.currentTarget });
                        return;
                      }
                      if (event.key.startsWith("Arrow")) {
                        event.preventDefault();
                        moveFocus(event.currentTarget, event.key);
                      }
                    }}
                    onClick={(event) => {
                      const touch = window.matchMedia("(pointer: coarse)").matches;
                      if (!touch) return;
                      if (active === index) dismissSheet();
                      else openRow(index, { element: event.currentTarget as HTMLElement });
                    }}
                  >
                    {/* The shimmer is clipped by its OWN wrapper: a sweep that
                        travels past the row's edge would otherwise widen the
                        row's scroll box for the duration of the animation, and
                        the schedule must stay provably unclipped. */}
                    <span aria-hidden="true" className="service-entry__sweep-clip">
                      <span className="service-entry__sweep" />
                    </span>
                    <span aria-hidden="true" className="service-entry__bar" />
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
                    <span aria-hidden="true" className="service-entry__cue">
                      <span className="service-entry__cue-glyph">▶</span> Preview
                    </span>
                    <span aria-hidden="true" className="service-entry__nudge">
                      Hover to preview
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

      <ServicePreviewCard
        service={activeEntry?.service ?? null}
        index={activeEntry?.index ?? 0}
        total={services.length}
        anchor={anchor}
        sheet={sheet}
        reduced={reduced}
        playing={inView && visible && active !== null}
        onPointerEnter={cancelClose}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          if (sheet) return;
          scheduleClose();
        }}
        onDismiss={sheet ? dismissSheet : close}
      />

      {sheet && active !== null && (
        <button type="button" aria-label="Close the preview" className="vip-scrim" onClick={dismissSheet} />
      )}
    </section>
  );
}

export default ServicesIndex;
