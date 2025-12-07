import OpenAI from "openai";
import type { Model, ResponseType, LikertScale, DemographicFilters } from "@/types";
import { generatePersonas, type Persona } from "./personas";
import { buildSystemPrompt, buildUserPrompt, parseLikertResponse } from "./prompts";

// Lazy-initialize OpenAI client
let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

export interface SimulationResult {
  personaId: string;
  likertResponse: LikertScale | null;
  openEndedResponse: string | null;
  reasoning: string | null;
}

export interface SimulationConfig {
  question: string;
  responseType: ResponseType;
  model: Model;
  hiveSize: number;
  demographicFilters: DemographicFilters;
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
      max_completion_tokens: 2000, // GPT-5 uses reasoning tokens
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

export async function runSimulation(
  config: SimulationConfig
): Promise<{ personas: Persona[]; results: SimulationResult[] }> {
  const { question, responseType, model, hiveSize, demographicFilters } = config;

  // Generate personas
  const personas = generatePersonas(hiveSize, demographicFilters);

  // Query LLM for each persona in parallel batches
  const BATCH_SIZE = 10;
  const results: SimulationResult[] = [];

  for (let i = 0; i < personas.length; i += BATCH_SIZE) {
    const batch = personas.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((persona) => queryLLM(question, responseType, model, persona))
    );
    results.push(...batchResults);
  }

  return { personas, results };
}

// Token estimation for cost calculation
export function estimateTokens(
  question: string,
  responseType: ResponseType,
  hiveSize: number
): { input: number; output: number } {
  // Rough estimates based on prompt structure
  const systemPromptTokens = responseType === "likert" ? 150 : 100;
  const questionTokens = Math.ceil(question.length / 4);
  const inputTokensPerRequest = systemPromptTokens + questionTokens + 50; // overhead

  const outputTokensPerRequest = responseType === "likert" ? 80 : 150;

  return {
    input: inputTokensPerRequest * hiveSize,
    output: outputTokensPerRequest * hiveSize,
  };
}
