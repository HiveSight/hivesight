import { z } from "zod";

// Response types
export type ResponseType = "likert" | "open_ended";

export const ResponseTypeSchema = z.enum(["likert", "open_ended"]);

// Likert scale
export const LikertScaleSchema = z.enum([
  "strongly_disagree",
  "disagree",
  "neutral",
  "agree",
  "strongly_agree",
]);

export type LikertScale = z.infer<typeof LikertScaleSchema>;

export const LIKERT_LABELS: Record<LikertScale, string> = {
  strongly_disagree: "Strongly Disagree",
  disagree: "Disagree",
  neutral: "Neutral",
  agree: "Agree",
  strongly_agree: "Strongly Agree",
};

export const LIKERT_VALUES: Record<LikertScale, number> = {
  strongly_disagree: 1,
  disagree: 2,
  neutral: 3,
  agree: 4,
  strongly_agree: 5,
};

// Model configuration
export const ModelSchema = z.enum(["gpt-5-mini", "gpt-5"]);
export type Model = z.infer<typeof ModelSchema>;

export const MODEL_CONFIG: Record<
  Model,
  {
    name: string;
    inputCostPer1M: number;
    outputCostPer1M: number;
    respondentsPerCreditLikert: number;
    respondentsPerCreditOpenEnded: number;
  }
> = {
  "gpt-5-mini": {
    name: "GPT-5 Mini",
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.0,
    respondentsPerCreditLikert: 4,
    respondentsPerCreditOpenEnded: 2,
  },
  "gpt-5": {
    name: "GPT-5",
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.0,
    respondentsPerCreditLikert: 1,
    respondentsPerCreditOpenEnded: 1,
  },
};

// Demographic filters
export const DemographicFiltersSchema = z.object({
  ageRange: z.tuple([z.number().min(18).max(100), z.number().min(18).max(100)]),
  incomeRange: z.tuple([z.number().min(0), z.number()]),
  states: z.array(z.string()).optional(),
});

export type DemographicFilters = z.infer<typeof DemographicFiltersSchema>;

// Persona (respondent)
export const PersonaSchema = z.object({
  id: z.string(),
  age: z.number(),
  income: z.number(),
  state: z.string(),
  weight: z.number().optional(),
});

export type Persona = z.infer<typeof PersonaSchema>;

// Survey configuration
export const SurveyConfigSchema = z.object({
  question: z.string().min(10, "Question must be at least 10 characters"),
  responseType: ResponseTypeSchema,
  model: ModelSchema,
  hiveSize: z.number().min(1).max(1000),
  demographicFilters: DemographicFiltersSchema,
  useCustomPersonas: z.boolean().default(false),
  customPersonas: z.array(PersonaSchema).optional(),
});

export type SurveyConfig = z.infer<typeof SurveyConfigSchema>;

// Response
export const SurveyResponseSchema = z.object({
  id: z.string(),
  personaId: z.string(),
  likertResponse: LikertScaleSchema.nullable(),
  openEndedResponse: z.string().nullable(),
  reasoning: z.string().nullable(),
  createdAt: z.string(),
});

export type SurveyResponse = z.infer<typeof SurveyResponseSchema>;

// Survey (query) result
export const SurveyResultSchema = z.object({
  id: z.string(),
  question: z.string(),
  responseType: ResponseTypeSchema,
  model: ModelSchema,
  hiveSize: z.number(),
  responses: z.array(SurveyResponseSchema),
  personas: z.array(PersonaSchema),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
});

export type SurveyResult = z.infer<typeof SurveyResultSchema>;

// User subscription tier
export const SubscriptionTierSchema = z.enum(["free", "basic", "premium"]);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

export const TIER_CONFIG: Record<
  SubscriptionTier,
  {
    name: string;
    monthlyCredits: number;
    priceMonthly: number;
    maxHiveSize: number;
  }
> = {
  free: {
    name: "Free",
    monthlyCredits: 100,
    priceMonthly: 0,
    maxHiveSize: 50,
  },
  basic: {
    name: "Basic",
    monthlyCredits: 1000,
    priceMonthly: 29,
    maxHiveSize: 250,
  },
  premium: {
    name: "Premium",
    monthlyCredits: 10000,
    priceMonthly: 99,
    maxHiveSize: 1000,
  },
};

// User profile
export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  tier: SubscriptionTierSchema,
  creditBalance: z.number(),
  stripeCustomerId: z.string().nullable(),
  createdAt: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
