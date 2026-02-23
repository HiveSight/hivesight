import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LikertChart } from "@/components/survey/likert-chart";
import { ResponseTable } from "@/components/survey/response-table";
import type { Database } from "@/types/database";
import { LIKERT_VALUES, type LocationFilter } from "@/types";
import { MapPin } from "lucide-react";

type Survey = Database["public"]["Tables"]["surveys"]["Row"];
type Respondent = Database["public"]["Tables"]["respondents"]["Row"];
type Response = Database["public"]["Tables"]["responses"]["Row"];

const STATUS_STYLES: Record<string, string> = {
  processing: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
};

interface SurveyWithData extends Survey {
  respondents: Respondent[];
  responses: Response[];
}

export default async function SurveyResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow viewing even without auth (for free tier surveys)
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

  // Create a map of respondent IDs to respondent data
  const respondentMap = new Map(
    survey.respondents.map((r) => [r.id, r])
  );

  // Combine responses with respondent data
  const responsesWithRespondents = survey.responses.map((response) => ({
    ...response,
    respondent: respondentMap.get(response.respondent_id)!,
  }));

  // Calculate Likert distribution if applicable
  const likertDistribution =
    survey.response_type === "likert"
      ? calculateLikertDistribution(survey.responses)
      : null;

  // Calculate demographic breakdown
  const demoBreakdown = calculateDemoBreakdown(survey.respondents);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-serif">Survey results</h1>
          <p className="text-muted-foreground mt-1.5">
            {survey.hive_size} respondents &middot; {survey.model}
          </p>
        </div>
        <div className="flex gap-2">
          {user && (
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          )}
          <Button asChild>
            <Link href={user ? "/survey/new" : "/"}>New survey</Link>
          </Button>
        </div>
      </div>

      {/* Location banner */}
      {location && (
        <div className="flex items-center gap-2.5 p-4 bg-amber-50 border border-amber-200/60 rounded-xl dark:bg-amber-900/10 dark:border-amber-700/20">
          <MapPin className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {survey.hive_size} people from {location.label}
          </span>
        </div>
      )}

      {/* Status */}
      {survey.status !== "completed" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 text-sm font-medium rounded-full ${
                  STATUS_STYLES[survey.status] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {survey.status}
              </span>
              {survey.status === "processing" && (
                <span className="text-muted-foreground">
                  Survey is still processing...
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Question */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-serif">Question</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-serif italic leading-relaxed">&quot;{survey.question}&quot;</p>
        </CardContent>
      </Card>

      {/* Likert Chart */}
      {likertDistribution && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Response distribution</CardTitle>
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
            <CardTitle className="font-serif">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Mean</p>
                <p className="text-2xl font-bold font-serif text-amber-700 dark:text-amber-400">
                  {calculateMean(survey.responses).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Median</p>
                <p className="text-2xl font-bold font-serif text-amber-700 dark:text-amber-400">
                  {calculateMedian(survey.responses)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Agree %</p>
                <p className="text-2xl font-bold font-serif text-amber-700 dark:text-amber-400">
                  {calculateAgreePercentage(survey.responses).toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Responses</p>
                <p className="text-2xl font-bold font-serif">{survey.responses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demographic breakdown */}
      {demoBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Respondent demographics</CardTitle>
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
          <CardTitle className="font-serif">Individual responses</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponseTable
            responses={responsesWithRespondents}
            responseType={survey.response_type}
          />
        </CardContent>
      </Card>
    </div>
  );
}

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
    (r) => r.likert_response === "agree" || r.likert_response === "strongly_agree"
  ).length;

  return responses.length > 0 ? (agreeCount / responses.length) * 100 : 0;
}

function calculateDemoBreakdown(respondents: Respondent[]) {
  if (respondents.length === 0) return null;
  const total = respondents.length;

  const pct = (count: number) => Math.round((count / total) * 100);

  // Sex breakdown
  const sex: Record<string, number> = {};
  for (const r of respondents) {
    const key = r.sex ?? "Unknown";
    sex[key] = (sex[key] ?? 0) + 1;
  }
  const sexPct = Object.fromEntries(
    Object.entries(sex).map(([k, v]) => [k, pct(v)])
  );

  // Age breakdown
  const ageBuckets = { "18-29": 0, "30-44": 0, "45-64": 0, "65+": 0 };
  for (const r of respondents) {
    if (r.age < 30) ageBuckets["18-29"]++;
    else if (r.age < 45) ageBuckets["30-44"]++;
    else if (r.age < 65) ageBuckets["45-64"]++;
    else ageBuckets["65+"]++;
  }
  const agePct = Object.fromEntries(
    Object.entries(ageBuckets).map(([k, v]) => [k, pct(v)])
  );

  // Race breakdown (top entries)
  const race: Record<string, number> = {};
  for (const r of respondents) {
    const key = r.race_ethnicity ?? "Unknown";
    race[key] = (race[key] ?? 0) + 1;
  }
  const raceSorted = Object.entries(race).sort(([, a], [, b]) => b - a);
  const racePct = Object.fromEntries(
    raceSorted.map(([k, v]) => [k, pct(v)])
  );

  // Tenure breakdown
  const tenure: Record<string, number> = {};
  for (const r of respondents) {
    const key = r.tenure_type ?? "Unknown";
    tenure[key] = (tenure[key] ?? 0) + 1;
  }
  const tenurePct = Object.fromEntries(
    Object.entries(tenure).map(([k, v]) => [k, pct(v)])
  );

  return { sex: sexPct, age: agePct, race: racePct, tenure: tenurePct };
}
