import type { AudienceFilters, LocationFilter } from "@/types";
import { hasActiveAudienceFilters } from "./audience-filters";

export const FIELD_SELECTION_VERSION = "field-selector:v2";

export type ProductMode =
  | "marketing"
  | "product"
  | "policy"
  | "academic"
  | "editorial"
  | "generic";

export type PromptFieldId =
  | "audience_geography"
  | "age_band"
  | "income_band"
  | "occupation"
  | "housing_tenure"
  | "children"
  | "college_status"
  | "sex"
  | "race_ethnicity"
  | "disability"
  | "insurance"
  | "benefits"
  | "exact_zip";

export type FieldSensitivity = "low" | "moderate" | "sensitive";

export interface FieldRegistryEntry {
  id: PromptFieldId;
  label: string;
  promptLabel: string;
  sensitivity: FieldSensitivity;
  allowedUses: string[];
}

export interface SelectedPromptField extends FieldRegistryEntry {
  reason: string;
}

export interface FieldSelectionPlan {
  version: string;
  included: SelectedPromptField[];
  excluded: SelectedPromptField[];
  productMode: ProductMode;
}

export interface FieldSelectionInput {
  question?: string;
  responseType?: "likert" | "open_ended";
  location?: LocationFilter;
  audienceFilters?: AudienceFilters;
  productMode?: ProductMode;
}

export const FIELD_REGISTRY: Record<PromptFieldId, FieldRegistryEntry> = {
  audience_geography: {
    id: "audience_geography",
    label: "Audience geography",
    promptLabel: "place context",
    sensitivity: "low",
    allowedUses: ["All runs"],
  },
  age_band: {
    id: "age_band",
    label: "Age band",
    promptLabel: "age band",
    sensitivity: "low",
    allowedUses: ["All runs"],
  },
  income_band: {
    id: "income_band",
    label: "Income band",
    promptLabel: "earned income band",
    sensitivity: "moderate",
    allowedUses: ["All runs", "Economic targeting"],
  },
  occupation: {
    id: "occupation",
    label: "Occupation",
    promptLabel: "broad occupation",
    sensitivity: "moderate",
    allowedUses: ["All runs", "Work and consumer context"],
  },
  housing_tenure: {
    id: "housing_tenure",
    label: "Housing tenure",
    promptLabel: "housing tenure",
    sensitivity: "moderate",
    allowedUses: ["All runs", "Housing and household economics"],
  },
  children: {
    id: "children",
    label: "Children in household",
    promptLabel: "children in household",
    sensitivity: "moderate",
    allowedUses: ["All runs", "Family and household decisions"],
  },
  college_status: {
    id: "college_status",
    label: "College status",
    promptLabel: "college status",
    sensitivity: "moderate",
    allowedUses: ["All runs", "Education and early-adult context"],
  },
  sex: {
    id: "sex",
    label: "Sex",
    promptLabel: "sex",
    sensitivity: "sensitive",
    allowedUses: ["Identity-relevant questions", "Explicit audience targeting"],
  },
  race_ethnicity: {
    id: "race_ethnicity",
    label: "Race/ethnicity",
    promptLabel: "race/ethnicity",
    sensitivity: "sensitive",
    allowedUses: ["Identity-relevant questions", "Explicit audience targeting"],
  },
  disability: {
    id: "disability",
    label: "Disability",
    promptLabel: "disability status",
    sensitivity: "sensitive",
    allowedUses: ["Health, benefits, accessibility", "Explicit audience targeting"],
  },
  insurance: {
    id: "insurance",
    label: "Medicare/Medicaid coverage",
    promptLabel: "public health coverage",
    sensitivity: "sensitive",
    allowedUses: ["Health coverage questions", "Explicit audience targeting"],
  },
  benefits: {
    id: "benefits",
    label: "Benefits receipt",
    promptLabel: "benefits receipt",
    sensitivity: "sensitive",
    allowedUses: ["Benefits and financial-security questions", "Explicit audience targeting"],
  },
  exact_zip: {
    id: "exact_zip",
    label: "Exact ZIP",
    promptLabel: "ZIP code",
    sensitivity: "moderate",
    allowedUses: ["Selected ZIP audiences", "Local-place questions"],
  },
};

const CORE_FIELDS: PromptFieldId[] = [
  "audience_geography",
  "age_band",
  "income_band",
  "occupation",
  "housing_tenure",
  "children",
  "college_status",
];

const FIELD_ORDER = Object.keys(FIELD_REGISTRY) as PromptFieldId[];

const HEALTH_KEYWORDS = [
  "abortion",
  "clinic",
  "doctor",
  "health",
  "healthcare",
  "health coverage",
  "health insurance",
  "hospital",
  "medicaid",
  "medical",
  "medical insurance",
  "medicare",
  "mental health",
  "pregnancy",
  "prescription",
  "reproductive",
];

const BENEFITS_KEYWORDS = [
  "benefit",
  "benefits",
  "food stamp",
  "poverty",
  "safety net",
  "snap",
  "social security",
  "ssi",
  "tanf",
  "unemployment",
  "welfare",
];

const LOCAL_KEYWORDS = [
  "bus",
  "city",
  "commute",
  "county",
  "district",
  "local",
  "neighborhood",
  "neighbourhood",
  "roads",
  "school board",
  "train",
  "transit",
  "zip",
  "zoning",
];

const RACE_KEYWORDS = [
  "affirmative action",
  "asian",
  "black americans",
  "black people",
  "black voters",
  "ethnic",
  "ethnicity",
  "hispanic",
  "immigration",
  "immigrant",
  "latina",
  "latino",
  "race",
  "racial",
  "white americans",
  "white people",
  "white voters",
];

const SEX_KEYWORDS = [
  "father",
  "female",
  "gender",
  "male",
  "man",
  "maternal",
  "men",
  "mother",
  "woman",
  "women",
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) =>
    new RegExp(`\\b${escapeRegex(keyword).replace(/\\ /g, "\\s+")}\\b`, "i").test(text)
  );
}

function hasTargetedSensitiveField(
  field: PromptFieldId,
  filters: AudienceFilters | undefined
): boolean {
  if (!hasActiveAudienceFilters(filters)) return false;

  switch (field) {
    case "sex":
      return filters.sex !== undefined;
    case "race_ethnicity":
      return Boolean(filters.raceEthnicity?.length);
    case "disability":
      return filters.disabilityStatus !== undefined;
    case "insurance":
      return Boolean(filters.insurance?.length);
    case "benefits":
      return filters.benefitsStatus !== undefined;
    default:
      return false;
  }
}

function pushSelected(
  selected: Map<PromptFieldId, string>,
  id: PromptFieldId,
  reason: string
) {
  if (!selected.has(id)) {
    selected.set(id, reason);
  }
}

export function selectPromptFields(
  input: FieldSelectionInput = {}
): FieldSelectionPlan {
  const question = input.question?.toLowerCase() ?? "";
  const productMode = input.productMode ?? "generic";
  const selected = new Map<PromptFieldId, string>();

  for (const field of CORE_FIELDS) {
    pushSelected(
      selected,
      field,
      "Core non-sensitive context for human-like audience responses."
    );
  }

  const isHealthQuestion = hasAnyKeyword(question, HEALTH_KEYWORDS);
  const isBenefitsQuestion = hasAnyKeyword(question, BENEFITS_KEYWORDS);
  const isLocalQuestion = hasAnyKeyword(question, LOCAL_KEYWORDS);

  if (hasAnyKeyword(question, RACE_KEYWORDS)) {
    pushSelected(
      selected,
      "race_ethnicity",
      "Included because the question references race, ethnicity, or immigration."
    );
  }

  if (hasAnyKeyword(question, SEX_KEYWORDS)) {
    pushSelected(
      selected,
      "sex",
      "Included because the question references sex, gender, or sex-specific roles."
    );
  }

  if (question.includes("disab") || isHealthQuestion || isBenefitsQuestion) {
    pushSelected(
      selected,
      "disability",
      "Included because the question concerns health, benefits, or disability."
    );
  }

  if (isHealthQuestion) {
    pushSelected(
      selected,
      "insurance",
      "Included because the question concerns health care or public coverage."
    );
  }

  if (isBenefitsQuestion) {
    pushSelected(
      selected,
      "benefits",
      "Included because the question concerns benefits or financial security."
    );
  }

  if (input.location?.type === "zip") {
    pushSelected(selected, "exact_zip", "Included because the selected audience is a ZIP code.");
  } else if (isLocalQuestion && (!input.location || input.location.type === "national")) {
    pushSelected(
      selected,
      "exact_zip",
      "Included because a national audience is being asked a local-place question."
    );
  }

  for (const field of FIELD_ORDER) {
    if (hasTargetedSensitiveField(field, input.audienceFilters)) {
      pushSelected(
        selected,
        field,
        "Included because the audience filter explicitly targets this field."
      );
    }
  }

  const included = FIELD_ORDER.filter((field) => selected.has(field)).map(
    (field) => ({
      ...FIELD_REGISTRY[field],
      reason: selected.get(field)!,
    })
  );

  const excluded = FIELD_ORDER.filter((field) => !selected.has(field)).map(
    (field) => ({
      ...FIELD_REGISTRY[field],
      reason:
        FIELD_REGISTRY[field].sensitivity === "sensitive"
          ? "Excluded because the question and audience filters do not require this sensitive field."
          : "Excluded because it is not needed for this question."
    })
  );

  return {
    version: FIELD_SELECTION_VERSION,
    included,
    excluded,
    productMode,
  };
}

export function getSelectedFieldIds(plan: FieldSelectionPlan): PromptFieldId[] {
  return plan.included.map((field) => field.id);
}

export function isPromptFieldSelected(
  plan: FieldSelectionPlan,
  field: PromptFieldId
): boolean {
  return plan.included.some((item) => item.id === field);
}
