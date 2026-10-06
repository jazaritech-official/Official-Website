import Image from "next/image";
import logoMain from "@/public/brand/logo-main.png";

/**
 * `full`    — mark + stacked wordmark ("Jazari Tech" / "OFFICIAL")
 * `compact` — mark + single-line wordmark ("Jazari Tech")
 * `mark`    — the mark on its own (favicon-style / icon tiles)
 */
export type LogoVariant = "full" | "compact" | "mark";

export interface LogoProps {
  variant?: LogoVariant;
  /** Accessible name for the mark. Defaults to the full company name. */
  alt?: string;
  /** Wrapper classes — set the height here (e.g. `h-8`). */
  className?: string;
  /** Optional classes for the mark image itself. */
  markClassName?: string;
  /** Tailwind `sizes` hint — keeps the optimized payload small. */
  sizes?: string;
  /** Load eagerly (above-the-fold brand marks only). */
  priority?: boolean;
}

/**
 * The single reusable Jazari brand mark.
 *
 * Renders the trimmed `Main Logo` artwork (a genuinely transparent PNG built by
 * `scripts/build-logo-assets.mjs`) plus **live HTML text** — there is no white
 * plate and nothing is baked into an image. Colours come from the design tokens
 * so the wordmark is correct in Light and Dark:
 *   - "Jazari"  → Deep Navy (Light) / readable light tone (Dark)
 *   - "Tech"    → Technology Blue
 *   - "OFFICIAL" → Official Slate with wide tracking
 */
export function Logo({
  variant = "full",
  alt = "Jazari Tech Official",
  className = "",
  markClassName = "",
  sizes = "200px",
  priority = false,
}: LogoProps) {
  if (variant === "mark") {
    return (
      <span className={`relative inline-flex items-center justify-center ${className}`.trim()}>
        <Image
          src={logoMain.src}
          width={logoMain.width}
          height={logoMain.height}
          alt={alt}
          sizes={sizes}
          priority={priority}
          className={`h-full w-auto object-contain ${markClassName}`.trim()}
        />
      </span>
    );
  }

  return (
    <span
      className={`relative inline-flex items-center gap-2.5 ${className}`.trim()}
    >
      {/* Decorative: the live wordmark below carries the accessible name. */}
      <Image
        src={logoMain.src}
        width={logoMain.width}
        height={logoMain.height}
        alt=""
        aria-hidden="true"
        sizes={sizes}
        priority={priority}
        className={`h-full w-auto shrink-0 object-contain ${markClassName}`.trim()}
      />

      <span className="flex flex-col justify-center leading-none">
        <span className="text-[0.95rem] font-semibold tracking-tight text-primary dark:text-foreground">
          Jazari <span className="text-accent">Tech</span>
          {variant === "compact" ? <span className="sr-only">Official</span> : null}
        </span>
        {variant === "full" ? (
          <span className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-muted">
            Official
          </span>
        ) : null}
      </span>
    </span>
  );
}

export default Logo;
