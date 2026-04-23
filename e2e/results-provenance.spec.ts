import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const DB_URL =
  process.env.PLAYWRIGHT_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function runSql(sql: string) {
  execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function seedCompletedSurvey(personaSource: "microdata" | "synthetic_fallback") {
  const surveyId = randomUUID();
  const respondentId = randomUUID();
  const location = JSON.stringify({
    type: "state",
    value: "NY",
    label: "New York",
  });
  const question =
    personaSource === "microdata"
      ? "Do New York voters support expanding paid family leave?"
      : "Should this fallback audience support expanding paid family leave?";
  const reasoning =
    personaSource === "microdata"
      ? "This respondent supports stronger family leave protections."
      : "This fallback respondent still supports broader family leave coverage.";

  runSql(`
    insert into public.surveys (
      id,
      user_id,
      question,
      response_type,
      model,
      hive_size,
      demographic_filters,
      location,
      persona_source,
      status,
      credits_used,
      created_at,
      completed_at
    ) values (
      ${sqlString(surveyId)},
      null,
      ${sqlString(question)},
      'likert',
      'gpt-5-mini',
      1,
      '{}'::jsonb,
      ${sqlString(location)}::jsonb,
      ${sqlString(personaSource)},
      'completed',
      0,
      now(),
      now()
    );

    insert into public.respondents (
      id,
      survey_id,
      age,
      income,
      state,
      weight,
      sex,
      race_ethnicity,
      occupation,
      is_college_student,
      is_disabled,
      tenure_type,
      has_children,
      children_count,
      insurance_type,
      receives_benefits,
      zip_code,
      congressional_district,
      created_at
    ) values (
      ${sqlString(respondentId)},
      ${sqlString(surveyId)},
      37,
      72000,
      'NY',
      1,
      'Female',
      'White',
      'Software developer',
      false,
      false,
      'Renter',
      true,
      2,
      'not enrolled in Medicare or Medicaid',
      false,
      '10001',
      null,
      now()
    );

    insert into public.responses (
      id,
      survey_id,
      respondent_id,
      likert_response,
      open_ended_response,
      reasoning,
      created_at
    ) values (
      ${sqlString(randomUUID())},
      ${sqlString(surveyId)},
      ${sqlString(respondentId)},
      'agree',
      null,
      ${sqlString(reasoning)},
      now()
    );
  `);

  return { surveyId };
}

function deleteSurvey(surveyId: string) {
  runSql(`
    delete from public.surveys
    where id = ${sqlString(surveyId)};
  `);
}

test.describe("Survey results provenance", () => {
  test("shows calibrated microdata provenance on the public results page", async ({
    page,
  }) => {
    const { surveyId } = seedCompletedSurvey("microdata");

    try {
      await page.goto(`/survey/${surveyId}`);

      await expect(page.getByText(/calibrated microdata/i).first()).toBeVisible();
      await expect(
        page.getByText(
          /respondents were simulated from calibrated microdata records/i
        )
      ).toBeVisible();
      await expect(
        page.getByText(/1 simulated respondent for new york/i)
      ).toBeVisible();
    } finally {
      deleteSurvey(surveyId);
    }
  });

  test("shows synthetic fallback provenance on the public results page", async ({
    page,
  }) => {
    const { surveyId } = seedCompletedSurvey("synthetic_fallback");

    try {
      await page.goto(`/survey/${surveyId}`);

      await expect(page.getByText(/synthetic fallback/i).first()).toBeVisible();
      await expect(
        page.getByText(
          /calibrated local microdata was unavailable for this run/i
        )
      ).toBeVisible();
      await expect(
        page.getByText(/1 simulated respondent for new york/i)
      ).toBeVisible();
    } finally {
      deleteSurvey(surveyId);
    }
  });
});
