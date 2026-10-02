"use client";

import { Fragment, useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Counter } from "@/components/motion/Counter";
import { Logo } from "@/components/brand/Logo";
import { HeroScene } from "@/components/three/HeroScene";
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

/** Headline split into words for the masked, word-by-word first-load reveal. */
const HEADLINE_WORDS: Array<{ text: string; accent?: boolean }> = [
  { text: "Technology" },
  { text: "that" },
  { text: "moves" },
  { text: "your" },
  { text: "business", accent: true },
  { text: "forward." },
];

/** Inline custom property cast for the intro choreography delay. */
const intro = (delay: string): CSSProperties => ({ "--jt-intro-delay": delay }) as CSSProperties;

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
    <section id="home" className="relative overflow-hidden pb-14 pt-28 sm:pb-20 sm:pt-32">
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
          <span className="jt-intro badge bg-surface-elevated" style={intro("calc(var(--intro-cta-delay) + 70ms)")}>
            <span className="badge-dot" aria-hidden="true" />
            Trusted technology partner
          </span>

          <h1 className="mt-5 text-h1 font-semibold leading-[1.08] tracking-tight">
            {HEADLINE_WORDS.map((word, index) => (
              <Fragment key={word.text}>
                <span
                  className="jt-word"
                  style={intro(`calc(var(--intro-headline-delay) + var(--intro-word-step) * ${index})`)}
                >
                  <span className={`jt-word-inner${word.accent ? " text-gradient" : ""}`}>{word.text}</span>
                </span>
                {index < HEADLINE_WORDS.length - 1 ? " " : null}
              </Fragment>
            ))}
          </h1>

          <p className="jt-intro mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg" style={intro("var(--intro-sub-delay)")}>
            Jazari Tech designs, builds and operates the software, commerce and AI systems growing
            companies depend on — from first prototype to production scale, with the engineering
            discipline of a long-term partner.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="#start" className="jt-intro" style={intro("var(--intro-cta-delay)")}>
              <Button size="sm" className="px-6 py-3.5 text-sm" iconRight={<ArrowRightIcon size={16} />}>
                Start your project
              </Button>
            </Link>
            <Link
              href="#products"
              className="jt-intro"
              style={intro("calc(var(--intro-cta-delay) + 80ms)")}
            >
              <Button variant="outline" size="sm" className="px-6 py-3.5 text-sm">
                Explore our products
              </Button>
            </Link>
          </div>

          <div className="jt-intro mt-6 flex flex-wrap items-center gap-x-7 gap-y-4" style={intro("var(--intro-trust-delay)")}>
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

          {/* Animated counters */}
          <dl
            className="jt-intro mt-6 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6"
            style={intro("var(--intro-counters-delay)")}
          >
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
        </div>

        {/* ---------------- Visual composition ---------------- */}
        {/* Static fallback (orbit rings, tiles, brand icon) crossfades out
            when the lazy WebGL scene reports ready via `data-scene`. */}
        <div
          ref={visualRef}
          data-scene="fallback"
          className="relative mx-auto flex min-h-[24rem] w-full max-w-md items-center justify-center lg:min-h-[30rem] lg:max-w-none"
        >
          <div className="hero-decor" aria-hidden="true">
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

          {/* Glass preview card + connector + hotspot now live in HeroScene
              (backend-driven content, projected onto the 3D anchor) */}

          {/* Jazari ribbon/diamond motif — the supplied brand icon */}
          <div
            className="glass absolute left-0 top-6 hidden size-16 items-center justify-center rounded-2xl shadow-[var(--shadow-card)] sm:flex"
            data-parallax="0.08"
          >
            <Logo variant="mark" sizes="48px" className="float-medium size-11" />
          </div>
          </div>{/* /.hero-decor */}

          {/* Procedural Three.js scene — loads lazily, never blocks content */}
          <HeroScene hostRef={visualRef} />
        </div>
      </div>
    </section>
  );
}

export default Hero;
