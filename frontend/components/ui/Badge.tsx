import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface text-muted",
  info: "border-accent/35 bg-accent-soft text-accent",
  success: "border-growth/45 bg-growth/12 text-growth-ink",
  warning: "border-warning/40 bg-warning/12 text-warning",
  danger: "border-danger/40 bg-danger-soft text-danger",
};

/**
 * Status chip. Tone is always paired with a text label, so status is never
 * communicated through colour alone.
 */
export function Badge({ children, tone = "neutral", icon, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold tracking-wide ${TONE_CLASS[tone]} ${className}`.trim()}
    >
      {icon}
      {children}
    </span>
  );
}

export default Badge;
