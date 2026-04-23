import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("displays editorial hero with key messaging", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /audience research grounded in real data, delivered at synthetic speed/i,
      })
    ).toBeVisible();

    await expect(
      page.getByText(/lets marketers, product teams, campaigns, and researchers/i)
    ).toBeVisible();
    await expect(
      page.getByText(/ask synthetic audiences the same questions/i)
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: /open the research desk/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /inspect the workflow/i })
    ).toBeVisible();
    await expect(page.getByText("Marketers", { exact: true })).toBeVisible();
  });

  test("displays geography and workflow sections", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /start with geography\. read the audience underneath it\./i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /how the research desk works/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^zip code lens$/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^state lens$/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^district lens$/i })
    ).toBeVisible();
    await expect(page.getByText("Housing tenure", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^write the line$/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^choose the geography$/i })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^read the breakpoints$/i })
    ).toBeVisible();
  });

  test("header has logo and login button", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: "HiveSight" })
    ).toBeVisible();

    await expect(
      page.getByRole("banner").getByRole("button", { name: /sign in/i })
    ).toBeVisible();
  });

  test("footer links route to live legal pages", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/© \d{4} HiveSight/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /privacy/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /terms/i })).toBeVisible();

    await page.getByRole("link", { name: /privacy/i }).click();
    await expect(
      page.getByRole("heading", { name: /^privacy$/i })
    ).toBeVisible();
    await expect(page.getByText(/last updated march 20, 2026/i)).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: /terms/i }).click();
    await expect(page.getByRole("heading", { name: /^terms$/i })).toBeVisible();
    await expect(
      page.getByText(/research tool, not a poll/i)
    ).toBeVisible();
  });

  test("free-tier copy is visible in the hero", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(/three runs per day with 25 respondents each/i)
    ).toBeVisible();
    await expect(
      page.getByText(/scale sample size and model strength when the question calls for more precision/i)
    ).toBeVisible();
    await expect(
      page.getByText(/fast signal, grounded in calibrated local populations/i)
    ).toBeVisible();
  });
});
