import { test, expect } from "@playwright/test";

test.describe("API Endpoints", () => {
  test("POST /api/survey/estimate returns proper response", async ({
    request,
  }) => {
    const response = await request.post("/api/survey/estimate", {
      data: {
        responseType: "likert",
        model: "gpt-5-mini",
        hiveSize: 40,
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("credits");
    expect(data).toHaveProperty("respondentsPerCredit");
    expect(data).toHaveProperty("model");
    expect(data).toHaveProperty("hiveSize");

    // GPT-5 Mini: 4 likert respondents per credit
    // 40 respondents / 4 per credit = 10 credits
    expect(data.credits).toBe(10);
    expect(data.respondentsPerCredit).toBe(4);
  });

  test("POST /api/survey/estimate validates input", async ({ request }) => {
    // Missing required fields
    const response = await request.post("/api/survey/estimate", {
      data: {
        responseType: "likert",
        // missing model and hiveSize
      },
    });

    expect(response.status()).toBe(400);
  });

  test("POST /api/survey/estimate handles open-ended pricing", async ({
    request,
  }) => {
    const response = await request.post("/api/survey/estimate", {
      data: {
        responseType: "open_ended",
        model: "gpt-5-mini",
        hiveSize: 20,
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // GPT-5 Mini: 2 open-ended respondents per credit
    // 20 respondents / 2 per credit = 10 credits
    expect(data.credits).toBe(10);
    expect(data.respondentsPerCredit).toBe(2);
  });

  test("POST /api/survey/estimate handles GPT-5 pricing", async ({
    request,
  }) => {
    const response = await request.post("/api/survey/estimate", {
      data: {
        responseType: "likert",
        model: "gpt-5",
        hiveSize: 10,
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // GPT-5: 1 respondent per credit for both types
    expect(data.credits).toBe(10);
    expect(data.respondentsPerCredit).toBe(1);
  });

  test("POST /api/survey requires authentication", async ({ request }) => {
    const response = await request.post("/api/survey", {
      data: {
        question: "Test question that is long enough",
        responseType: "likert",
        model: "gpt-5-mini",
        hiveSize: 10,
        demographicFilters: {
          ageRange: [18, 65],
          incomeRange: [0, 200000],
        },
      },
    });

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("GET /api/survey requires authentication", async ({ request }) => {
    const response = await request.get("/api/survey?id=test-id");

    expect(response.status()).toBe(401);
  });
});

test.describe("Health Check", () => {
  test("app is running and responsive", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });
});
