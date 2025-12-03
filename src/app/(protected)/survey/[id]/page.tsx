import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LikertChart } from "@/components/survey/likert-chart";
import { ResponseTable } from "@/components/survey/response-table";
import type { Database } from "@/types/database";

type Survey = Database["public"]["Tables"]["surveys"]["Row"];
type Respondent = Database["public"]["Tables"]["respondents"]["Row"];
type Response = Database["public"]["Tables"]["responses"]["Row"];

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

  if (!user) {
    notFound();
  }

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
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    notFound();
  }

  const survey = data as unknown as SurveyWithData;

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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Survey Results</h1>
          <p className="text-muted-foreground mt-1">
            {survey.hive_size} respondents &middot; {survey.model}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
          <Button asChild>
            <Link href="/survey/new">New Survey</Link>
          </Button>
        </div>
      </div>

      {/* Status */}
      {survey.status !== "completed" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-1 text-sm rounded-full ${
                  survey.status === "processing"
                    ? "bg-yellow-100 text-yellow-800"
                    : survey.status === "failed"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-800"
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
            <CardTitle>Response Distribution</CardTitle>
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
                <p className="text-2xl font-bold">{survey.responses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Response Table */}
      <Card>
        <CardHeader>
          <CardTitle>Individual Responses</CardTitle>
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
    (r) => r.likert_response === "agree" || r.likert_response === "strongly_agree"
  ).length;

  return responses.length > 0 ? (agreeCount / responses.length) * 100 : 0;
}
