import { createClient } from "@/lib/supabase/server";
import { z } from "zod/v4";
import { MODEL_CONFIG } from "@/types";
import { generatePersonas, type Persona } from "@/lib/simulation/personas";
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
  DemographicFilters,
} from "@/types";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Survey = Database["public"]["Tables"]["surveys"]["Row"];
type Respondent = Database["public"]["Tables"]["respondents"]["Row"];

interface SimulationResult {
  personaId: string;
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
  model: z.enum(["gpt-5-mini", "gpt-5"]),
  hiveSize: z.number().min(1).max(1000),
  demographicFilters: z.object({
    ageRange: z.tuple([z.number(), z.number()]),
    incomeRange: z.tuple([z.number(), z.number()]),
    states: z.array(z.string()).optional(),
  }),
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
  persona: Persona
): Promise<SimulationResult> {
  const systemPrompt = buildSystemPrompt(responseType, persona);
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
        personaId: persona.id,
        likertResponse: likert,
        openEndedResponse: null,
        reasoning,
      };
    }

    return {
      personaId: persona.id,
      likertResponse: null,
      openEndedResponse: content,
      reasoning: null,
    };
  } catch (error) {
    console.error(`Error querying LLM for persona ${persona.id}:`, error);
    return {
      personaId: persona.id,
      likertResponse: null,
      openEndedResponse: null,
      reasoning: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse request body
  const body = await request.json();
  const parsed = CreateSurveySchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } }
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
    return new Response(JSON.stringify({ error: "Profile not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Calculate credits
  const modelConfig = MODEL_CONFIG[model];
  const respondentsPerCredit =
    responseType === "likert"
      ? modelConfig.respondentsPerCreditLikert
      : modelConfig.respondentsPerCreditOpenEnded;
  const creditsRequired = Math.max(1, Math.ceil(hiveSize / respondentsPerCredit));

  if (profile.credit_balance < creditsRequired) {
    return new Response(
      JSON.stringify({
        error: "Insufficient credits",
        required: creditsRequired,
        available: profile.credit_balance,
      }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  }

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

        const { data: surveyData, error: surveyError } = await supabase
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

        if (surveyError || !surveyData) {
          sendEvent(controller, "error", { message: "Failed to create survey" });
          controller.close();
          return;
        }

        const survey = surveyData as unknown as Survey;

        // Step 2: Generate personas
        sendEvent(controller, "progress", {
          stage: "personas",
          message: "Generating personas...",
          progress: 10,
        });

        const personas = generatePersonas(
          hiveSize,
          demographicFilters as DemographicFilters
        );

        // Step 3: Process responses in batches
        const BATCH_SIZE = 10;
        const results: SimulationResult[] = [];
        const totalBatches = Math.ceil(personas.length / BATCH_SIZE);

        for (let i = 0; i < personas.length; i += BATCH_SIZE) {
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const completed = Math.min(i + BATCH_SIZE, personas.length);
          const progressPercent = 10 + Math.floor((completed / personas.length) * 75);

          sendEvent(controller, "progress", {
            stage: "processing",
            message: `Processing responses... (${completed}/${personas.length})`,
            progress: progressPercent,
            completed,
            total: personas.length,
            batch: batchNum,
            totalBatches,
          });

          const batch = personas.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map((persona) =>
              queryLLM(question, responseType as ResponseType, model, persona)
            )
          );
          results.push(...batchResults);
        }

        // Step 4: Save respondents
        sendEvent(controller, "progress", {
          stage: "saving",
          message: "Saving results...",
          progress: 90,
        });

        const respondentInserts = personas.map((persona) => ({
          survey_id: survey.id,
          age: persona.age,
          income: persona.income,
          state: persona.state,
          weight: persona.weight,
        }));

        const { data: respondentsData, error: respondentError } = await supabase
          .from("respondents")
          .insert(respondentInserts as never)
          .select();

        if (respondentError || !respondentsData) {
          await supabase
            .from("surveys")
            .update({ status: "failed" } as never)
            .eq("id", survey.id);
          sendEvent(controller, "error", {
            message: "Failed to store respondents",
          });
          controller.close();
          return;
        }

        const respondents = respondentsData as unknown as Respondent[];

        // Map persona IDs to respondent IDs
        const personaToRespondent = new Map<string, string>();
        personas.forEach((persona, index) => {
          personaToRespondent.set(persona.id, respondents[index].id);
        });

        // Save responses
        const responseInserts = results.map((result) => ({
          survey_id: survey.id,
          respondent_id: personaToRespondent.get(result.personaId)!,
          likert_response: result.likertResponse,
          open_ended_response: result.openEndedResponse,
          reasoning: result.reasoning,
        }));

        const { error: responseError } = await supabase
          .from("responses")
          .insert(responseInserts as never);

        if (responseError) {
          await supabase
            .from("surveys")
            .update({ status: "failed" } as never)
            .eq("id", survey.id);
          sendEvent(controller, "error", { message: "Failed to store responses" });
          controller.close();
          return;
        }

        // Deduct credits
        await supabase
          .from("profiles")
          .update({
            credit_balance: profile.credit_balance - creditsRequired,
          } as never)
          .eq("id", user.id);

        // Log transaction
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

        // Send completion
        sendEvent(controller, "progress", {
          stage: "complete",
          message: "Survey complete!",
          progress: 100,
        });

        sendEvent(controller, "complete", {
          surveyId: survey.id,
          creditsUsed: creditsRequired,
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
