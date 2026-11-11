import { defineConfig, devices } from "@playwright/test";

const baseURL = (process.env.SMOKE_TEST_URL || "https://koenen-investment.com").replace(/\/$/, "");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-smoke.spec.ts",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
