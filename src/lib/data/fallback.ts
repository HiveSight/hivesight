/**
 * Synthetic fallback persona generation.
 * Used when real CPS microdata from HuggingFace is unavailable.
 */
import type { LocationFilter, PersonRecord } from "@/types";

// Approximate CPS race distribution (simplified)
const RACE_WEIGHTS = [
  { race: 1, weight: 0.60 }, // White
  { race: 2, weight: 0.13 }, // Black
  { race: 4, weight: 0.06 }, // Asian
  { race: 6, weight: 0.03 }, // Other/multiracial
];

// Income distribution (log-normal approximation)
function sampleIncome(): number {
  // Box-Muller for normal, then exponentiate
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Mean ~$50k, with realistic spread
  return Math.max(0, Math.round(Math.exp(10.5 + z * 0.9)));
}

function sampleAge(): number {
  // Weighted toward working age
  const r = Math.random();
  if (r < 0.15) return Math.floor(Math.random() * 7) + 18; // 18-24
  if (r < 0.55) return Math.floor(Math.random() * 15) + 25; // 25-39
  if (r < 0.80) return Math.floor(Math.random() * 15) + 40; // 40-54
  if (r < 0.95) return Math.floor(Math.random() * 11) + 55; // 55-65
  return Math.floor(Math.random() * 20) + 66; // 66-85
}

function weightedChoice<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

export function generateSyntheticPersons(
  count: number,
  location: LocationFilter
): PersonRecord[] {
  const persons: PersonRecord[] = [];

  for (let i = 0; i < count; i++) {
    const age = sampleAge();
    const income = sampleIncome();
    const isHispanic = Math.random() < 0.19;
    const race = weightedChoice(
      RACE_WEIGHTS.map((r) => ({ value: r.race, weight: r.weight }))
    );

    persons.push({
      age,
      is_female: Math.random() < 0.51,
      cps_race: race,
      is_hispanic: isHispanic,
      employment_income: income,
      self_employment_income: Math.random() < 0.1 ? sampleIncome() * 0.3 : 0,
      occupation_code: Math.floor(Math.random() * 9000) + 1000,
      tenure_type: Math.random() < 0.65 ? 1 : 2, // 65% owner
      children_count: Math.random() < 0.4 ? Math.floor(Math.random() * 3) + 1 : 0,
      is_in_college: age >= 18 && age <= 24 && Math.random() < 0.4,
      is_disabled: Math.random() < 0.13,
      has_medicaid: Math.random() < 0.2,
      has_medicare: age >= 65 || Math.random() < 0.02,
      receives_ssi: Math.random() < 0.05,
      receives_snap: Math.random() < 0.12,
      receives_tanf: Math.random() < 0.02,
      receives_unemployment: Math.random() < 0.02,
      receives_social_security: age >= 62 ? Math.random() < 0.8 : Math.random() < 0.05,
      zcta:
        location.type === "zip"
          ? location.value
          : String(Math.floor(Math.random() * 90000) + 10000),
      weight: 1,
    });
  }

  return persons;
}
