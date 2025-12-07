import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/user.json");

/**
 * This setup test authenticates once and saves the session.
 * Run manually with: pnpm test:e2e:setup
 *
 * The saved session is then reused by authenticated tests,
 * avoiding the need to log in for every test.
 */
setup("authenticate", async ({ page }) => {
  // Go to the app
  await page.goto("/");

  // Click sign in button
  const signInButton = page
    .getByRole("banner")
    .getByRole("button", { name: /sign in/i });
  await signInButton.click();

  // Wait for OAuth redirect and manual authentication
  // This will pause and wait for you to complete the Google OAuth flow
  console.log("\n⏳ Please complete the Google OAuth flow in the browser...\n");

  // Wait for redirect back to the app (dashboard)
  await page.waitForURL("**/dashboard", { timeout: 120000 });

  // Verify we're logged in
  await expect(page.getByText(/dashboard|survey|credit/i)).toBeVisible();

  console.log("✅ Authentication successful! Saving session...\n");

  // Save the authenticated state
  await page.context().storageState({ path: authFile });
});
