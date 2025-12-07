import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { runSimulation } from "@/lib/simulation/engine";
import { MODEL_CONFIG } from "@/types";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Survey = Database["public"]["Tables"]["surveys"]["Row"];
type Respondent = Database["public"]["Tables"]["respondents"]["Row"];

const CreateSurveySchema = z.object({
  question: z.string().min(10),
  responseType: z.enum(["likert", "open_ended"]),
  model: z.enum(["gpt-5-mini", "gpt-5"]),
  hiveSize: z.number().min(1).max(1000),
  demographicFilters: z.object({
    ageRange: z.tuple([z.number(), z.number()]),
    incomeRange: z.tuple([z.number(), z.number()]),
    states: z.array(z.string()).optional(),
  }),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const parsed = CreateSurveySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { question, responseType, model, hiveSize, demographicFilters } =
      parsed.data;

    // Get user profile for credit check
    const { data: profileData } = await supabase
      .from("profiles")
      .select("credit_balance, tier")
      .eq("id", user.id)
      .single();

    const profile = profileData as Pick<Profile, "credit_balance" | "tier"> | null;

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Calculate credits using per-respondent pricing
    const modelConfig = MODEL_CONFIG[model];
    const respondentsPerCredit =
      responseType === "likert"
        ? modelConfig.respondentsPerCreditLikert
        : modelConfig.respondentsPerCreditOpenEnded;
    const creditsRequired = Math.max(1, Math.ceil(hiveSize / respondentsPerCredit));

    if (profile.credit_balance < creditsRequired) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          required: creditsRequired,
          available: profile.credit_balance,
        },
        { status: 402 }
      );
    }

    // Create survey record - use rpc or raw query to avoid type issues
    const { data: surveyData, error: surveyError } = await supabase.rpc(
      "create_survey" as never,
      {
        p_user_id: user.id,
        p_question: question,
        p_response_type: responseType,
        p_model: model,
        p_hive_size: hiveSize,
        p_demographic_filters: demographicFilters,
      } as never
    );

    // Fallback: direct insert with type assertion
    let survey: Survey | null = null;
    if (surveyError) {
      const insertResult = await supabase
        .from("surveys")
        .insert([
          {
            user_id: user.id,
            question,
            response_type: responseType,
            model,
            hive_size: hiveSize,
            demographic_filters: demographicFilters,
            status: "processing",
          },
        ] as never)
        .select()
        .single();

      if (insertResult.error) {
        console.error("Survey creation error:", insertResult.error);
        return NextResponse.json(
          { error: "Failed to create survey" },
          { status: 500 }
        );
      }
      survey = insertResult.data as unknown as Survey;
    } else {
      survey = surveyData as unknown as Survey;
    }

    if (!survey) {
      return NextResponse.json(
        { error: "Failed to create survey" },
        { status: 500 }
      );
    }

    // Run simulation
    const { personas, results } = await runSimulation({
      question,
      responseType,
      model,
      hiveSize,
      demographicFilters,
    });

    // Store respondents
    const respondentInserts = personas.map((persona) => ({
      survey_id: survey!.id,
      age: persona.age,
      income: persona.income,
      state: persona.state,
      weight: persona.weight,
    }));

    const { data: respondentsData, error: respondentError } = await supabase
      .from("respondents")
      .insert(respondentInserts as never)
      .select();

    const respondents = respondentsData as unknown as Respondent[] | null;

    if (respondentError || !respondents) {
      console.error("Respondent creation error:", respondentError);
      await supabase
        .from("surveys")
        .update({ status: "failed" } as never)
        .eq("id", survey.id);
      return NextResponse.json(
        { error: "Failed to store respondents" },
        { status: 500 }
      );
    }

    // Create persona ID to respondent ID mapping
    const personaToRespondent = new Map<string, string>();
    personas.forEach((persona, index) => {
      personaToRespondent.set(persona.id, respondents[index].id);
    });

    // Store responses
    const responseInserts = results.map((result) => ({
      survey_id: survey!.id,
      respondent_id: personaToRespondent.get(result.personaId)!,
      likert_response: result.likertResponse,
      open_ended_response: result.openEndedResponse,
      reasoning: result.reasoning,
    }));

    const { error: responseError } = await supabase
      .from("responses")
      .insert(responseInserts as never);

    if (responseError) {
      console.error("Response creation error:", responseError);
      await supabase
        .from("surveys")
        .update({ status: "failed" } as never)
        .eq("id", survey.id);
      return NextResponse.json(
        { error: "Failed to store responses" },
        { status: 500 }
      );
    }

    // Deduct credits
    await supabase
      .from("profiles")
      .update({ credit_balance: profile.credit_balance - creditsRequired } as never)
      .eq("id", user.id);

    // Log credit transaction
    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: -creditsRequired,
      type: "usage",
      description: `Survey: ${hiveSize} respondents with ${model}`,
      survey_id: survey.id,
    } as never);

    // Update survey status
    await supabase
      .from("surveys")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        credits_used: creditsRequired,
      } as never)
      .eq("id", survey.id);

    return NextResponse.json({
      surveyId: survey.id,
      creditsUsed: creditsRequired,
      responseCount: results.length,
    });
  } catch (error) {
    console.error("Survey API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch a survey's results
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const surveyId = searchParams.get("id");

  if (!surveyId) {
    return NextResponse.json(
      { error: "Survey ID required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch survey with responses
  const { data: survey, error } = await supabase
    .from("surveys")
    .select(
      `
      *,
      respondents (*),
      responses (*)
    `
    )
    .eq("id", surveyId)
    .eq("user_id", user.id)
    .single();

  if (error || !survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  return NextResponse.json(survey);
}
