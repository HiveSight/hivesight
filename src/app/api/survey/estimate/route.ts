import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { MODEL_CONFIG } from "@/types";

const EstimateSchema = z.object({
  responseType: z.enum(["likert", "open_ended"]),
  model: z.enum(["gpt-5-mini", "gpt-5"]),
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

    const { responseType, model, hiveSize } = parsed.data;
    const modelConfig = MODEL_CONFIG[model];

    // Per-respondent pricing
    const respondentsPerCredit =
      responseType === "likert"
        ? modelConfig.respondentsPerCreditLikert
        : modelConfig.respondentsPerCreditOpenEnded;

    const creditsRequired = Math.max(1, Math.ceil(hiveSize / respondentsPerCredit));

    return NextResponse.json({
      credits: creditsRequired,
      respondentsPerCredit,
      model: modelConfig.name,
      hiveSize,
      responseType,
    });
  } catch (error) {
    console.error("Estimate API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
