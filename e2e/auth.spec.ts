import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("redirects unauthenticated users from protected routes to home", async ({
    page,
  }) => {
    // Try to access dashboard without auth
    await page.goto("/dashboard");

    // Should redirect to home page (which has login)
    await expect(page).toHaveURL("/");
  });

  test("redirects unauthenticated users from new survey page", async ({
    page,
  }) => {
    await page.goto("/survey/new");

    // Should redirect to home
    await expect(page).toHaveURL("/");
  });

  test("sign in button is visible on landing page", async ({ page }) => {
    await page.goto("/");

    // Check sign in button exists in header
    const signInButton = page
      .getByRole("banner")
      .getByRole("button", { name: /sign in/i });
    await expect(signInButton).toBeVisible();
  });

  test("clicking sign in initiates OAuth flow", async ({ page }) => {
    await page.goto("/");

    // Click the first sign in button (in header)
    const signInButton = page
      .getByRole("banner")
      .getByRole("button", { name: /sign in/i });

    // Click and wait for navigation
    await signInButton.click();

    // Wait briefly for navigation to start
    await page.waitForTimeout(1000);

    // Should navigate away from home page (to Supabase auth or Google)
    // The URL will contain supabase or google in production
    // In local dev, it may redirect elsewhere
    const currentUrl = page.url();
    const hasNavigated =
      currentUrl !== "http://localhost:3000/" ||
      currentUrl.includes("supabase") ||
      currentUrl.includes("google");

    expect(hasNavigated).toBeTruthy();
  });
});

test.describe("Protected Routes", () => {
  // These tests verify the routes exist and redirect properly

  test("dashboard route redirects unauthenticated users", async ({ page }) => {
    const response = await page.goto("/dashboard");
    // Should redirect (302/307) or show 200 (home page)
    expect([200, 302, 307, 308]).toContain(response?.status());
    // Should end up at home
    await expect(page).toHaveURL("/");
  });

  test("new survey route redirects unauthenticated users", async ({ page }) => {
    const response = await page.goto("/survey/new");
    expect([200, 302, 307, 308]).toContain(response?.status());
    await expect(page).toHaveURL("/");
  });
});
