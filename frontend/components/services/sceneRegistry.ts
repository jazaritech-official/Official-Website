/**
 * SCENE REGISTRY — one lazy chunk per service scene.
 *
 * The key is the service `slug` (the backend is the source of truth for the
 * catalogue, so the registry maps its real slugs — verified against
 * `Backend/scripts/seed-core.js`). A slug the registry does not know yet falls
 * back to `GenericScene`, so adding a service in the admin never breaks the
 * preview card.
 *
 * WHY LAZY: each scene is its own dynamic import, so opening the card downloads
 * exactly one scene (~3–6 KB gzip) instead of all fourteen. `prefetchScene()` is
 * called on `pointerenter`/focus of a row and the first three scenes are warmed
 * once the section is idle, so the hover itself never waits on the network.
 */
import type { ComponentType } from "react";

export type SceneComponent = ComponentType;

/** Slug → loader. Every entry is a separate chunk. */
const LOADERS: Record<string, () => Promise<{ default: SceneComponent }>> = {
  "software-solutions": () => import("./scenes/SoftwareScene"),
  "business-growth": () => import("./scenes/GrowthScene"),
  "graphic-designing": () => import("./scenes/DesignScene"),
  marketing: () => import("./scenes/MarketingScene"),
  "ai-solutions": () => import("./scenes/AiScene"),
  "e-commerce": () => import("./scenes/CommerceScene"),
  "mobile-app-development": () => import("./scenes/MobileScene"),
  "web-development": () => import("./scenes/WebScene"),
  "ui-ux-design": () => import("./scenes/UiUxScene"),
  "cloud-and-devops": () => import("./scenes/CloudScene"),
  cybersecurity: () => import("./scenes/SecurityScene"),
  "data-and-analytics": () => import("./scenes/DataScene"),
  "it-consulting": () => import("./scenes/ConsultingScene"),
  automation: () => import("./scenes/AutomationScene"),
};

/** Descriptions for the docs + the harness, kept next to the mapping. */
export const SCENE_KEYS = Object.keys(LOADERS);

const resolved = new Map<string, SceneComponent>();
const inflight = new Map<string, Promise<SceneComponent>>();

/** The generic fallback, loaded once and shared. */
let generic: Promise<SceneComponent> | null = null;
function loadGeneric(): Promise<SceneComponent> {
  if (!generic) {
    generic = import("./scenes/GenericScene").then((module) => module.default);
  }
  return generic;
}

/**
 * Resolve a slug to its scene component. Unknown slugs resolve to the generic
 * scene (never to an error) — the card always has something to draw.
 */
export function loadScene(slug: string | null | undefined): Promise<SceneComponent> {
  const key = (slug ?? "").trim();
  const cached = resolved.get(key);
  if (cached) return Promise.resolve(cached);
  const loader = LOADERS[key];
  if (!loader) return loadGeneric();
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = loader()
    .then((module) => {
      resolved.set(key, module.default);
      inflight.delete(key);
      return module.default;
    })
    .catch(() => {
      inflight.delete(key);
      return loadGeneric();
    });
  inflight.set(key, promise);
  return promise;
}

/** Warm one scene (hover intent) — never awaited by the UI. */
export function prefetchScene(slug: string | null | undefined): void {
  void loadScene(slug);
}

/** Warm the first few scenes once the section is idle. */
export function prefetchScenes(slugs: Array<string | null | undefined>, limit = 3): void {
  slugs.slice(0, limit).forEach((slug) => prefetchScene(slug));
}

/** True when the registry has a dedicated scene for this slug. */
export function hasScene(slug: string | null | undefined): boolean {
  return Boolean(LOADERS[(slug ?? "").trim()]);
}
