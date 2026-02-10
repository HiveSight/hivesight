import type { PersonRecord } from "@/types";
import { getRaceLabel } from "./race-codes";
import { getOccupationLabel } from "./occupation-codes";

const TENURE_LABELS: Record<number, string> = {
  1: "homeowner",
  2: "renter",
};

function getInsuranceType(person: PersonRecord): string {
  if (person.has_medicare && person.has_medicaid) return "Medicare and Medicaid";
  if (person.has_medicare) return "Medicare";
  if (person.has_medicaid) return "Medicaid";
  return "private or uninsured";
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
  if (amount <= 0) return "no employment income";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPersonDescription(person: PersonRecord): string {
  const sex = person.is_female ? "woman" : "man";
  const race = getRaceLabel(person.cps_race, person.is_hispanic);
  const occupation = getOccupationLabel(person.occupation_code);
  const income = person.employment_income + person.self_employment_income;
  const tenure = TENURE_LABELS[person.tenure_type] ?? "resident";
  const insurance = getInsuranceType(person);
  const benefits = getBenefitsList(person);

  // Sentence 1: Age, sex, race/ethnicity
  let desc = `A ${person.age}-year-old ${race} ${sex}`;

  // Sentence 2: Occupation and income
  if (person.is_in_college) {
    desc += ` who is a college student`;
    if (income > 0) {
      desc += ` working as a ${occupation.toLowerCase()} earning ${formatIncome(income)}/year`;
    }
  } else if (person.is_disabled) {
    desc += ` with a disability`;
    if (income > 0) {
      desc += `, working as a ${occupation.toLowerCase()} earning ${formatIncome(income)}/year`;
    }
  } else if (income > 0) {
    desc += ` working as a ${occupation.toLowerCase()} earning ${formatIncome(income)}/year`;
  } else {
    desc += ` who is not currently employed`;
  }
  desc += ".";

  // Sentence 3: Housing and family
  const childrenPart =
    person.children_count > 0
      ? ` with ${person.children_count} ${person.children_count === 1 ? "child" : "children"}`
      : "";
  desc += ` They are a ${tenure}${childrenPart} in ZIP ${person.zcta}.`;

  // Sentence 4: Insurance and benefits
  desc += ` Their health coverage is ${insurance}.`;

  if (benefits.length > 0) {
    desc += ` They receive ${benefits.join(", ")}.`;
  }

  return desc;
}

export function formatSexLabel(isFemale: boolean): string {
  return isFemale ? "Female" : "Male";
}

export function formatTenureLabel(tenureType: number): string {
  return TENURE_LABELS[tenureType] ?? "Unknown";
}
