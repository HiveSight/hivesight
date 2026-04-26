import type { AudienceFilters, LocationFilter, PersonRecord } from "@/types";
import { getRaceLabel } from "./race-codes";
import { getOccupationLabel } from "./occupation-codes";
import {
  type FieldSelectionPlan,
  isPromptFieldSelected,
  selectPromptFields,
} from "./field-selection";

const TENURE_LABELS: Record<number, string> = {
  1: "homeowner",
  2: "renter",
};

export interface PersonDescriptionOptions {
  question?: string;
  location?: LocationFilter;
  audienceFilters?: AudienceFilters;
  fieldSelection?: FieldSelectionPlan;
}

interface ResolvedPersonDescriptionOptions extends PersonDescriptionOptions {
  fieldSelection: FieldSelectionPlan;
}

export function getInsuranceType(person: PersonRecord): string {
  if (person.has_medicare && person.has_medicaid) return "Medicare and Medicaid";
  if (person.has_medicare) return "Medicare";
  if (person.has_medicaid) return "Medicaid";
  return "not enrolled in Medicare or Medicaid";
}

function getBenefitsList(person: PersonRecord): string[] {
  const benefits: string[] = [];
  if (person.receives_snap) benefits.push("SNAP");
  if (person.receives_ssi) benefits.push("SSI");
  if (person.receives_tanf) benefits.push("TANF");
  if (person.receives_unemployment) benefits.push("unemployment benefits");
  if (person.receives_social_security) benefits.push("Social Security");
  return benefits;
}

function formatIncome(amount: number): string {
  if (amount <= 0) return "no current earned income";
  if (amount < 25000) return "a lower income";
  if (amount < 75000) return "a middle income";
  if (amount < 150000) return "an upper-middle income";
  return "a high income";
}

function resolvePersonDescriptionOptions(
  options: PersonDescriptionOptions = {}
): ResolvedPersonDescriptionOptions {
  return {
    ...options,
    fieldSelection:
      options.fieldSelection ??
      selectPromptFields({
        question: options.question,
        location: options.location,
        audienceFilters: options.audienceFilters,
      }),
  };
}

function toSentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function withArticle(phrase: string): string {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function getAgeBand(age: number): string {
  if (age < 25) return "young adult";
  if (age >= 65) return "older adult";

  const decade = Math.floor(age / 10) * 10;
  return `adult in their ${decade}s`;
}

function getLocationPhrase(
  person: PersonRecord,
  location: LocationFilter | undefined,
  fieldSelection: FieldSelectionPlan
): string {
  if (isPromptFieldSelected(fieldSelection, "exact_zip")) {
    return `in ZIP ${location?.type === "zip" ? location.value : person.zcta}`;
  }

  if (!location || location.type === "national") {
    return "in the United States";
  }

  return `in ${location.label}`;
}

function buildWorkSentence(person: PersonRecord): string {
  const occupation = getOccupationLabel(person.occupation_code).toLowerCase();
  const income = person.employment_income + person.self_employment_income;
  const incomeBand = formatIncome(income);
  const isRetired =
    income <= 0 &&
    (person.age >= 65 || person.receives_social_security || person.has_medicare);

  if (person.is_in_college && income > 0) {
    return `They are a college student who also works as ${withArticle(occupation)} and has ${incomeBand}.`;
  }

  if (person.is_in_college) {
    return "They are a college student with no current earned income.";
  }

  if (income > 0) {
    return `They work as ${withArticle(occupation)} and have ${incomeBand}.`;
  }

  if (isRetired) {
    return "They are retired and have no current earned income.";
  }

  return "They are not currently working and have no current earned income.";
}

function buildHousingSentence(person: PersonRecord): string {
  const tenure = TENURE_LABELS[person.tenure_type] ?? "resident";
  const clauses = [
    tenure === "homeowner" ? "own their home" : tenure === "renter" ? "rent their home" : "have an unspecified housing tenure",
  ];

  if (person.children_count > 0) {
    clauses.push(
      person.children_count === 1
        ? "are raising 1 child"
        : `are raising ${person.children_count} children`
    );
  }

  return `They ${joinWithAnd(clauses)}.`;
}

function buildIdentitySentence(
  person: PersonRecord,
  fieldSelection: FieldSelectionPlan
): string | null {
  const parts: string[] = [];

  if (isPromptFieldSelected(fieldSelection, "sex")) {
    parts.push(`are ${person.is_female ? "a woman" : "a man"}`);
  }

  if (isPromptFieldSelected(fieldSelection, "race_ethnicity")) {
    parts.push(`identify as ${getRaceLabel(person.cps_race, person.is_hispanic)}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `They ${joinWithAnd(parts)}.`;
}

function buildConditionalDetails(
  person: PersonRecord,
  fieldSelection: FieldSelectionPlan
): string[] {
  const details: string[] = [];

  if (isPromptFieldSelected(fieldSelection, "disability") && person.is_disabled) {
    details.push("They have a disability.");
  }

  if (isPromptFieldSelected(fieldSelection, "insurance")) {
    const insuranceType = getInsuranceType(person);
    details.push(
      insuranceType === "not enrolled in Medicare or Medicaid"
        ? "They are not enrolled in Medicare or Medicaid."
        : `Their health coverage includes ${insuranceType}.`
    );
  }

  if (isPromptFieldSelected(fieldSelection, "benefits")) {
    const benefits = getBenefitsList(person);
    if (benefits.length > 0) {
      details.push(`They receive ${joinWithAnd(benefits)}.`);
    }
  }

  return details;
}

export function createPersonDescriptionFormatter(
  options: PersonDescriptionOptions = {}
): (person: PersonRecord) => string {
  const resolvedOptions = resolvePersonDescriptionOptions(options);
  return (person: PersonRecord) =>
    formatPersonDescription(person, resolvedOptions);
}

export function formatPersonDescription(
  person: PersonRecord,
  options: PersonDescriptionOptions = {}
): string {
  const resolvedOptions =
    "fieldSelection" in options
      ? (options as ResolvedPersonDescriptionOptions)
      : resolvePersonDescriptionOptions(options);
  const { fieldSelection } = resolvedOptions;
  const opening = `${toSentenceCase(withArticle(getAgeBand(person.age)))} living ${getLocationPhrase(
    person,
    resolvedOptions.location,
    fieldSelection
  )}.`;
  const sentences = [
    opening,
    buildWorkSentence(person),
    buildHousingSentence(person),
  ];
  const identitySentence = buildIdentitySentence(person, fieldSelection);

  if (identitySentence) {
    sentences.push(identitySentence);
  }

  sentences.push(...buildConditionalDetails(person, fieldSelection));

  return sentences.join(" ");
}

export function formatSexLabel(isFemale: boolean): string {
  return isFemale ? "Female" : "Male";
}

export function formatTenureLabel(tenureType: number): string {
  return TENURE_LABELS[tenureType] ?? "Unknown";
}
