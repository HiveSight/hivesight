import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("displays hero section with key messaging", async ({ page }) => {
    await page.goto("/");

    // Check main headline
    await expect(
      page.getByRole("heading", { name: /simulate public opinion/i })
    ).toBeVisible();

    // Check value proposition text
    await expect(
      page.getByText(/HiveSight uses AI to simulate/i)
    ).toBeVisible();

    // Check CTA buttons
    await expect(page.getByRole("link", { name: /learn more/i })).toBeVisible();
  });

  test("displays how it works section", async ({ page }) => {
    await page.goto("/");

    // Check how it works section exists
    await expect(
      page.getByRole("heading", { name: /how it works/i })
    ).toBeVisible();

    // Check the three steps
    await expect(page.getByText(/ask your question/i)).toBeVisible();
    await expect(page.getByText(/configure your hive/i)).toBeVisible();
    await expect(page.getByText(/get insights/i)).toBeVisible();
  });

  test("displays features section", async ({ page }) => {
    await page.goto("/");

    // Check features section exists
    await expect(
      page.getByRole("heading", { name: /features/i })
    ).toBeVisible();

    // Check some feature items
    await expect(
      page.getByText(/simulate responses from diverse/i)
    ).toBeVisible();
    await expect(page.getByText(/likert scale/i)).toBeVisible();
  });

  test("header has logo and login button", async ({ page }) => {
    await page.goto("/");

    // Check logo/brand in header
    await expect(
      page.getByRole("link", { name: "HiveSight" })
    ).toBeVisible();

    // Check login button exists in header
    await expect(
      page.getByRole("banner").getByRole("button", { name: /sign in/i })
    ).toBeVisible();
  });

  test("footer has copyright and links", async ({ page }) => {
    await page.goto("/");

    // Check copyright (dynamic year)
    await expect(page.getByText(/© \d{4} HiveSight/i)).toBeVisible();

    // Check footer links
    await expect(page.getByRole("link", { name: /privacy/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /terms/i })).toBeVisible();
  });

  test("CTA section mentions free credits", async ({ page }) => {
    await page.goto("/");

    // Check free credits mention
    await expect(page.getByText(/100 free credits/i)).toBeVisible();
  });
});
