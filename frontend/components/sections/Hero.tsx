"use client";

import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Counter } from "@/components/motion/Counter";
import { HeroMark } from "@/components/sections/HeroMark";
import { ArrowRightIcon, StarIcon } from "@/components/icons";

/**
 * Premium hero — strong typography, trust signals and animated counters beside
 * the Jazari mark, which is now a real inline-SVG build (`HeroMark`).
 *
 * The previous WebGL hero (neon dust, a Voronoi fracture of a boxed support
 * object, orbit rings, floating tiles and a glass "Featured service" card) was
 * removed in Task L. There is no canvas and no rAF loop in this section; every
 * animation is a CSS `transform`/`opacity` transition on the SVG mark.
 */

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

export function Hero() {
  return (
    <section id="home" className="relative overflow-hidden pb-14 pt-28 sm:pb-20 sm:pt-32">
      {/* Decorative backdrop — CSS-only atmosphere + blueprint grid. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-aurora">
          <span className="hero-aurora__blob hero-aurora__blob--a" />
          <span className="hero-aurora__blob hero-aurora__blob--b" />
          <span className="hero-aurora__blob hero-aurora__blob--c" />
        </div>
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

      <div className="container-page grid items-center gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
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
            <Link href="#products" className="jt-intro" style={intro("calc(var(--intro-cta-delay) + 80ms)")}>
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
                  { initials: "MR", tone: "bg-accent dark:bg-[#2f5f9e]" },
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

        {/* ---------------- The mark + service tooltips ---------------- */}
        <div className="hero-visual">
          <HeroMark />
        </div>
      </div>
    </section>
  );
}

export default Hero;
