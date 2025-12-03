// Sample demographic data based on US Census
// In production, this would come from PolicyEngine's calibrated survey data

import type { DemographicFilters } from "@/types";

export interface Persona {
  id: string;
  age: number;
  income: number;
  state: string;
  weight: number;
}

// US States
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
];

// Age distribution weights (approximate US adult population)
const AGE_WEIGHTS = [
  { min: 18, max: 24, weight: 0.10 },
  { min: 25, max: 34, weight: 0.17 },
  { min: 35, max: 44, weight: 0.16 },
  { min: 45, max: 54, weight: 0.16 },
  { min: 55, max: 64, weight: 0.17 },
  { min: 65, max: 74, weight: 0.14 },
  { min: 75, max: 100, weight: 0.10 },
];

// Income distribution (approximate US household income)
const INCOME_WEIGHTS = [
  { min: 0, max: 25000, weight: 0.18 },
  { min: 25000, max: 50000, weight: 0.20 },
  { min: 50000, max: 75000, weight: 0.17 },
  { min: 75000, max: 100000, weight: 0.13 },
  { min: 100000, max: 150000, weight: 0.15 },
  { min: 150000, max: 200000, weight: 0.08 },
  { min: 200000, max: 500000, weight: 0.09 },
];

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedRandomSelect<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }

  return items[items.length - 1];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function generatePersonas(
  count: number,
  filters: DemographicFilters
): Persona[] {
  const personas: Persona[] = [];
  const [minAge, maxAge] = filters.ageRange;
  const [minIncome, maxIncome] = filters.incomeRange;
  const allowedStates = filters.states?.length ? filters.states : US_STATES;

  // Filter age weights based on range
  const filteredAgeWeights = AGE_WEIGHTS.filter(
    (w) => w.max >= minAge && w.min <= maxAge
  ).map((w) => ({
    ...w,
    min: Math.max(w.min, minAge),
    max: Math.min(w.max, maxAge),
  }));

  // Filter income weights based on range
  const filteredIncomeWeights = INCOME_WEIGHTS.filter(
    (w) => w.max >= minIncome && w.min <= maxIncome
  ).map((w) => ({
    ...w,
    min: Math.max(w.min, minIncome),
    max: Math.min(w.max, maxIncome),
  }));

  for (let i = 0; i < count; i++) {
    const ageRange = weightedRandomSelect(filteredAgeWeights);
    const incomeRange = weightedRandomSelect(filteredIncomeWeights);
    const state = allowedStates[Math.floor(Math.random() * allowedStates.length)];

    personas.push({
      id: generateId(),
      age: randomInRange(ageRange.min, ageRange.max),
      income: randomInRange(incomeRange.min, incomeRange.max),
      state,
      weight: 1,
    });
  }

  return personas;
}

export function formatPersonaDescription(persona: Persona): string {
  const incomeFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(persona.income);

  return `A ${persona.age}-year-old American living in ${persona.state} with an annual household income of ${incomeFormatted}.`;
}
