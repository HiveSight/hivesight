import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LikertChart } from "@/components/survey/likert-chart";
import { ResponseTable } from "@/components/survey/response-table";
import { LoginButton } from "@/components/auth/login-button";
import type { Database } from "@/types/database";
import type { LocationFilter } from "@/types";
import { Hexagon, MapPin } from "lucide-react";

type Survey = Database["public"]["Tables"]["surveys"]["Row"];
type Respondent = Database["public"]["Tables"]["respondents"]["Row"];
type Response = Database["public"]["Tables"]["responses"]["Row"];

interface SurveyWithData extends Survey {
  respondents: Respondent[];
  responses: Response[];
}

export default async function PublicSurveyResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("surveys")
    .select(
      `
      *,
      respondents (*),
      responses (*)
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const survey = data as unknown as SurveyWithData;
  const location = survey.location as LocationFilter | null;

  const respondentMap = new Map(
    survey.respondents.map((r) => [r.id, r])
  );

  const responsesWithRespondents = survey.responses.map((response) => ({
    ...response,
    respondent: respondentMap.get(response.respondent_id)!,
  }));

  const likertDistribution =
    survey.response_type === "likert"
      ? calculateLikertDistribution(survey.responses)
      : null;

  const demoBreakdown = calculateDemoBreakdown(survey.respondents);

  return (
    <div className="min-h-screen">
      {/* Public header */}
      <header className="py-4 px-4 border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Hexagon className="h-8 w-8 text-amber-500 fill-amber-500/20" />
            <span className="text-xl font-bold">HiveSight</span>
          </Link>
          <LoginButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Survey results</h1>
            <p className="text-muted-foreground mt-1">
              {survey.hive_size} respondents &middot; {survey.model}
            </p>
          </div>
          <Button asChild>
            <Link href="/">New survey</Link>
          </Button>
        </div>

        {/* Location banner */}
        {location && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <MapPin className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-900">
              {survey.hive_size} people from {location.label}
            </span>
          </div>
        )}

        {/* Question */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Question</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">&quot;{survey.question}&quot;</p>
          </CardContent>
        </Card>

        {/* Likert Chart */}
        {likertDistribution && (
          <Card>
            <CardHeader>
              <CardTitle>Response distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <LikertChart data={likertDistribution} />
            </CardContent>
          </Card>
        )}

        {/* Statistics */}
        {likertDistribution && (
          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Mean</p>
                  <p className="text-2xl font-bold">
                    {calculateMean(survey.responses).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Median</p>
                  <p className="text-2xl font-bold">
                    {calculateMedian(survey.responses)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Agree %</p>
                  <p className="text-2xl font-bold">
                    {calculateAgreePercentage(survey.responses).toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Responses</p>
                  <p className="text-2xl font-bold">
                    {survey.responses.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Demographic breakdown */}
        {demoBreakdown && (
          <Card>
            <CardHeader>
              <CardTitle>Respondent demographics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                <div>
                  <p className="font-medium mb-2">Sex</p>
                  {Object.entries(demoBreakdown.sex).map(([k, v]) => (
                    <p key={k} className="text-muted-foreground">
                      {k}: {v}%
                    </p>
                  ))}
                </div>
                <div>
                  <p className="font-medium mb-2">Age</p>
                  {Object.entries(demoBreakdown.age).map(([k, v]) => (
                    <p key={k} className="text-muted-foreground">
                      {k}: {v}%
                    </p>
                  ))}
                </div>
                <div>
                  <p className="font-medium mb-2">Top races/ethnicities</p>
                  {Object.entries(demoBreakdown.race)
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <p key={k} className="text-muted-foreground truncate">
                        {k}: {v}%
                      </p>
                    ))}
                </div>
                <div>
                  <p className="font-medium mb-2">Housing</p>
                  {Object.entries(demoBreakdown.tenure).map(([k, v]) => (
                    <p key={k} className="text-muted-foreground">
                      {k}: {v}%
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Response Table */}
        <Card>
          <CardHeader>
            <CardTitle>Individual responses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseTable
              responses={responsesWithRespondents}
              responseType={survey.response_type}
            />
          </CardContent>
        </Card>

        {/* Sign up CTA */}
        <Card>
          <CardContent className="pt-6 text-center space-y-3">
            <p className="text-muted-foreground">
              Want to run larger surveys with more respondents?
            </p>
            <LoginButton />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

const LIKERT_VALUES: Record<string, number> = {
  strongly_disagree: 1,
  disagree: 2,
  neutral: 3,
  agree: 4,
  strongly_agree: 5,
};

function calculateLikertDistribution(responses: Response[]) {
  const counts = {
    strongly_disagree: 0,
    disagree: 0,
    neutral: 0,
    agree: 0,
    strongly_agree: 0,
  };
  responses.forEach((r) => {
    if (r.likert_response && r.likert_response in counts) {
      counts[r.likert_response as keyof typeof counts]++;
    }
  });
  const total = responses.length;
  return Object.entries(counts).map(([key, value]) => ({
    name: key.replace("_", " "),
    value,
    percentage: total > 0 ? (value / total) * 100 : 0,
  }));
}

function calculateMean(responses: Response[]): number {
  const values = responses
    .filter((r) => r.likert_response)
    .map((r) => LIKERT_VALUES[r.likert_response!]);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateMedian(responses: Response[]): number {
  const values = responses
    .filter((r) => r.likert_response)
    .map((r) => LIKERT_VALUES[r.likert_response!])
    .sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 !== 0
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2;
}

function calculateAgreePercentage(responses: Response[]): number {
  const agreeCount = responses.filter(
    (r) =>
      r.likert_response === "agree" || r.likert_response === "strongly_agree"
  ).length;
  return responses.length > 0 ? (agreeCount / responses.length) * 100 : 0;
}

function calculateDemoBreakdown(respondents: Respondent[]) {
  if (respondents.length === 0) return null;
  const total = respondents.length;
  const pct = (count: number) => Math.round((count / total) * 100);

  const sex: Record<string, number> = {};
  for (const r of respondents) {
    const key = r.sex ?? "Unknown";
    sex[key] = (sex[key] ?? 0) + 1;
  }

  const ageBuckets = { "18-29": 0, "30-44": 0, "45-64": 0, "65+": 0 };
  for (const r of respondents) {
    if (r.age < 30) ageBuckets["18-29"]++;
    else if (r.age < 45) ageBuckets["30-44"]++;
    else if (r.age < 65) ageBuckets["45-64"]++;
    else ageBuckets["65+"]++;
  }

  const race: Record<string, number> = {};
  for (const r of respondents) {
    const key = r.race_ethnicity ?? "Unknown";
    race[key] = (race[key] ?? 0) + 1;
  }
  const raceSorted = Object.entries(race).sort(([, a], [, b]) => b - a);

  const tenure: Record<string, number> = {};
  for (const r of respondents) {
    const key = r.tenure_type ?? "Unknown";
    tenure[key] = (tenure[key] ?? 0) + 1;
  }

  return {
    sex: Object.fromEntries(Object.entries(sex).map(([k, v]) => [k, pct(v)])),
    age: Object.fromEntries(
      Object.entries(ageBuckets).map(([k, v]) => [k, pct(v)])
    ),
    race: Object.fromEntries(raceSorted.map(([k, v]) => [k, pct(v)])),
    tenure: Object.fromEntries(
      Object.entries(tenure).map(([k, v]) => [k, pct(v)])
    ),
  };
}
