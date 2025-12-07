import { defineConfig, devices } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "e2e/.auth/user.json");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Setup project - run manually to authenticate
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      timeout: 120000, // 2 minutes for OAuth
      use: { ...devices["Desktop Chrome"] },
    },
    // Public tests - no auth required
    {
      name: "public",
      testMatch: /landing\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Auth tests - tests the auth flow itself
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // API tests - no browser auth needed
    {
      name: "api",
      testMatch: /api\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Authenticated tests - require saved session
    {
      name: "authenticated",
      testMatch: /survey-wizard\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
