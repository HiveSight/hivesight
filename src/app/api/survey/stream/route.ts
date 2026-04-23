import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { MODEL_CONFIG, LocationFilterSchema } from "@/types";
import { loadAndSampleForLocation } from "@/lib/data/location-resolver";
import {
  createPersonDescriptionFormatter,
  getInsuranceType,
} from "@/lib/data/demographics";
import { getRaceLabel } from "@/lib/data/race-codes";
import { getOccupationLabel } from "@/lib/data/occupation-codes";
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseLikertResponse,
} from "@/lib/simulation/prompts";
import OpenAI from "openai";
import type {
  Model,
  ResponseType,
  LikertScale,
  LocationFilter,
} from "@/types";
import type { Database } from "@/types/database";

type Survey = Database["public"]["Tables"]["surveys"]["Row"];
type Respondent = Database["public"]["Tables"]["respondents"]["Row"];

interface SimulationResult {
  personIndex: number;
  likertResponse: LikertScale | null;
  openEndedResponse: string | null;
  reasoning: string | null;
}

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

const CreateSurveySchema = z.object({
  question: z.string().min(10),
  responseType: z.enum(["likert", "open_ended"]),
  model: z.enum(["gpt-5-mini", "gpt-5.2"]),
  hiveSize: z.number().min(1).max(1000),
  location: LocationFilterSchema.optional(),
  // Legacy support
  demographicFilters: z
    .object({
      ageRange: z.tuple([z.number(), z.number()]),
      incomeRange: z.tuple([z.number(), z.number()]),
      states: z.array(z.string()).optional(),
    })
    .optional(),
});

function sendEvent(
  controller: ReadableStreamDefaultController,
  event: string,
  data: Record<string, unknown>
) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function queryLLM(
  question: string,
  responseType: ResponseType,
  model: Model,
  personDescription: string,
  personIndex: number
): Promise<SimulationResult> {
  const systemPrompt = buildSystemPrompt(responseType, personDescription);
  const userPrompt = buildUserPrompt(question, responseType);

  try {
    const completion = await getOpenAI().chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content ?? "";

    if (responseType === "likert") {
      const { likert, reasoning } = parseLikertResponse(content);
      return {
        personIndex,
        likertResponse: likert,
        openEndedResponse: null,
        reasoning,
      };
    }

    return {
      personIndex,
      likertResponse: null,
      openEndedResponse: content,
      reasoning: null,
    };
  } catch (error) {
    console.error(`Error querying LLM for person ${personIndex}:`, error);
    return {
      personIndex,
      likertResponse: null,
      openEndedResponse: null,
      reasoning: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Rate limiting for free tier (unauthenticated users)
const FREE_TIER_MAX_SURVEYS_PER_DAY = 3;
const FREE_TIER_MAX_RESPONDENTS = 25;

/* eslint-disable @typescript-eslint/no-explicit-any */
// rate_limits table added in migration 00002 but not in generated Supabase types yet
// These functions are best-effort — if the table doesn't exist, they silently allow/skip
async function checkRateLimit(ip: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = (await (supabase as any)
      .from("rate_limits")
      .select("survey_count")
      .eq("ip_address", ip)
      .gte("window_start", oneDayAgo)
      .single()) as { data: { survey_count: number } | null; error: unknown };

    if (error || !data) return true; // Table missing or no record = allowed
    return data.survey_count < FREE_TIER_MAX_SURVEYS_PER_DAY;
  } catch {
    return true; // Allow on error
  }
}

async function incrementRateLimit(ip: string) {
  try {
    const supabase = await createClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data } = (await (supabase as any)
      .from("rate_limits")
      .select("id, survey_count")
      .eq("ip_address", ip)
      .gte("window_start", oneDayAgo)
      .single()) as { data: { id: string; survey_count: number } | null };

    if (data) {
      await (supabase as any)
        .from("rate_limits")
        .update({ survey_count: data.survey_count + 1 })
        .eq("id", data.id);
    } else {
      await (supabase as any)
        .from("rate_limits")
        .insert({ ip_address: ip, survey_count: 1 });
    }
  } catch {
    // Silently skip if rate_limits table doesn't exist
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function getStateFromDistrict(districtId: string): string {
  if (districtId.length === 2) return districtId;
  const parts = districtId.split("-");
  return parts[0] || "US";
}

async function updateSurveyWithFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  surveyId: string,
  values: Record<string, unknown>,
  fallbackValues: Record<string, unknown>
) {
  const { error } = await supabase
    .from("surveys")
    .update(values as never)
    .eq("id", surveyId);

  if (error) {
    await supabase
      .from("surveys")
      .update(fallbackValues as never)
      .eq("id", surveyId);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Check authentication (optional for free tier)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Parse request body
  const body = await request.json();
  const parsed = CreateSurveySchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { question, responseType, model, location } = parsed.data;
  let { hiveSize } = parsed.data;

  // Free tier vs authenticated
  let creditsRequired = 0;
  let profileBalance = 0;

  if (user) {
    // Authenticated: credit-based
    const { data: profileData } = await supabase
      .from("profiles")
      .select("credit_balance, tier")
      .eq("id", user.id)
      .single();

    const profile = profileData as unknown as { credit_balance: number; tier: string } | null;

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    profileBalance = profile.credit_balance;

    const modelConfig = MODEL_CONFIG[model];
    const respondentsPerCredit =
      responseType === "likert"
        ? modelConfig.respondentsPerCreditLikert
        : modelConfig.respondentsPerCreditOpenEnded;
    creditsRequired = Math.max(1, Math.ceil(hiveSize / respondentsPerCredit));

    if (profileBalance < creditsRequired) {
      return new Response(
        JSON.stringify({
          error: "Insufficient credits",
          required: creditsRequired,
          available: profileBalance,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    }
  } else {
    // Free tier: rate limited, capped respondents
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message:
            "Free tier allows 3 surveys per day. Sign up for more!",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    hiveSize = Math.min(hiveSize, FREE_TIER_MAX_RESPONDENTS);
  }

  // Default location if not provided
  const effectiveLocation: LocationFilter = location ?? {
    type: "national",
    value: "US",
    label: "United States",
  };

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1: Create survey
        sendEvent(controller, "progress", {
          stage: "creating",
          message: "Creating survey...",
          progress: 5,
        });

        // Try inserting with new schema first, fall back to base schema
        let surveyData;
        let surveyError;

        // First try with location column (new schema)
        ({ data: surveyData, error: surveyError } = await supabase
          .from("surveys")
          .insert([
            {
              user_id: user?.id ?? null,
              question,
              response_type: responseType,
              model,
              hive_size: hiveSize,
              demographic_filters: {},
              location: effectiveLocation,
              status: "processing",
            },
          ] as never)
          .select()
          .single());

        // If it failed (likely missing columns or NOT NULL on user_id), try base schema
        if (surveyError) {
          console.warn("New schema insert failed, trying base schema:", surveyError.message);

          // If no user and insert failed, old schema requires user_id NOT NULL
          if (!user?.id) {
            sendEvent(controller, "error", {
              message: "Please sign in to create surveys. Anonymous surveys will be available soon.",
            });
            controller.close();
            return;
          }

          ({ data: surveyData, error: surveyError } = await supabase
            .from("surveys")
            .insert([{
              user_id: user.id,
              question,
              response_type: responseType,
              model,
              hive_size: hiveSize,
              demographic_filters: {},
              status: "processing",
            }] as never)
            .select()
            .single());
        }

        if (surveyError || !surveyData) {
          sendEvent(controller, "error", {
            message: `Failed to create survey: ${surveyError?.message || "unknown"}`,
          });
          controller.close();
          return;
        }

        const survey = surveyData as unknown as Survey;

        // Step 2: Load and sample the calibrated local population
        sendEvent(controller, "progress", {
          stage: "loading",
          message: `Loading the calibrated population for ${effectiveLocation.label}...`,
          progress: 10,
        });

        const { persons: sampledPersons, synthetic } =
          await loadAndSampleForLocation(effectiveLocation, hiveSize);
        const personaSource = synthetic ? "synthetic_fallback" : "microdata";

        if (synthetic) {
          sendEvent(controller, "progress", {
            stage: "loading",
            message: `Using synthetic demographic profiles for ${effectiveLocation.label}...`,
            progress: 12,
          });
        }

        // Step 3: Generate descriptions and process responses
        const formatPersonDescription = createPersonDescriptionFormatter({
          question,
          location: effectiveLocation,
        });
        const descriptions = sampledPersons.map(formatPersonDescription);

        const BATCH_SIZE = 10;
        const results: SimulationResult[] = [];
        const totalBatches = Math.ceil(sampledPersons.length / BATCH_SIZE);

        for (let i = 0; i < sampledPersons.length; i += BATCH_SIZE) {
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const batchSize = Math.min(BATCH_SIZE, sampledPersons.length - i);

          sendEvent(controller, "progress", {
            stage: "processing",
            message: `Processing batch ${batchNum} of ${totalBatches}... (${results.length}/${sampledPersons.length} complete)`,
            progress: 15 + Math.floor((results.length / sampledPersons.length) * 70),
            completed: results.length,
            total: sampledPersons.length,
            batch: batchNum,
            totalBatches,
          });

          const batchIndices = Array.from(
            { length: batchSize },
            (_, j) => i + j
          );

          const batchResults = await Promise.all(
            batchIndices.map((idx) =>
              queryLLM(
                question,
                responseType as ResponseType,
                model,
                descriptions[idx],
                idx
              )
            )
          );
          results.push(...batchResults);

          sendEvent(controller, "progress", {
            stage: "processing",
            message: `Processing responses... (${results.length}/${sampledPersons.length} complete)`,
            progress: 15 + Math.floor((results.length / sampledPersons.length) * 70),
            completed: results.length,
            total: sampledPersons.length,
            batch: batchNum,
            totalBatches,
          });
        }

        // Step 4: Save respondents with rich demographics
        sendEvent(controller, "progress", {
          stage: "saving",
          message: "Saving results...",
          progress: 90,
        });

        // Build respondent inserts - try rich schema first, fall back to base
        const richInserts = sampledPersons.map((person) => ({
          survey_id: survey.id,
          age: person.age,
          income: Math.round(
            person.employment_income + person.self_employment_income
          ),
          state: getStateFromDistrict(effectiveLocation.value),
          weight: person.weight,
          sex: person.is_female ? "Female" : "Male",
          race_ethnicity: getRaceLabel(person.cps_race, person.is_hispanic),
          occupation: getOccupationLabel(person.occupation_code),
          is_college_student: person.is_in_college,
          is_disabled: person.is_disabled,
          tenure_type:
            person.tenure_type === 1
              ? "Owner"
              : person.tenure_type === 2
              ? "Renter"
              : "Other",
          has_children: person.children_count > 0,
          children_count: person.children_count,
          insurance_type: getInsuranceType(person),
          receives_benefits:
            person.receives_snap ||
            person.receives_ssi ||
            person.receives_tanf ||
            person.receives_unemployment ||
            person.receives_social_security,
          zip_code: person.zcta,
          congressional_district:
            effectiveLocation.type === "district"
              ? effectiveLocation.value
              : null,
        }));

        // Base inserts (only columns from initial schema)
        const baseInserts = sampledPersons.map((person) => ({
          survey_id: survey.id,
          age: person.age,
          income: Math.round(
            person.employment_income + person.self_employment_income
          ),
          state: getStateFromDistrict(effectiveLocation.value),
          weight: person.weight,
        }));

        let respondentsData;
        let respondentError;

        // Try rich insert first
        ({ data: respondentsData, error: respondentError } = await supabase
          .from("respondents")
          .insert(richInserts as never)
          .select());

        // Fall back to base columns if rich insert fails
        if (respondentError) {
          console.warn("Rich respondent insert failed, using base schema:", respondentError.message);
          ({ data: respondentsData, error: respondentError } = await supabase
            .from("respondents")
            .insert(baseInserts as never)
            .select());
        }

        if (respondentError || !respondentsData) {
          await updateSurveyWithFallback(supabase, survey.id, {
              status: "failed",
              persona_source: personaSource,
            }, {
              status: "failed",
            });
          sendEvent(controller, "error", {
            message: `Failed to store respondents: ${respondentError?.message || "unknown"}`,
          });
          controller.close();
          return;
        }

        const respondents = respondentsData as unknown as Respondent[];

        // Save responses
        const responseInserts = results.map((result) => ({
          survey_id: survey.id,
          respondent_id: respondents[result.personIndex].id,
          likert_response: result.likertResponse,
          open_ended_response: result.openEndedResponse,
          reasoning: result.reasoning,
        }));

        const { error: responseError } = await supabase
          .from("responses")
          .insert(responseInserts as never);

        if (responseError) {
          await updateSurveyWithFallback(supabase, survey.id, {
              status: "failed",
              persona_source: personaSource,
            }, {
              status: "failed",
            });
          sendEvent(controller, "error", { message: "Failed to store responses" });
          controller.close();
          return;
        }

        // Deduct credits (only for authenticated users)
        if (user && creditsRequired > 0) {
          await supabase
            .from("profiles")
            .update({
              credit_balance: profileBalance - creditsRequired,
            } as never)
            .eq("id", user.id);

          await supabase.from("credit_transactions").insert({
            user_id: user.id,
            amount: -creditsRequired,
            type: "usage",
            description: `Survey: ${hiveSize} respondents in ${effectiveLocation.label} with ${model}`,
            survey_id: survey.id,
          } as never);
        }

        // Increment rate limit for free tier
        if (!user) {
          await incrementRateLimit(ip);
        }

        // Update survey status (try with new fields, fall back to base)
        await updateSurveyWithFallback(supabase, survey.id, {
            status: "completed",
            completed_at: new Date().toISOString(),
            credits_used: creditsRequired,
            persona_source: personaSource,
          }, {
            status: "completed",
            completed_at: new Date().toISOString(),
            credits_used: creditsRequired,
          });

        // Send completion
        sendEvent(controller, "progress", {
          stage: "complete",
          message: "Survey complete!",
          progress: 100,
        });

        sendEvent(controller, "complete", {
          surveyId: survey.id,
          creditsUsed: creditsRequired,
          personaSource,
          responseCount: results.length,
        });

        controller.close();
      } catch (error) {
        console.error("Stream error:", error);
        sendEvent(controller, "error", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
