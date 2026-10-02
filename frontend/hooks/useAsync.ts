"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

interface RunOptions {
  /** Skip the loading flag — refreshes that should keep the current view. */
  silent?: boolean;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  /**
   * Re-runs the loader. Call from event handlers (buttons, filter changes):
   * the synchronous loading flag is safe outside of effects.
   * `silent` refreshes without clearing the view.
   */
  run: (options?: RunOptions) => Promise<T | null>;
  /** Directly replace the value (optimistic updates). */
  setData: (updater: T | ((current: T | null) => T)) => void;
}

function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  return new ApiError("Something went wrong. Please try again.", { code: "UNEXPECTED" });
}

/**
 * Loading / error / retry lifecycle for admin views that mutate their own
 * data (tables with in-place updates, uploads, deletions).
 *
 * The initial load happens once on mount with state updates confined to
 * promise callbacks; every later fetch is triggered explicitly through
 * `run()` from an event handler.
 */
export function useAsync<T>(loader: () => Promise<T>): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const loaderRef = useRef(loader);

  // Keep the latest inline loader available without re-running the load.
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let active = true;

    loaderRef
      .current()
      .then((result) => {
        if (active) {
          setDataState(result);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(toApiError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const run = useCallback(async (options?: RunOptions) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      setDataState(result);
      setLoading(false);
      return result;
    } catch (cause) {
      setError(toApiError(cause));
      setLoading(false);
      return null;
    }
  }, []);

  const setData = useCallback((updater: T | ((current: T | null) => T)) => {
    setDataState((current) =>
      typeof updater === "function" ? (updater as (value: T | null) => T)(current) : updater,
    );
  }, []);

  return { data, loading, error, run, setData };
}

export default useAsync;
