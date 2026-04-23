import { expect, test } from "@playwright/test";

test.describe("Benchmarks Page", () => {
  test("displays the benchmark program and starter suites", async ({ page }) => {
    await page.goto("/benchmarks");

    await expect(
      page.getByRole("heading", { name: /hivesight benchmark program/i })
    ).toBeVisible();
    await expect(
      page.getByText(/direct inference on calibrated local synthetic populations/i)
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /comparison arms/i })
    ).toBeVisible();
    await expect(
      page.getByText(/generic persona prompting/i)
    ).toBeVisible();
    await expect(
      page.getByText("HiveSight local population", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(/gss 2024 evergreen attitudes/i)
    ).toBeVisible();
    await expect(
      page.getByText(/most people can be trusted\./i)
    ).toBeVisible();
    await expect(
      page.getByText(/survey of household economics and decisionmaking 2024/i)
    ).toBeVisible();
  });

  test("is reachable from the home page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /read the benchmark plan/i }).click();
    await expect(
      page.getByRole("heading", { name: /hivesight benchmark program/i })
    ).toBeVisible();
  });
});
