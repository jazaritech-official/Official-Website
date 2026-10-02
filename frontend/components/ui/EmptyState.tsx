import type { ReactNode } from "react";
import { InboxIcon } from "@/components/icons";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Polished empty/loading fallback — never leave a blank region. */
export function EmptyState({ title, description, icon, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center ${className}`.trim()}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-elevated text-accent shadow-[var(--shadow-subtle)]">
        {icon ?? <InboxIcon size={22} />}
      </span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
