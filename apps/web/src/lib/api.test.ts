import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, loginRedirectUrl, logout, postLoginPath, safeNext } from "./api";
import type { MeResponse } from "./types";

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Call = { url: string; init?: RequestInit };

/** fetch simulé : répond selon une file de réponses par URL. */
function fakeFetch(routes: Record<string, (Response | (() => Response))[]>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const queue = routes[url];
    if (!queue?.length) throw new Error(`Appel inattendu : ${url}`);
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return typeof next === "function" ? next() : next.clone();
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("client API", () => {
  it("préfixe /api, envoie les cookies et sérialise le JSON", async () => {
    const { impl, calls } = fakeFetch({ "/api/watch-preferences": [json(201, { id: "p1" })] });
    const client = createApiClient({ fetch: impl });
    const res = await client.post<{ id: string }>("/watch-preferences", { name: "Veille" });
    expect(res).toEqual({ id: "p1" });
    expect(calls[0].init?.credentials).toBe("include");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(JSON.stringify({ name: "Veille" }));
    expect((calls[0].init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("renvoie undefined sur 204", async () => {
    const { impl } = fakeFetch({ "/api/watch-preferences/p1": [new Response(null, { status: 204 })] });
    await expect(createApiClient({ fetch: impl }).del("/watch-preferences/p1")).resolves.toBeUndefined();
  });

  it("sur 401 : rafraîchit une fois via /auth/refresh puis rejoue la requête", async () => {
    const { impl, calls } = fakeFetch({
      "/api/me": [json(401, { statusCode: 401, message: "Unauthorized" }), json(200, { user: { id: "u1" } })],
      "/auth/refresh": [json(200, {})],
    });
    const onUnauthenticated = vi.fn();
    const client = createApiClient({ fetch: impl, onUnauthenticated });
    await expect(client.get("/me")).resolves.toEqual({ user: { id: "u1" } });
    expect(calls.map((c) => c.url)).toEqual(["/api/me", "/auth/refresh", "/api/me"]);
    expect(calls[1].init?.method).toBe("POST");
    expect(calls[1].init?.credentials).toBe("include");
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("redirige si le rafraîchissement échoue, sans boucle", async () => {
    const { impl, calls } = fakeFetch({
      "/api/me": [json(401, { statusCode: 401, message: "Unauthorized" })],
      "/auth/refresh": [json(401, {})],
    });
    const onUnauthenticated = vi.fn();
    const client = createApiClient({ fetch: impl, onUnauthenticated });
    const err = await client.get<never>("/me").catch((e: ApiError) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(onUnauthenticated).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.url)).toEqual(["/api/me", "/auth/refresh"]);
  });

  it("redirige si la requête rejouée renvoie encore 401", async () => {
    const { impl, calls } = fakeFetch({
      "/api/me": [json(401, {})],
      "/auth/refresh": [json(200, {})],
    });
    const onUnauthenticated = vi.fn();
    await expect(createApiClient({ fetch: impl, onUnauthenticated }).get("/me")).rejects.toMatchObject({ statusCode: 401 });
    expect(calls.map((c) => c.url)).toEqual(["/api/me", "/auth/refresh", "/api/me"]);
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it("partage un seul rafraîchissement entre requêtes concurrentes", async () => {
    let refreshed = false;
    const { impl, calls } = fakeFetch({
      "/api/a": [() => (refreshed ? json(200, { a: 1 }) : json(401, {}))],
      "/api/b": [() => (refreshed ? json(200, { b: 2 }) : json(401, {}))],
      "/auth/refresh": [
        () => {
          refreshed = true;
          return json(200, {});
        },
      ],
    });
    const client = createApiClient({ fetch: impl, onUnauthenticated: vi.fn() });
    const [a, b] = await Promise.all([client.get("/a"), client.get("/b")]);
    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
    expect(calls.filter((c) => c.url === "/auth/refresh")).toHaveLength(1);
  });

  it("ne rafraîchit pas les écrans d'authentification (auth: false)", async () => {
    const { impl, calls } = fakeFetch({
      "/api/auth/login": [json(401, { statusCode: 401, message: "Identifiants invalides" })],
    });
    const onUnauthenticated = vi.fn();
    const err = await createApiClient({ fetch: impl, onUnauthenticated })
      .post("/auth/login", { email: "a@b.bf", password: "x" }, { auth: false })
      .catch((e) => e);
    expect(err).toMatchObject({ statusCode: 401, message: "Identifiants invalides" });
    expect(calls).toHaveLength(1);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("normalise les erreurs { statusCode, message, code }", async () => {
    const { impl } = fakeFetch({
      "/api/auth/login": [json(403, { statusCode: 403, message: "E-mail non vérifié", code: "EMAIL_NOT_VERIFIED" })],
    });
    const err = await createApiClient({ fetch: impl }).post("/auth/login", {}, { auth: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ statusCode: 403, code: "EMAIL_NOT_VERIFIED", message: "E-mail non vérifié" });
  });

  it("joint les messages multiples et fournit un message français par défaut", async () => {
    const { impl } = fakeFetch({
      "/api/x": [json(400, { statusCode: 400, message: ["email invalide", "mot de passe trop court"] })],
      "/api/y": [new Response("<html>", { status: 502 })],
    });
    const client = createApiClient({ fetch: impl });
    await expect(client.get("/x")).rejects.toMatchObject({ message: "email invalide · mot de passe trop court" });
    await expect(client.get("/y")).rejects.toMatchObject({ statusCode: 502, message: expect.stringMatching(/serveur/) });
  });

  it("transforme une panne réseau en ApiError NETWORK_ERROR", async () => {
    const impl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(createApiClient({ fetch: impl }).get("/me")).rejects.toMatchObject({ statusCode: 0, code: "NETWORK_ERROR" });
  });
});

describe("logout", () => {
  it("appelle POST /auth/logout (cookie refresh Path=/auth) et ignore les erreurs", async () => {
    const impl = vi.fn(async () => {
      throw new TypeError("offline");
    });
    await expect(logout(impl as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(impl).toHaveBeenCalledWith("/auth/logout", { method: "POST", credentials: "include" });
  });
});

describe("redirections", () => {
  it("construit /connexion?next=…", () => {
    expect(loginRedirectUrl("/app/annonces", "?q=forage")).toBe("/connexion?next=%2Fapp%2Fannonces%3Fq%3Dforage");
    expect(loginRedirectUrl("/")).toBe("/connexion");
  });

  it("refuse les redirections ouvertes", () => {
    expect(safeNext("/app/suivi")).toBe("/app/suivi");
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("/connexion")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  const me = (globalRole: "SUPER_ADMIN" | "USER", company: boolean): MeResponse => ({
    user: { id: "u", email: "a@b.bf", fullName: "A", globalRole },
    company: company ? { id: "c", legalName: "C", status: "ACTIVE" } : null,
    membership: company ? { role: "COMPANY_ADMIN" } : null,
  });

  it("après connexion : next, sinon /admin pour un super admin sans entreprise, sinon /app", () => {
    expect(postLoginPath(me("USER", true), "/app/veille")).toBe("/app/veille");
    expect(postLoginPath(me("USER", true), null)).toBe("/app");
    expect(postLoginPath(me("SUPER_ADMIN", false), null)).toBe("/admin");
    expect(postLoginPath(me("SUPER_ADMIN", true), null)).toBe("/app");
    expect(postLoginPath(null, "//evil")).toBe("/app");
  });
});
