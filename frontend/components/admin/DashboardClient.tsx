"use client";

import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Counter } from "@/components/motion/Counter";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { iconRegistry, RefreshIcon, type IconName } from "@/components/icons";
import type { DashboardSeriesPoint, DashboardStats } from "@/types/api";

const CARDS: { key: keyof Pick<DashboardStats, "products" | "logos"> | "submissions" | "today" | "total"; label: string; icon: IconName; hint: string }[] = [
  { key: "products", label: "Products", icon: "layers", hint: "In the product catalogue" },
  { key: "logos", label: "Logos", icon: "palette", hint: "Uploaded brand assets" },
  { key: "submissions", label: "Submissions", icon: "inbox", hint: "Project requests received" },
  { key: "today", label: "Unique visitors today", icon: "users", hint: "Since 00:00 UTC" },
  { key: "total", label: "Total unique visitors", icon: "globe", hint: "All time, deduplicated" },
];

function valueFor(stats: DashboardStats, key: (typeof CARDS)[number]["key"]): number {
  if (key === "products") return stats.products;
  if (key === "logos") return stats.logos;
  if (key === "submissions") return stats.submissions.total;
  if (key === "today") return stats.visitors.todayUnique;
  return stats.visitors.totalUnique;
}

function VisitorChart({ series }: { series: DashboardSeriesPoint[] }) {
  const width = 720;
  const height = 230;
  const padLeft = 40;
  const padTop = 14;
  const padBottom = 30;
  const innerWidth = width - padLeft - 10;
  const innerHeight = height - padTop - padBottom;
  const max = Math.max(1, ...series.map((point) => point.uniqueVisitors));
  const slot = innerWidth / Math.max(series.length, 1);
  const barWidth = Math.min(26, slot * 0.55);

  const ticks = [0, 0.5, 1];

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="visitors-chart-title visitors-chart-desc"
        className="w-full"
      >
        <title id="visitors-chart-title">Unique visitors over the last 14 days</title>
        <desc id="visitors-chart-desc">
          {series.map((point) => `${point.date}: ${point.uniqueVisitors}`).join("; ")}
        </desc>

        {ticks.map((tick) => {
          const y = padTop + innerHeight - tick * innerHeight;
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - 10}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray={tick === 0 ? "0" : "4 6"}
              />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--muted)">
                {Math.round(tick * max)}
              </text>
            </g>
          );
        })}

        {series.map((point, index) => {
          const value = point.uniqueVisitors;
          const barHeight = (value / max) * innerHeight;
          const x = padLeft + index * slot + (slot - barWidth) / 2;
          const y = padTop + innerHeight - barHeight;
          const showLabel = index % 3 === 0 || index === series.length - 1;

          return (
            <g key={point.date}>
              <rect
                x={x}
                y={value === 0 ? padTop + innerHeight - 2 : y}
                width={barWidth}
                height={value === 0 ? 2 : Math.max(barHeight, 3)}
                rx={5}
                fill={value === 0 ? "var(--border)" : "var(--accent)"}
              >
                <title>{`${point.date} — ${point.uniqueVisitors} unique visitors, ${point.visits} visits`}</title>
              </rect>
              {showLabel && (
                <text
                  x={x + barWidth / 2}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--muted)"
                >
                  {point.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-xs text-muted">
        Unique visitors per day (UTC), deduplicated by IP. Bars with value zero show baseline.
      </figcaption>
    </figure>
  );
}

function StatSkeleton() {
  return (
    <div className="card p-5" aria-hidden="true">
      <Skeleton className="size-9 rounded-xl" />
      <Skeleton className="mt-4 h-7 w-16" />
      <Skeleton className="mt-2 h-3.5 w-28" />
    </div>
  );
}

/** Real counts only — an empty database reports zeros, never invented numbers. */
export function DashboardClient() {
  const { data, loading, error, reload } = useApiData(() => api.admin.stats(), "admin-stats");

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <StatSkeleton key={index} />
          ))}
        </div>
        <div className="card p-6">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="mt-4 h-56 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Dashboard data unavailable"
        description={error?.message ?? "No data was returned by the API."}
        icon={<RefreshIcon size={22} />}
        action={
          <Button variant="outline" size="sm" onClick={reload}>
            Try again
          </Button>
        }
      />
    );
  }

  const submissions = data.submissions;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {CARDS.map((card) => {
          const Icon = iconRegistry[card.icon];
          return (
            <div key={card.key} className="card group p-5 transition-shadow hover:shadow-[var(--shadow-card)]">
              <span className="inline-flex rounded-xl bg-accent-soft p-2.5 text-accent">
                <Icon size={18} />
              </span>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
                <Counter value={valueFor(data, card.key)} />
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{card.label}</p>
              <p className="mt-0.5 text-xs text-muted">{card.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Traffic chart */}
        <section aria-labelledby="traffic-heading" className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="traffic-heading" className="text-base font-semibold">
                Traffic — last 14 days
              </h2>
              <p className="mt-1 text-xs text-muted">
                {data.visitors.totalVisits.toLocaleString("en-US")} recorded visits in total
              </p>
            </div>
            <Badge tone={data.mongoReady ? "success" : "warning"}>
              {data.mongoReady ? "Database connected" : "Database disconnected"}
            </Badge>
          </div>

          {data.visitors.series.every((point) => point.uniqueVisitors === 0) ? (
            <div className="mt-6">
              <EmptyState
                title="No traffic recorded yet"
                description="Visitor analytics appear here as soon as the public site starts receiving visits."
                className="py-8"
              />
            </div>
          ) : (
            <VisitorChart series={data.visitors.series} />
          )}
        </section>

        {/* Submissions breakdown */}
        <section aria-labelledby="submissions-heading" className="card p-5 sm:p-6">
          <h2 id="submissions-heading" className="text-base font-semibold">
            Project requests
          </h2>
          <p className="mt-1 text-xs text-muted">Pipeline status of every submission</p>

          <dl className="mt-5 space-y-3">
            {(
              [
                { label: "New", value: submissions.New, tone: "info" },
                { label: "Contacted", value: submissions.Contacted, tone: "warning" },
                { label: "Closed", value: submissions.Closed, tone: "success" },
              ] as const
            ).map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <Badge tone={row.tone}>{row.label}</Badge>
                </dt>
                <dd className="text-lg font-semibold text-foreground">
                  <Counter value={row.value} />
                </dd>
              </div>
            ))}
          </dl>

          <a
            href="/admin/submissions"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            Manage submissions
            <RefreshIcon size={14} />
          </a>
        </section>
      </div>

      <p className="text-xs text-muted">
        Stats generated {new Date(data.generatedAt).toLocaleString("en-US")} — straight from
        MongoDB, no cached or sample values.
      </p>
    </div>
  );
}

export default DashboardClient;
