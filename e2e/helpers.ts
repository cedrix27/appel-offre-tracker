import { execFileSync } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "MotDePasse-Solide-2026";
export const SUPER_ADMIN = { email: "superadmin@e2e.test", password: "MotDePasse-Admin-E2E-2026" };

/** Requête SQL en lecture seule sur la base de test (lecture des e-mails « log »). */
export function sql(query: string, params: string[] = []): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !url.includes("test")) throw new Error("TEST_DATABASE_URL de test requis");
  const vars = params.flatMap((p, i) => ["-v", `p${i + 1}=${p}`]);
  return execFileSync("psql", [url.split("?")[0], "-tA", ...vars], { input: query, encoding: "utf8" }).trim();
}

/** Dernier jeton envoyé par e-mail à `email` pour une catégorie (VERIFY_EMAIL, INVITE…). */
export async function lastEmailToken(email: string, category: string): Promise<string> {
  let text = "";
  await expect
    .poll(() => {
      text = sql(
        `SELECT text FROM email_outbox WHERE :'p1' = ANY("to") AND category = :'p2' ORDER BY created_at DESC LIMIT 1`,
        [email, category],
      );
      return text;
    })
    .not.toBe("");
  const match = text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`Aucun jeton ${category} pour ${email}`);
  return match[1];
}

export async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

/** Session super admin côté API (même origine via /api) — l'écran d'administration n'est pas encore livré. */
export async function adminApi(request: APIRequestContext): Promise<APIRequestContext> {
  const res = await request.post("/api/auth/login", { data: SUPER_ADMIN });
  expect(res.status(), await res.text()).toBe(200);
  return request;
}
