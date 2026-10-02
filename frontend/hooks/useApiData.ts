"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

export interface ApiState<R> {
  /** Result of the loader for the current request id (`key::attempt`). */
  data: R | null;
  loading: boolean;
  error: ApiError | null;
  /** Full refresh — shows the loading state again. */
  reload: () => void;
  /** Optimistically replace the loaded result (keeps the loading flag off). */
  setData: (updater: R | ((current: R | null) => R)) => void;
}

interface Result<R> {
  /** Identifies which request produced this result (`key::attempt`). */
  id: string;
  data?: R;
  error?: ApiError;
}

/**
 * Shared loading / success / error / retry lifecycle for API-backed UI.
 *
 * Loading and error states are *derived* from whether a result exists for the
 * current request id, so no state has to be reset inside the effect (which
 * would cascade renders). The loader runs through a ref, requests abort when
 * the key changes or the component unmounts, and the last response wins.
 *
 * Works for plain payloads (`Product[]`) and envelopes
 * (`{ data: Submission[]; meta: PaginationMeta }`).
 */
export function useApiData<R>(loader: (signal: AbortSignal) => Promise<R>, key = ""): ApiState<R> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<R> | null>(null);
  const loaderRef = useRef(loader);

  // Keep the latest inline loader available to the request effect without
  // re-running it on every render.
  useEffect(() => {
    loaderRef.current = loader;
  });

  const requestId = `${key}::${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    loaderRef
      .current(controller.signal)
      .then((data) => {
        if (active) setResult({ id: requestId, data });
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        setResult({
          id: requestId,
          error:
            cause instanceof ApiError
              ? cause
              : new ApiError("Something went wrong while loading this content.", { code: "UNEXPECTED" }),
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [requestId]);

  const matched = result !== null && result.id === requestId;

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const setData = useCallback((updater: R | ((current: R | null) => R)) => {
    setResult((current) => {
      if (!current) return current;
      const value = typeof updater === "function" ? (updater as (value: R | null) => R)(current.data ?? null) : updater;
      return { ...current, data: value };
    });
  }, []);

  return {
    data: matched ? (result?.data ?? null) : null,
    loading: !matched,
    error: matched ? (result?.error ?? null) : null,
    reload,
    setData,
  };
}

export default useApiData;
