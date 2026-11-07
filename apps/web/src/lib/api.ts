/**
 * Client HTTP typé de l'API (PLAN.md §5), appelée en même origine via le rewrite Next `/api/*` (D12).
 * - cookies httpOnly envoyés automatiquement (`credentials: "include"`) ;
 * - erreurs normalisées en `ApiError { statusCode, message, code }` ;
 * - sur 401 : une seule tentative de `POST /auth/refresh` (partagée entre requêtes concurrentes),
 *   puis la requête est rejouée ; sinon redirection vers /connexion?next=….
 *
 * Le jeton de rafraîchissement est posé par l'API avec `Path=/auth` : le navigateur ne l'envoie
 * que sur une URL commençant par /auth. Le rafraîchissement et la déconnexion passent donc par
 * le rewrite `/auth/*` (voir next.config.ts) et non par `/api/auth/*`.
 */

import type { ApiErrorBody, MeResponse } from "./types";

export const API_PREFIX = "/api";
export const REFRESH_URL = "/auth/refresh";
export const LOGOUT_URL = "/auth/logout";

const STATUS_MESSAGES: Record<number, string> = {
  400: "La demande est invalide. Vérifiez les informations saisies.",
  401: "Votre session a expiré. Veuillez vous reconnecter.",
  403: "Vous n'avez pas les droits nécessaires pour cette action.",
  404: "Élément introuvable.",
  409: "Cette action est en conflit avec l'état actuel.",
  429: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
  500: "Le serveur a rencontré une erreur. Réessayez plus tard.",
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(statusCode: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.body = body;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Message lisible en français pour n'importe quelle erreur. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  return "Une erreur inattendue est survenue.";
}

function messageFromBody(body: unknown, status: number): { message: string; code?: string } {
  if (body && typeof body === "object") {
    const b = body as Partial<ApiErrorBody> & { error?: string };
    const raw = Array.isArray(b.message) ? b.message.join(" · ") : b.message;
    const message = typeof raw === "string" && raw.trim() ? raw : (STATUS_MESSAGES[status] ?? STATUS_MESSAGES[500]);
    return { message, code: typeof b.code === "string" ? b.code : undefined };
  }
  return { message: STATUS_MESSAGES[status] ?? STATUS_MESSAGES[500] };
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** false : pas de rafraîchissement ni de redirection sur 401 (écrans d'authentification). */
  auth?: boolean;
  signal?: AbortSignal;
};

export type ApiClientDeps = {
  fetch?: typeof fetch;
  /** Appelé quand la session ne peut pas être rafraîchie. */
  onUnauthenticated?: () => void;
  prefix?: string;
  refreshUrl?: string;
};

export function loginRedirectUrl(pathname: string, search = ""): string {
  const next = `${pathname}${search}`;
  return next && next !== "/" ? `/connexion?next=${encodeURIComponent(next)}` : "/connexion";
}

function defaultOnUnauthenticated() {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname.startsWith("/connexion")) return;
  window.location.assign(loginRedirectUrl(pathname, search));
}

export function createApiClient(deps: ApiClientDeps = {}) {
  const doFetch: typeof fetch = deps.fetch ?? ((...args) => fetch(...args));
  const prefix = deps.prefix ?? API_PREFIX;
  const refreshUrl = deps.refreshUrl ?? REFRESH_URL;
  const onUnauthenticated = deps.onUnauthenticated ?? defaultOnUnauthenticated;
  let refreshing: Promise<boolean> | null = null;

  function refresh(): Promise<boolean> {
    if (!refreshing) {
      refreshing = doFetch(refreshUrl, { method: "POST", credentials: "include" })
        .then((r) => r.ok)
        .catch(() => false)
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  async function send(path: string, opts: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const init: RequestInit = {
      method: opts.method ?? "GET",
      credentials: "include",
      headers,
      signal: opts.signal,
    };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    try {
      return await doFetch(`${prefix}${path}`, init);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new ApiError(0, "Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.", "NETWORK_ERROR");
    }
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let res = await send(path, opts);
    if (res.status === 401 && opts.auth !== false) {
      if (await refresh()) res = await send(path, opts);
      if (res.status === 401) {
        onUnauthenticated();
        throw new ApiError(401, STATUS_MESSAGES[401], "UNAUTHENTICATED");
      }
    }
    const body = await readBody(res);
    if (!res.ok) {
      const { message, code } = messageFromBody(body, res.status);
      throw new ApiError(res.status, message, code, body);
    }
    return body as T;
  }

  return {
    request,
    refresh,
    get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) => request<T>(path, { ...opts, method: "GET" }),
    post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
      request<T>(path, { ...opts, method: "POST", body }),
    patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
      request<T>(path, { ...opts, method: "PATCH", body }),
    del: <T = void>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
      request<T>(path, { ...opts, method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Client partagé du navigateur. */
export const api = createApiClient();

/** Déconnexion : révoque le refresh token (cookie Path=/auth) puis efface les cookies. */
export async function logout(fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<void> {
  try {
    await fetchImpl(LOGOUT_URL, { method: "POST", credentials: "include" });
  } catch {
    // La redirection vers /connexion a lieu quoi qu'il arrive.
  }
}

/** Sécurise le paramètre `next` : chemin interne uniquement (pas de redirection ouverte). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/connexion") || next.startsWith("/inscription")) return null;
  return next;
}

/** Destination après connexion : `next` sûr, sinon /admin (super admin sans entreprise) ou /app. */
export function postLoginPath(me: Pick<MeResponse, "user" | "company"> | null, next: string | null): string {
  const safe = safeNext(next);
  if (safe) return safe;
  if (me?.user.globalRole === "SUPER_ADMIN" && !me.company) return "/admin";
  return "/app";
}
