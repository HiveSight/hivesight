import type {
  AudienceBenefitsStatus,
  AudienceDisabilityStatus,
  AudienceFilters,
  AudienceHousingTenure,
  AudienceInsurance,
  AudienceRaceEthnicity,
  AudienceSex,
  AudienceStudentStatus,
  PersonRecord,
} from "@/types";
import { getOccupationLabel } from "./occupation-codes";

export class AudienceFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudienceFilterError";
  }
}

const SEX_LABELS: Record<AudienceSex, string> = {
  female: "Female",
  male: "Male",
};

const RACE_ETHNICITY_LABELS: Record<AudienceRaceEthnicity, string> = {
  white: "White",
  black: "Black",
  hispanic: "Hispanic/Latino",
  asian: "Asian",
  native: "American Indian/Alaskan Native",
  pacific: "Hawaiian/Pacific Islander",
  multiracial: "Multiracial",
  other: "Other race/ethnicity",
};

const HOUSING_TENURE_LABELS: Record<AudienceHousingTenure, string> = {
  owner: "Homeowners",
  renter: "Renters",
  other: "Other housing tenure",
};

const STUDENT_STATUS_LABELS: Record<AudienceStudentStatus, string> = {
  student: "College students",
  not_student: "Not college students",
};

const DISABILITY_STATUS_LABELS: Record<AudienceDisabilityStatus, string> = {
  disabled: "People with disabilities",
  not_disabled: "People without disabilities",
};

const BENEFITS_STATUS_LABELS: Record<AudienceBenefitsStatus, string> = {
  receives_benefits: "Receives public benefits",
  no_benefits: "No public benefits recorded",
};

const INSURANCE_LABELS: Record<AudienceInsurance, string> = {
  medicare: "Medicare",
  medicaid: "Medicaid",
  dual_medicare_medicaid: "Medicare and Medicaid",
  neither: "Neither Medicare nor Medicaid",
};

export function hasActiveAudienceFilters(
  filters: AudienceFilters | null | undefined
): filters is AudienceFilters {
  if (!filters) return false;
  return Object.values(filters).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== "";
  });
}

export function getAudienceFilterSummary(filters: AudienceFilters): string[] {
  const summary: string[] = [];

  if (filters.ageRange) {
    summary.push(`Ages ${filters.ageRange[0]}-${filters.ageRange[1]}`);
  }

  if (filters.incomeRange) {
    summary.push(
      `Earned income $${filters.incomeRange[0].toLocaleString()}-$${filters.incomeRange[1].toLocaleString()}`
    );
  }

  if (filters.sex) {
    summary.push(SEX_LABELS[filters.sex]);
  }

  if (filters.raceEthnicity?.length) {
    summary.push(
      filters.raceEthnicity.map((item) => RACE_ETHNICITY_LABELS[item]).join(" or ")
    );
  }

  if (filters.housingTenure?.length) {
    summary.push(
      filters.housingTenure.map((item) => HOUSING_TENURE_LABELS[item]).join(" or ")
    );
  }

  if (filters.hasChildren !== undefined) {
    summary.push(filters.hasChildren ? "Has children" : "No children");
  }

  if (filters.childrenCountRange) {
    summary.push(
      `${filters.childrenCountRange[0]}-${filters.childrenCountRange[1]} children`
    );
  }

  if (filters.studentStatus) {
    summary.push(STUDENT_STATUS_LABELS[filters.studentStatus]);
  }

  if (filters.disabilityStatus) {
    summary.push(DISABILITY_STATUS_LABELS[filters.disabilityStatus]);
  }

  if (filters.benefitsStatus) {
    summary.push(BENEFITS_STATUS_LABELS[filters.benefitsStatus]);
  }

  if (filters.insurance?.length) {
    summary.push(
      filters.insurance.map((item) => INSURANCE_LABELS[item]).join(" or ")
    );
  }

  if (filters.occupationQuery) {
    summary.push(`Occupation contains "${filters.occupationQuery}"`);
  }

  if (filters.occupationCodes?.length) {
    summary.push(`Occupation codes: ${filters.occupationCodes.join(", ")}`);
  }

  return summary;
}

export function getPersonRaceEthnicityCategory(
  person: PersonRecord
): AudienceRaceEthnicity {
  if (person.is_hispanic) return "hispanic";

  if (person.cps_race === 1) return "white";
  if (person.cps_race === 2) return "black";
  if (person.cps_race === 3) return "native";
  if (person.cps_race === 4) return "asian";
  if (person.cps_race === 5) return "pacific";
  if (person.cps_race >= 6 && person.cps_race <= 24) return "multiracial";
  return "other";
}

function getPersonHousingTenure(person: PersonRecord): AudienceHousingTenure {
  if (person.tenure_type === 1) return "owner";
  if (person.tenure_type === 2) return "renter";
  return "other";
}

function receivesAnyBenefit(person: PersonRecord): boolean {
  return (
    person.receives_snap ||
    person.receives_ssi ||
    person.receives_tanf ||
    person.receives_unemployment ||
    person.receives_social_security
  );
}

function matchesInsurance(person: PersonRecord, insurance: AudienceInsurance) {
  switch (insurance) {
    case "medicare":
      return person.has_medicare;
    case "medicaid":
      return person.has_medicaid;
    case "dual_medicare_medicaid":
      return person.has_medicare && person.has_medicaid;
    case "neither":
      return !person.has_medicare && !person.has_medicaid;
  }
}

export function personMatchesAudienceFilters(
  person: PersonRecord,
  filters: AudienceFilters
): boolean {
  const income = Math.round(person.employment_income + person.self_employment_income);

  if (filters.ageRange) {
    const [min, max] = filters.ageRange;
    if (person.age < min || person.age > max) return false;
  }

  if (filters.incomeRange) {
    const [min, max] = filters.incomeRange;
    if (income < min || income > max) return false;
  }

  if (filters.sex) {
    if (filters.sex === "female" && !person.is_female) return false;
    if (filters.sex === "male" && person.is_female) return false;
  }

  if (filters.raceEthnicity?.length) {
    if (!filters.raceEthnicity.includes(getPersonRaceEthnicityCategory(person))) {
      return false;
    }
  }

  if (filters.housingTenure?.length) {
    if (!filters.housingTenure.includes(getPersonHousingTenure(person))) {
      return false;
    }
  }

  if (filters.hasChildren !== undefined) {
    if ((person.children_count > 0) !== filters.hasChildren) return false;
  }

  if (filters.childrenCountRange) {
    const [min, max] = filters.childrenCountRange;
    if (person.children_count < min || person.children_count > max) return false;
  }

  if (filters.studentStatus) {
    if (filters.studentStatus === "student" && !person.is_in_college) return false;
    if (filters.studentStatus === "not_student" && person.is_in_college) return false;
  }

  if (filters.disabilityStatus) {
    if (filters.disabilityStatus === "disabled" && !person.is_disabled) return false;
    if (filters.disabilityStatus === "not_disabled" && person.is_disabled) {
      return false;
    }
  }

  if (filters.benefitsStatus) {
    const receivesBenefits = receivesAnyBenefit(person);
    if (filters.benefitsStatus === "receives_benefits" && !receivesBenefits) {
      return false;
    }
    if (filters.benefitsStatus === "no_benefits" && receivesBenefits) return false;
  }

  if (filters.insurance?.length) {
    if (!filters.insurance.some((item) => matchesInsurance(person, item))) {
      return false;
    }
  }

  if (filters.occupationQuery) {
    const occupation = getOccupationLabel(person.occupation_code).toLowerCase();
    if (!occupation.includes(filters.occupationQuery.toLowerCase())) return false;
  }

  if (filters.occupationCodes?.length) {
    if (!filters.occupationCodes.includes(person.occupation_code)) return false;
  }

  return true;
}

export function filterPersonsForAudience(
  persons: PersonRecord[],
  filters: AudienceFilters | null | undefined
): PersonRecord[] {
  if (!hasActiveAudienceFilters(filters)) {
    return persons;
  }

  return persons.filter((person) => personMatchesAudienceFilters(person, filters));
}

export function calculatePersonWeight(persons: PersonRecord[]): number {
  return persons.reduce((total, person) => total + Math.max(person.weight, 0), 0);
}
