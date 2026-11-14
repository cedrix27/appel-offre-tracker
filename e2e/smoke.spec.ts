import { expect, test } from "@playwright/test";

/** Pages publiques et garde de routes (aussi exécuté en viewport mobile). */
test("page d'accueil en français, sans défilement horizontal", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("link", { name: /inscri|essai|commencer/i }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("espace connecté protégé : redirection vers la connexion", async ({ page }) => {
  await page.goto("/app/annonces");
  await expect(page).toHaveURL(/\/connexion\?next=%2Fapp%2Fannonces|\/connexion\?next=\/app\/annonces/);
});

test("pages légales accessibles", async ({ page }) => {
  for (const path of ["/mentions-legales", "/confidentialite"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
