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
export const ModelSchema = z.enum(["gpt-5-mini", "gpt-5.2"]);
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
  "gpt-5.2": {
    name: "GPT-5.2",
    inputCostPer1M: 1.75,
    outputCostPer1M: 14.0,
    respondentsPerCreditLikert: 1,
    respondentsPerCreditOpenEnded: 1,
  },
};

// Location filter (replaces demographic filters for location-first flow)
export const LocationFilterSchema = z.object({
  type: z.enum(["zip", "state", "district", "city", "national"]),
  value: z.string(),
  label: z.string(),
});

export type LocationFilter = z.infer<typeof LocationFilterSchema>;

// Legacy demographic filters (kept for backward compatibility with existing surveys)
export const DemographicFiltersSchema = z.object({
  ageRange: z.tuple([z.number().min(18).max(100), z.number().min(18).max(100)]),
  incomeRange: z.tuple([z.number().min(0), z.number()]),
  states: z.array(z.string()).optional(),
});

export type DemographicFilters = z.infer<typeof DemographicFiltersSchema>;

// Person record from real microdata (CPS-based, from PolicyEngine HF district files)
export interface PersonRecord {
  age: number;
  is_female: boolean;
  cps_race: number;
  is_hispanic: boolean;
  employment_income: number;
  self_employment_income: number;
  occupation_code: number;
  tenure_type: number;
  children_count: number;
  is_in_college: boolean;
  is_disabled: boolean;
  has_medicaid: boolean;
  has_medicare: boolean;
  receives_ssi: boolean;
  receives_snap: boolean;
  receives_tanf: boolean;
  receives_unemployment: boolean;
  receives_social_security: boolean;
  zcta: string;
  weight: number;
}

// Enriched persona (includes real microdata fields + generated ID)
export const PersonaSchema = z.object({
  id: z.string(),
  age: z.number(),
  income: z.number(),
  state: z.string(),
  weight: z.number().optional(),
  // New rich demographic fields
  sex: z.string().optional(),
  race_ethnicity: z.string().optional(),
  occupation: z.string().optional(),
  tenure_type: z.string().optional(),
  children_count: z.number().optional(),
  is_college_student: z.boolean().optional(),
  is_disabled: z.boolean().optional(),
  insurance_type: z.string().optional(),
  receives_benefits: z.boolean().optional(),
  congressional_district: z.string().optional(),
  zip_code: z.string().optional(),
});

export type Persona = z.infer<typeof PersonaSchema>;

// Survey configuration
export const SurveyConfigSchema = z.object({
  question: z.string().min(10, "Question must be at least 10 characters"),
  responseType: ResponseTypeSchema,
  model: ModelSchema,
  hiveSize: z.number().min(1).max(1000),
  location: LocationFilterSchema.optional(),
  // Legacy field kept for backward compatibility
  demographicFilters: DemographicFiltersSchema.optional(),
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

// Survey progress state (used by hero form and new survey page)
export interface ProgressState {
  stage: string;
  message: string;
  progress: number;
  completed?: number;
  total?: number;
}

// Credit pricing - $0.10 per credit (simple, transparent)
export const CREDIT_PRICE_CENTS = 10; // $0.10 per credit

// Pre-defined credit bundles for UI convenience
export const CREDIT_BUNDLES = [
  { credits: 100, price: 10, popular: false },
  { credits: 500, price: 50, popular: true },
  { credits: 1000, price: 100, popular: false },
] as const;
