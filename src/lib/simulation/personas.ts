// Legacy personas module - kept for backward compatibility
// New surveys use real CPS microdata via src/lib/data/

import type { DemographicFilters } from "@/types";

export interface Persona {
  id: string;
  age: number;
  income: number;
  state: string;
  weight: number;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

// Deprecated: use loadAndSampleForLocation from src/lib/data/location-resolver.ts instead
export function generatePersonas(
  count: number,
  filters: DemographicFilters
): Persona[] {
  const personas: Persona[] = [];
  const [minAge, maxAge] = filters.ageRange;
  const [minIncome, maxIncome] = filters.incomeRange;
  const states = filters.states?.length ? filters.states : US_STATES;

  for (let i = 0; i < count; i++) {
    personas.push({
      id: `persona-${i}`,
      age: Math.floor(Math.random() * (maxAge - minAge + 1)) + minAge,
      income: Math.floor(Math.random() * (maxIncome - minIncome + 1)) + minIncome,
      state: states[Math.floor(Math.random() * states.length)],
      weight: 1,
    });
  }

  return personas;
}

// Deprecated: use formatPersonDescription from src/lib/data/demographics.ts instead
export function formatPersonaDescription(persona: Persona): string {
  const incomeFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(persona.income);

  return `A ${persona.age}-year-old American living in ${persona.state} with an annual household income of ${incomeFormatted}.`;
}
