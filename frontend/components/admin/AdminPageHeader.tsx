import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  /** Plain-language page name, e.g. "Homepage Logos". */
  title: string;
  /** One-line explanation of what this section is for. */
  purpose: string;
  /** Optional "Where this appears on the site" hint. */
  where?: string;
  /** Optional right-aligned actions (buttons, filters). */
  actions?: ReactNode;
  /** Mono eyebrow — the sidebar group this page belongs to. */
  group?: string;
}

/**
 * One reusable header for every admin page, so a non-technical owner always gets
 * the same three answers: WHAT this is, WHY it exists, and WHERE it shows up.
 * Do not copy this markup into individual pages — extend this component instead.
 */
export function AdminPageHeader({ title, purpose, where, actions, group = "Content" }: AdminPageHeaderProps) {
  return (
    <header className="admin-page-header relative mb-6 border-b border-line pb-5">
      {/* Blueprint corner tick — the Jazari signature, decorative only. */}
      <span aria-hidden="true" className="admin-page-header__tick" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-muted">
            {group}
          </p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{purpose}</p>
          {where ? (
            <p className="mt-2 inline-flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted">
              <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-growth" />
              <span>
                <span className="font-semibold text-foreground">Where this appears:</span> {where}
              </span>
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export default AdminPageHeader;
