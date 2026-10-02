"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Counter } from "@/components/motion/Counter";
import { Reveal } from "@/components/motion/Reveal";
import { Logo } from "@/components/brand/Logo";
import {
  ArrowRightIcon,
  ChipIcon,
  CodeIcon,
  GlobeIcon,
  CartIcon,
  StarIcon,
} from "@/components/icons";

const FLOATING_TILES = [
  { Icon: CodeIcon, position: "left-[4%] top-[8%]", animation: "float-slow", delay: 0 },
  { Icon: CartIcon, position: "right-[6%] top-[16%]", animation: "float-medium", delay: 800 },
  { Icon: ChipIcon, position: "left-[10%] bottom-[14%]", animation: "float-medium", delay: 1400 },
  { Icon: GlobeIcon, position: "right-[12%] bottom-[6%]", animation: "float-slow", delay: 400 },
];

const STATS = [
  { value: 10, suffix: "k+", label: "users served" },
  { value: 140, suffix: "+", label: "products shipped" },
  { value: 99.9, suffix: "%", label: "platform uptime", decimals: 1 },
];

/**
 * Premium hero: strong typography, trust signals, animated counters, a glass
 * preview card with connector + hotspot, orbit rings and floating tech tiles.
 * Parallax runs through a passive scroll listener writing transforms directly
 * to refs (no re-renders), and is disabled for reduced-motion users.
 */
export function Hero() {
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const visual = visualRef.current;
    if (!visual || typeof window === "undefined") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const layers = Array.from(visual.querySelectorAll<HTMLElement>("[data-parallax]"));
    if (layers.length === 0) return;

    let ticking = false;
    const update = () => {
      const offset = window.scrollY;
      for (const layer of layers) {
        const factor = Number(layer.dataset.parallax || 0.06);
        layer.style.transform = `translate3d(0, ${(-offset * factor).toFixed(2)}px, 0)`;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      for (const layer of layers) layer.style.transform = "";
    };
  }, []);

  return (
    <section id="home" className="relative overflow-hidden pb-16 pt-32 sm:pb-20 sm:pt-40">
      {/* Decorative backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_65%)]" />
        <div className="absolute right-[-10%] top-1/3 h-72 w-72 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.5] dark:opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, #000 40%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, #000 40%, transparent 100%)",
          }}
        />
      </div>

      <div className="container-page grid items-center gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8">
        {/* ---------------- Copy ---------------- */}
        <div className="max-w-2xl">
          <Reveal variant="fade-in">
            <span className="badge bg-surface-elevated">
              <span className="badge-dot" aria-hidden="true" />
              Trusted technology partner
            </span>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="mt-6 text-display font-semibold leading-[1.03] tracking-tight">
              Technology that moves your{" "}
              <span className="text-gradient">business</span> forward.
            </h1>
          </Reveal>

          <Reveal delay={180}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Jazari Tech designs, builds and operates the software, commerce and AI systems growing
              companies depend on — from first prototype to production scale, with the engineering
              discipline of a long-term partner.
            </p>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="#start">
                <Button size="sm" className="px-6 py-3.5 text-sm" iconRight={<ArrowRightIcon size={16} />}>
                  Start your project
                </Button>
              </Link>
              <Link href="#products">
                <Button variant="outline" size="sm" className="px-6 py-3.5 text-sm">
                  Explore our products
                </Button>
              </Link>
            </div>
          </Reveal>

          <Reveal delay={340}>
            <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
              {/* Rating */}
              <div className="flex items-center gap-2.5">
                <div className="flex gap-0.5 text-accent" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => (
                    <StarIcon key={index} size={15} variant="solid" />
                  ))}
                </div>
                <span className="text-sm text-muted">
                  <span className="font-semibold text-foreground">4.9/5</span> client rating
                </span>
              </div>

              {/* Avatar social proof */}
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2.5" aria-hidden="true">
                  {[
                    { initials: "AK", tone: "bg-primary" },
                    { initials: "MR", tone: "bg-accent" },
                    { initials: "TS", tone: "bg-[#4a5a8f]" },
                  ].map((avatar) => (
                    <span
                      key={avatar.initials}
                      className={`flex size-8 items-center justify-center rounded-full border-2 border-background text-[0.62rem] font-semibold text-white ${avatar.tone}`}
                    >
                      {avatar.initials}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-muted">
                  <span className="font-semibold text-foreground">
                    <Counter value={10} suffix="k+" />
                  </span>{" "}
                  users onboarded
                </p>
              </div>
            </div>
          </Reveal>

          {/* Animated counters */}
          <Reveal delay={420}>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-7">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    <Counter value={stat.value} suffix={stat.suffix} decimals={stat.decimals ?? 0} />
                  </dd>
                  <p className="mt-1 text-xs text-muted">{stat.label}</p>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        {/* ---------------- Visual composition ---------------- */}
        <div
          ref={visualRef}
          className="relative mx-auto flex min-h-[24rem] w-full max-w-md items-center justify-center lg:min-h-[30rem] lg:max-w-none"
          aria-hidden="true"
        >
          {/* Orbit rings */}
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line sm:h-72 sm:w-72" data-parallax="0.03" />
          <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line/70 lg:h-[28rem] lg:w-[28rem]" data-parallax="0.05" />

          {/* Orbiting indicator */}
          <div
            className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-80 sm:w-80"
            style={{ animation: "jt-spin 26s linear infinite" }}
            data-parallax="0.04"
          >
            <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_0_5px_color-mix(in_srgb,var(--accent)_18%,transparent)]" />
          </div>
          <div
            className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ animation: "jt-spin 18s linear infinite reverse" }}
            data-parallax="0.06"
          >
            <span className="absolute -top-1 right-8 size-2 rounded-full bg-growth shadow-[0_0_0_4px_color-mix(in_srgb,var(--growth)_20%,transparent)]" />
          </div>

          {/* Floating technology tiles */}
          {FLOATING_TILES.map(({ Icon, position, animation, delay }) => (
            <div
              key={position}
              className={`glass absolute ${position} ${animation} flex size-12 items-center justify-center rounded-2xl text-accent shadow-[var(--shadow-card)]`}
              style={{ animationDelay: `${delay}ms` }}
              data-parallax="0.09"
            >
              <Icon size={22} />
            </div>
          ))}

          {/* Floating glass preview card + connector + hotspot */}
          <div data-parallax="0.07" className="absolute bottom-4 right-0 sm:right-2">
            <div className="relative">
              {/* connector line */}
              <svg
                className="absolute -left-24 top-6 hidden h-16 w-28 overflow-visible sm:block"
                viewBox="0 0 112 64"
                fill="none"
              >
                <path
                  d="M0 8 C 40 8, 60 32, 104 56"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                  opacity="0.75"
                />
                <circle cx="0" cy="8" r="3" fill="var(--accent)" />
              </svg>

              <div className="glass w-60 rounded-2xl p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
                    Delivery pulse
                  </span>
                  <span className="badge-dot" />
                </div>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-foreground">38%</span>
                  <span className="text-xs text-muted">faster release cycles</span>
                </p>
                <svg className="mt-3 h-12 w-full" viewBox="0 0 240 48" preserveAspectRatio="none" fill="none">
                  <path
                    d="M0 40 L40 34 L80 36 L120 24 L160 26 L200 12 L240 6"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M0 40 L40 34 L80 36 L120 24 L160 26 L200 12 L240 6 L240 48 L0 48 Z"
                    fill="color-mix(in srgb, var(--accent) 14%, transparent)"
                  />
                </svg>
              </div>

              {/* hotspot dot */}
              <span className="hotspot absolute -left-16 top-2 hidden size-3 rounded-full bg-accent sm:block" />
            </div>
          </div>

          {/* Jazari ribbon/diamond motif — the supplied brand icon */}
          <div
            className="glass absolute left-0 top-6 hidden size-16 items-center justify-center rounded-2xl shadow-[var(--shadow-card)] sm:flex"
            data-parallax="0.08"
          >
            <Logo variant="icon" sizes="48px" className="float-medium size-11 dark:bg-transparent dark:p-0" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
