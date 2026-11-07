"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

type State<T> = { key: string | null; data?: T; error?: ApiError };

/**
 * Chargement simple d'une ressource GET. `path = null` suspend la requête.
 * Les mises à jour d'état n'ont lieu que dans les callbacks de la promesse.
 */
export function useApi<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const key = path ? `${path}#${version}` : null;
  const [state, setState] = useState<State<T>>({ key: null });

  useEffect(() => {
    if (!path || !key) return;
    const controller = new AbortController();
    api.get<T>(path, { signal: controller.signal }).then(
      (data) => setState({ key, data }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState((s) => ({
          key,
          data: s.data,
          error: error instanceof ApiError ? error : new ApiError(0, "Une erreur inattendue est survenue."),
        }));
      },
    );
    return () => controller.abort();
  }, [path, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const mutate = useCallback((fn: (data: T | undefined) => T | undefined) => {
    setState((s) => ({ ...s, data: fn(s.data) }));
  }, []);

  const settled = key !== null && state.key === key;
  return {
    data: state.data,
    error: settled ? state.error : undefined,
    loading: key !== null && !settled,
    reload,
    mutate,
  };
}
