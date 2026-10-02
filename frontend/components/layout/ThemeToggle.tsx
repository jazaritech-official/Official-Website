"use client";

import { useTheme, type ThemePreference } from "@/hooks/useTheme";
import { SunIcon, MoonIcon, SystemIcon } from "@/components/icons";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light theme", Icon: SunIcon },
  { value: "dark", label: "Dark theme", Icon: MoonIcon },
  { value: "system", label: "System theme", Icon: SystemIcon },
];

interface ThemeToggleProps {
  /** `compact` = icons only (navbar), `full` = icon + label (mobile/admin). */
  variant?: "compact" | "full";
  className?: string;
}

export function ThemeToggle({ variant = "compact", className = "" }: ThemeToggleProps) {
  const { preference, setTheme } = useTheme();
  const isFull = variant === "full";

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={`inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-1 ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-full px-2.5 py-1.5 text-sm transition-colors duration-200",
              isFull ? "px-3" : "",
              active
                ? "bg-primary text-primary-contrast shadow-[var(--shadow-subtle)]"
                : "text-muted hover:text-foreground hover:bg-surface-elevated",
            ].join(" ")}
          >
            <Icon size={15} />
            {isFull ? <span className="text-xs font-medium">{value}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default ThemeToggle;
