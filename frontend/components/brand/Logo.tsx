import Image from "next/image";
import logoHorizontal from "@/public/brand/logo-horizontal.png";
import logoStacked from "@/public/brand/logo-stacked.png";
import logoIcon from "@/public/brand/logo-icon.png";
import appIconLight from "@/public/brand/app-icon-light.png";
import appIconDark from "@/public/brand/app-icon-dark.png";

export type LogoVariant = "horizontal" | "stacked" | "icon" | "app-light" | "app-dark";

const SOURCES = {
  horizontal: logoHorizontal,
  stacked: logoStacked,
  icon: logoIcon,
  "app-light": appIconLight,
  "app-dark": appIconDark,
} satisfies Record<LogoVariant, { src: string; width: number; height: number }>;

interface LogoProps {
  variant?: LogoVariant;
  alt?: string;
  className?: string;
  /** Tailwind `sizes` hint — keeps the optimized payload small. */
  sizes?: string;
  /** Load eagerly (above-the-fold brand marks only). */
  priority?: boolean;
  /**
   * On dark surfaces the navy lockup sits on a soft light plate so it stays
   * readable — the artwork itself is never filtered, inverted or distorted.
   */
  plate?: boolean;
}

/**
 * Jazari brand marks, always rendered from the owner-supplied files in
 * `public/brand/`. Never recreate, crop or recolour the logo in code.
 */
export function Logo({
  variant = "horizontal",
  alt = "Jazari Tech",
  className = "",
  sizes,
  priority = false,
  plate = true,
}: LogoProps) {
  const source = SOURCES[variant];
  const isLockup = variant === "horizontal" || variant === "stacked";

  return (
    <span
      className={[
        "relative inline-flex items-center justify-center",
        plate && isLockup ? "dark:rounded-xl dark:bg-white dark:px-2.5 dark:py-1.5" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Image
        src={source.src}
        width={source.width}
        height={source.height}
        alt={alt}
        sizes={sizes ?? "100vw"}
        priority={priority}
        className="h-auto w-full object-contain"
      />
    </span>
  );
}

export default Logo;
