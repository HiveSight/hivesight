import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { estimateTokens } from "@/lib/simulation/engine";
import { MODEL_CONFIG } from "@/types";

const EstimateSchema = z.object({
  question: z.string().min(1),
  responseType: z.enum(["likert", "open_ended"]),
  model: z.enum(["gpt-4o-mini", "gpt-4o"]),
  hiveSize: z.number().min(1).max(1000),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = EstimateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { question, responseType, model, hiveSize } = parsed.data;

    const tokenEstimate = estimateTokens(question, responseType, hiveSize);
    const modelConfig = MODEL_CONFIG[model];

    const inputCost =
      (tokenEstimate.input * modelConfig.inputCostPer1M) / 1000000;
    const outputCost =
      (tokenEstimate.output * modelConfig.outputCostPer1M) / 1000000;
    const totalCost = inputCost + outputCost;

    // Convert to credits (1 credit = $0.01)
    const creditsRequired = Math.max(1, Math.ceil(totalCost * 100));

    return NextResponse.json({
      tokens: {
        input: tokenEstimate.input,
        output: tokenEstimate.output,
        total: tokenEstimate.input + tokenEstimate.output,
      },
      cost: {
        input: inputCost,
        output: outputCost,
        total: totalCost,
      },
      credits: creditsRequired,
      model: modelConfig.name,
    });
  } catch (error) {
    console.error("Estimate API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
