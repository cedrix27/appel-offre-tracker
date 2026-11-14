import { expect, test } from "@playwright/test";
import { adminApi, lastEmailToken, login, PASSWORD, sql } from "./helpers";

/**
 * T19 — parcours complet : inscription → vérification → connexion → profil → préférences
 * → collecte (faux collecteur, relance admin) → matching → dashboard → fiche → favori/suivi → alertes.
 */
test.describe.serial("Parcours entreprise de bout en bout", () => {
  const email = `awa.${Date.now()}@kanazoe.bf`;
  const DGI_TITLE = /Acquisition de matériel informatique au profit de la Direction générale des impôts/;

  test("inscription puis vérification de l'adresse e-mail", async ({ page }) => {
    await page.goto("/inscription");
    await page.getByLabel("Raison sociale").fill("Kanazoé Informatique SARL");
    await page.getByLabel("Nom et prénom").fill("Awa Ouédraogo");
    await page.getByLabel("Adresse e-mail professionnelle").fill(email);
    await page.getByLabel("Mot de passe").fill(PASSWORD);
    await page.getByRole("button", { name: /créer/i }).click();
    await expect(page.getByText("Nous avons envoyé un lien de vérification")).toBeVisible();

    // Connexion refusée tant que l'adresse n'est pas vérifiée.
    await login(page, email);
    await expect(page.getByText(/n.est pas encore vérifiée/)).toBeVisible();

    const token = await lastEmailToken(email, "VERIFY_EMAIL");
    await page.goto(`/verifier-email?token=${token}`);
    await expect(page.getByTestId("verify-success")).toContainText("Adresse e-mail vérifiée");
  });

  test("connexion, profil entreprise et préférences de veille", async ({ page }) => {
    await login(page, email);
    await expect(page).toHaveURL(/\/app/);

    await page.goto("/app/entreprise");
    await page.getByLabel("Ville").fill("Ouagadougou");
    await page.getByLabel("Téléphone").fill("+226 70 00 00 00");
    await page.getByRole("button", { name: "Enregistrer le profil" }).click();
    await expect(page.getByTestId("company-status")).toContainText("Profil enregistré.");

    await page.goto("/app/veille");
    await page.getByTestId("new-preference").first().click();
    await page.getByTestId("sector-options").getByLabel("Informatique & télécoms").check();
    await page.getByTestId("save-preference").click();
    await expect(page.getByTestId("preferences-notice")).toContainText("est enregistrée");
  });

  test("collecte relancée par l'administrateur, matching et digest", async ({ request }) => {
    const admin = await adminApi(request);
    const sources = (await (await admin.get("/api/admin/sources")).json()) as { id: string; code: string }[];
    const dgcmef = sources.find((s) => s.code === "dgcmef");
    expect(dgcmef).toBeTruthy();

    const run = await admin.post(`/api/admin/sources/${dgcmef!.id}/run`);
    expect(run.status()).toBe(202);
    const { runId } = (await run.json()) as { runId: string };
    await expect
      .poll(() => sql(`SELECT status FROM pipeline_runs WHERE id = :'p1'`, [runId]), { timeout: 60_000 })
      .toBe("DONE");
    expect(sql(`SELECT count(*) FROM email_outbox WHERE category = 'DAILY_DIGEST' AND :'p1' = ANY("to")`, [email])).toBe("1");
  });

  test("tableau de bord, fiche détaillée, favori et suivi", async ({ page }) => {
    await login(page, email);
    await expect(page.getByTestId("kpi-openMatches")).toContainText("1");
    const card = page.getByTestId("recent-matches").getByTestId("tender-card").filter({ hasText: DGI_TITLE });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: DGI_TITLE }).click();

    const detail = page.getByTestId("tender-detail");
    await expect(detail).toBeVisible();
    await expect(page.getByTestId("match-reasons")).toContainText("Informatique");
    await expect(page.getByTestId("official-link")).toHaveAttribute("href", /^https:\/\/www\.dgcmef\.gov\.bf\//);

    const fav = detail.getByTestId("favorite-toggle");
    await expect(fav).toHaveAttribute("aria-pressed", "false");
    await fav.click();
    await expect(fav).toHaveAttribute("aria-pressed", "true");
    await expect(fav).toContainText("Dans vos favoris");

    await page.getByTestId("saved-status").selectOption("APPLYING");
    await page.getByTestId("saved-note").fill("Pièces administratives à réunir avant le dépôt.");
    await page.getByTestId("save-tracking").click();
    await expect(page.getByTestId("tracking-form")).toContainText(/enregistr/i);

    // Persistance après rechargement.
    await page.reload();
    await expect(page.getByTestId("saved-status")).toHaveValue("APPLYING");
    await expect(page.getByTestId("saved-note")).toHaveValue("Pièces administratives à réunir avant le dépôt.");

    await page.goto("/app/suivi");
    await expect(page.getByText(DGI_TITLE)).toBeVisible();
  });

  test("annonce incomplète : « Non précisé », jamais de valeur inventée", async ({ page }) => {
    await login(page, email);
    await page.goto("/app/annonces");
    await page.getByTestId("all-tenders").click();
    await page.getByTestId("tender-search").fill("forages");
    await page.getByRole("button", { name: "Rechercher" }).click();
    await page.getByRole("link", { name: /forages positifs/ }).click();
    const detail = page.getByTestId("tender-detail");
    await expect(detail).toContainText("Non précisé");
    await expect(page.getByTestId("uncertain-fields")).toBeVisible();
    await expect(detail).not.toContainText(/undefined|NaN|Invalid Date/);
  });

  test("historique des alertes", async ({ page }) => {
    await login(page, email);
    await page.goto("/app/alertes");
    const row = page.getByTestId("alert-row").first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(email);
  });
});
