import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/icons";

/**
 * Section 7 — closing brand statement. A single elegant display line with a
 * restrained highlight sweep (brand colors only, disabled under reduced
 * motion) and a final pair of calls to action.
 */
export function BrandStatement() {
  return (
    <section
      aria-labelledby="brand-statement-heading"
      className="relative overflow-hidden border-t border-line bg-background py-20 sm:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,color-mix(in_srgb,var(--accent)_12%,transparent),transparent)]"
      />

      <div className="container-page text-center">
        <Reveal variant="fade-in">
          <p className="eyebrow">Engineered with intent</p>
        </Reveal>

        <Reveal delay={100}>
          <h2
            id="brand-statement-heading"
            className="shine mt-6 text-[clamp(2.25rem,7vw,5.5rem)] font-semibold leading-[1.03] tracking-tight"
          >
            Jazari Tech Official
          </h2>
        </Reveal>

        <Reveal delay={190}>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Deep-navy engineering discipline, technology-blue momentum, and a growth mindset in
            every release — so your platform keeps compounding long after launch day.
          </p>
        </Reveal>

        <Reveal delay={270}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="#start">
              <Button size="sm" className="px-6 py-3.5" iconRight={<ArrowRightIcon size={16} />}>
                Start your project
              </Button>
            </Link>
            <Link href="#services">
              <Button variant="outline" size="sm" className="px-6 py-3.5">
                Browse services
              </Button>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default BrandStatement;
