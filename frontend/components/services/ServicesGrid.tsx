"use client";

import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Reveal } from "@/components/motion/Reveal";
import { Skeleton } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ArrowUpRightIcon, iconRegistry, InfoIcon, RefreshIcon, type IconName } from "@/components/icons";
import type { Service } from "@/types/api";

function ServiceCard({ service }: { service: Service }) {
  const Icon = iconRegistry[service.icon as IconName] ?? InfoIcon;

  return (
    <article className="card card-hover group relative flex h-full flex-col gap-4 p-6">
      <span className="icon-interactive inline-flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon size={21} animated="pulse" />
      </span>

      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug">{service.title}</h3>
        <ArrowUpRightIcon
          size={16}
          className="mt-1 shrink-0 text-muted opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent group-hover:opacity-100"
        />
      </div>

      <p className="text-sm leading-relaxed text-muted">{service.description}</p>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="card flex h-full flex-col gap-4 p-6" aria-hidden="true">
      <Skeleton className="size-11 rounded-xl" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
    </div>
  );
}

/**
 * Section 5 — service capability grid. Service records (title, copy, icon key)
 * live in MongoDB, so the frontend never keeps a conflicting list.
 */
export function ServicesGrid() {
  const { data, loading, error, reload } = useApiData(() => api.services(), "services");
  const services = data ?? [];

  return (
    <section id="services" aria-labelledby="services-heading" className="border-y border-line bg-surface py-16 sm:py-20">
      <div className="container-page">
        <div className="max-w-2xl">
          <Reveal variant="fade-in">
            <p className="eyebrow">Our Services</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 id="services-heading" className="mt-3 text-h3 font-semibold">
              One partner across engineering, growth and design
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Fourteen disciplines under one accountable team — so strategy, build and operations
              never fall between vendors.
            </p>
          </Reveal>
        </div>

        {loading ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </div>
        ) : error ? (
          <div className="mt-10">
            <EmptyState
              title="Services are temporarily unavailable"
              description={error.message}
              icon={<RefreshIcon size={22} />}
              action={
                <Button variant="outline" size="sm" onClick={reload}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : services.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="Service catalogue is being updated"
              description="We're refreshing our service definitions. Please check back in a moment."
              icon={<RefreshIcon size={22} />}
              action={
                <Button variant="outline" size="sm" onClick={reload}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service, index) => (
              <Reveal key={service._id} delay={(index % 3) * 80} className="h-full">
                <ServiceCard service={service} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default ServicesGrid;
