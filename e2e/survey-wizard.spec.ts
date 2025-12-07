import { test, expect } from "@playwright/test";

// Note: These tests require authentication. In CI, we'd use a test account
// or mock the auth. For now, testing the UI components that are visible.

test.describe("Survey Creation Wizard (UI)", () => {
  test.beforeEach(async ({ page }) => {
    // This will redirect to login if not authenticated
    // In a full setup, we'd authenticate first
    await page.goto("/survey/new");
  });

  // Skip if redirected to login
  test("step 1: question input has proper validation", async ({ page }) => {
    // Check if we're on the survey page (not redirected)
    if (page.url().includes("/login") || page.url() === "http://localhost:3000/") {
      test.skip();
      return;
    }

    // Check for question textarea
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();

    // Check for character count hint
    await expect(page.getByText(/more characters needed/i)).toBeVisible();

    // Type less than 10 characters
    await textarea.fill("Short");
    await expect(page.getByText(/more characters needed/i)).toBeVisible();

    // Continue button should be disabled
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeDisabled();

    // Type valid question
    await textarea.fill("I support increasing the minimum wage to $15 per hour");
    await expect(page.getByText(/ready to continue/i)).toBeVisible();
    await expect(continueBtn).toBeEnabled();
  });

  test("step 1: response type toggle works", async ({ page }) => {
    if (page.url().includes("/login") || page.url() === "http://localhost:3000/") {
      test.skip();
      return;
    }

    // Check for Likert and Open-ended tabs
    await expect(page.getByRole("tab", { name: /likert/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /open-ended/i })).toBeVisible();

    // Likert should be selected by default
    const likertTab = page.getByRole("tab", { name: /likert/i });
    await expect(likertTab).toHaveAttribute("data-state", "active");

    // Click open-ended
    await page.getByRole("tab", { name: /open-ended/i }).click();
    await expect(
      page.getByRole("tab", { name: /open-ended/i })
    ).toHaveAttribute("data-state", "active");
  });
});

test.describe("Survey Wizard Navigation", () => {
  test("shows step indicator", async ({ page }) => {
    await page.goto("/survey/new");

    if (page.url().includes("/login") || page.url() === "http://localhost:3000/") {
      test.skip();
      return;
    }

    // Should show step 1 of 4
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();

    // Should show 4 progress indicators
    const progressBars = page.locator(".rounded-full.h-2");
    await expect(progressBars).toHaveCount(4);
  });

  test("back button is disabled on step 1", async ({ page }) => {
    await page.goto("/survey/new");

    if (page.url().includes("/login") || page.url() === "http://localhost:3000/") {
      test.skip();
      return;
    }

    const backBtn = page.getByRole("button", { name: /back/i });
    await expect(backBtn).toBeDisabled();
  });
});

test.describe("Survey Wizard - Credits UI", () => {
  test("step 3 shows credits-first pricing", async ({ page }) => {
    await page.goto("/survey/new");

    if (page.url().includes("/login") || page.url() === "http://localhost:3000/") {
      test.skip();
      return;
    }

    // Fill step 1
    await page.locator("textarea").fill("I support universal basic income");
    await page.getByRole("button", { name: /continue/i }).click();

    // Skip step 2 (demographics)
    await page.getByRole("button", { name: /continue/i }).click();

    // Now on step 3 - should show model selection
    await expect(page.getByText(/gpt-5 mini/i)).toBeVisible();

    // Should show credits slider
    await expect(page.getByText(/credits to spend/i)).toBeVisible();

    // Should show respondents calculation
    await expect(page.getByText(/respondents/i)).toBeVisible();
  });
});
