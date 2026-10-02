"use client";

import { api } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

/**
 * Footer service links — served from the API so the footer can never drift
 * from the services section. Renders nothing while loading or on failure,
 * keeping the footer layout stable.
 */
export function ServiceLinks({ limit = 6 }: { limit?: number }) {
  const { data } = useApiData(() => api.services(), "footer-services");
  const services = (data ?? []).slice(0, limit);

  if (services.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2.5">
      {services.map((service) => (
        <li key={service._id}>
          <a
            href="#services"
            className="text-sm text-muted transition-colors duration-200 hover:text-foreground"
          >
            {service.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default ServiceLinks;
