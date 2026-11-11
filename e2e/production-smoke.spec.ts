import { expect, test } from "@playwright/test";

const email = process.env.SMOKE_TEST_EMAIL?.trim();
const password = process.env.SMOKE_TEST_PASSWORD;
const loginConfigured = Boolean(email && password);

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await page.getByLabel("E-Mail").fill(email!);
  await page.getByLabel("Passwort").fill(password!);
  await page.getByRole("button", { name: "Einloggen" }).click();
  await page.waitForURL(/\/(dashboard|mfa)(?:\/|$)/, { timeout: 25_000 });
  await expect(page).not.toHaveURL(/\/mfa(?:\/|$)/);
}

test("Produktionsseite ist öffentlich erreichbar", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
});

test.describe("Authentifizierter Produktions-Smoke-Test", () => {
  test.skip(
    !loginConfigured,
    "SMOKE_TEST_EMAIL und SMOKE_TEST_PASSWORD müssen als GitHub-Secrets hinterlegt sein.",
  );

  test("Login, zentrale Seiten, Buchungen und PDF-Export", async ({ page }) => {
    await signIn(page);

    await page.goto("/dashboard/finanz-kennzahlen", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/finanz-kennzahlen/);

    await page.goto("/buchhaltung/buchungen", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.getByText(/Buchungen im Jahr|Buchungsjahr/i).first()).toBeVisible();

    await page.goto("/berichte/portfolio", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible();
    const exportButton = page.getByRole("button", { name: "Report erstellen" });
    await expect(exportButton).toBeEnabled({ timeout: 30_000 });

    const popupPromise = page.waitForEvent("popup");
    await exportButton.click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.locator("body")).toContainText(/Immobilien|Portfolio/i);
    await popup.close();
  });
});
