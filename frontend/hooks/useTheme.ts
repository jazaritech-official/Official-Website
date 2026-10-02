"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "jazari-theme";
const THEME_EVENT = "jazari:theme-change";

const isPreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

/* --- External store: stored preference (localStorage + custom event) ------ */

function readStoredTheme(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isPreference(value)) return value;
  } catch {
    // Storage blocked (private mode) — fall back to system.
  }
  return "system";
}

function subscribePreference(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/* --- External store: system color scheme (prefers-color-scheme) ----------- */

function readSystemDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribeSystem(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/* --- Applying the theme to <html> ---------------------------------------- */

/** Mirrors the inline no-flash script: toggles `.dark` and `color-scheme`. */
export function applyTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  const resolved: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  return resolved;
}

/**
 * Theme state shared by navbar, admin top bar and mobile menu.
 *
 * Preference and system appearance are read through useSyncExternalStore, so
 * the component mirrors localStorage/media-query changes without any state
 * resets inside effects (including changes made by other tabs).
 */
export function useTheme() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribePreference,
    readStoredTheme,
    () => "system",
  );
  const systemDark = useSyncExternalStore(subscribeSystem, readSystemDark, () => false);

  const resolved: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  // Synchronize the document with the resolved theme (external system).
  useEffect(() => {
    applyTheme(preference, systemDark);
  }, [preference, systemDark]);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the theme still applies for this session.
    }
    applyTheme(next, readSystemDark());
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return { preference, resolved, setTheme, toggle };
}

export default useTheme;
