import { test, expect } from "@playwright/test";

/**
 * These tests require authentication.
 * Run `pnpm test:e2e:setup` first to save an authenticated session.
 * Then run `pnpm test:e2e --project=authenticated` to run these tests.
 */

test.describe("Survey Creation Wizard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/survey/new");
  });

  test("step 1: displays question input", async ({ page }) => {
    // Should show step 1 of 4
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();

    // Check for question textarea
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();

    // Check for character count hint
    await expect(page.getByText(/more characters needed/i)).toBeVisible();
  });

  test("step 1: validates minimum question length", async ({ page }) => {
    const textarea = page.locator("textarea");
    const continueBtn = page.getByRole("button", { name: /continue/i });

    // Type less than 10 characters - continue should be disabled
    await textarea.fill("Short");
    await expect(page.getByText(/more characters needed/i)).toBeVisible();
    await expect(continueBtn).toBeDisabled();

    // Type valid question - continue should be enabled
    await textarea.fill("I support increasing the minimum wage to $15 per hour");
    await expect(page.getByText(/ready to continue/i)).toBeVisible();
    await expect(continueBtn).toBeEnabled();
  });

  test("step 1: response type toggle works", async ({ page }) => {
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

  test("navigates through all 4 steps", async ({ page }) => {
    // Step 1: Enter question
    await page.locator("textarea").fill("I support universal basic income");
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 2: Demographics
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
    await expect(page.getByText(/age range/i)).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 3: Model & Credits
    await expect(page.getByText(/step 3 of 4/i)).toBeVisible();
    await expect(page.getByRole("combobox")).toBeVisible(); // Model selector
    await expect(page.getByText(/credits to spend/i)).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 4: Review
    await expect(page.getByText(/step 4 of 4/i)).toBeVisible();
    await expect(page.getByText(/review/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /run survey/i })
    ).toBeVisible();
  });

  test("back button navigates to previous step", async ({ page }) => {
    // Fill step 1 and continue
    await page.locator("textarea").fill("Test question for navigation");
    await page.getByRole("button", { name: /continue/i }).click();

    // Now on step 2
    await expect(page.getByText(/step 2 of 4/i)).toBeVisible();

    // Click back
    await page.getByRole("button", { name: /back/i }).click();

    // Should be on step 1
    await expect(page.getByText(/step 1 of 4/i)).toBeVisible();

    // Question should still be there
    await expect(page.locator("textarea")).toHaveValue(
      "Test question for navigation"
    );
  });

  test("back button is disabled on step 1", async ({ page }) => {
    const backBtn = page.getByRole("button", { name: /back/i });
    await expect(backBtn).toBeDisabled();
  });
});

test.describe("Survey Wizard - Credits UI", () => {
  test("shows credits-first pricing on step 3", async ({ page }) => {
    await page.goto("/survey/new");

    // Navigate to step 3
    await page.locator("textarea").fill("I support universal basic income");
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Now on step 3 - check credits UI
    await expect(page.getByText(/credits to spend/i)).toBeVisible();
    await expect(page.getByText(/40 respondents/i)).toBeVisible();

    // Should show model selection
    await expect(page.getByText(/ai model/i)).toBeVisible();
  });

  test("respondent count updates when credits change", async ({ page }) => {
    await page.goto("/survey/new");

    // Navigate to step 3
    await page.locator("textarea").fill("I support universal basic income");
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Should show initial respondent count
    // Default: 10 credits * 4 resp/credit = 40 respondents for GPT-5 Mini Likert
    await expect(page.getByText(/40 respondents/i)).toBeVisible();
  });

  test("step 4 shows review summary", async ({ page }) => {
    await page.goto("/survey/new");

    // Navigate through all steps
    await page.locator("textarea").fill("Should we expand Medicare?");
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 4: Review
    await expect(page.getByText(/review/i)).toBeVisible();
    await expect(page.getByText(/should we expand medicare/i)).toBeVisible();
    await expect(page.getByText(/likert scale/i)).toBeVisible();
    await expect(page.getByText(/gpt-5 mini/i)).toBeVisible();
    await expect(page.getByText(/cost/i)).toBeVisible();
  });
});
