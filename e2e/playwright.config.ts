import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Parcours de bout en bout sur la stack complète : API (base de test, faux collecteur) + web.
 * Ports dédiés (4100 / 3100) pour ne pas gêner `pnpm dev`.
 */
const root = join(__dirname, "..");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

const API_PORT = process.env.E2E_API_PORT ?? "4100";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3100";

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts$/,
  // Le parcours est séquentiel et partage la base : un seul worker.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  outputDir: join(root, "test-results"),
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "fr-FR",
    timezoneId: "Africa/Ouagadougou",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /smoke\.spec\.ts$/ },
  ],
  webServer: [
    {
      command: `bash "${join(root, "e2e/start-api.sh")}"`,
      url: `http://localhost:${API_PORT}/health`,
      env: { E2E_API_PORT: API_PORT, E2E_WEB_PORT: WEB_PORT },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `pnpm dev --port ${WEB_PORT}`,
      cwd: join(root, "apps/web"),
      url: `http://localhost:${WEB_PORT}`,
      env: { API_BASE_URL: `http://localhost:${API_PORT}`, NEXT_PUBLIC_APP_URL: `http://localhost:${WEB_PORT}` },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
