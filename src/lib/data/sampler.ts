import type { PersonRecord } from "@/types";

export type RandomSource = () => number;

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Probability-proportional-to-weight sampling without replacement.
 * Uses systematic PPS sampling for stable, representative draws.
 */
export function samplePersons(
  persons: PersonRecord[],
  count: number,
  random: RandomSource = Math.random
): PersonRecord[] {
  if (persons.length === 0) return [];
  if (count >= persons.length) return [...persons];

  const totalWeight = persons.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight <= 0) {
    // Fallback to uniform random if weights are zero
    return uniformSample(persons, count, random);
  }

  // Systematic PPS sampling
  const interval = totalWeight / count;
  const start = random() * interval;
  const selected: PersonRecord[] = [];
  let cumWeight = 0;
  let nextThreshold = start;
  let idx = 0;

  while (selected.length < count && idx < persons.length) {
    cumWeight += persons[idx].weight;
    while (nextThreshold < cumWeight && selected.length < count) {
      selected.push(persons[idx]);
      nextThreshold += interval;
    }
    idx++;
  }

  // If systematic sampling didn't fill (rounding), fill remaining randomly
  while (selected.length < count) {
    selected.push(persons[Math.floor(random() * persons.length)]);
  }

  return selected;
}

/**
 * Sample across multiple districts proportionally (for multi-district ZIPs).
 * Each entry has a district's persons and its population share for the location.
 */
export function sampleAcrossDistricts(
  districtData: Array<{ persons: PersonRecord[]; share: number }>,
  totalCount: number,
  random: RandomSource = Math.random
): PersonRecord[] {
  const allSampled: PersonRecord[] = [];

  for (const { persons, share } of districtData) {
    const districtCount = Math.max(1, Math.round(totalCount * share));
    const sampled = samplePersons(persons, districtCount, random);
    allSampled.push(...sampled);
  }

  // Trim to exact count if we oversampled due to rounding
  if (allSampled.length > totalCount) {
    return allSampled.slice(0, totalCount);
  }

  // Fill if we undersampled
  while (allSampled.length < totalCount) {
    const randomDistrict =
      districtData[Math.floor(random() * districtData.length)];
    const randomPerson =
      randomDistrict.persons[
        Math.floor(random() * randomDistrict.persons.length)
      ];
    allSampled.push(randomPerson);
  }

  return allSampled;
}

function uniformSample<T>(
  items: T[],
  count: number,
  random: RandomSource = Math.random
): T[] {
  const shuffled = [...items].sort(() => random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Filter persons to those in a specific ZCTA (for ZIP-level precision).
 */
export function filterByZcta(
  persons: PersonRecord[],
  zcta: string
): PersonRecord[] {
  return persons.filter((p) => p.zcta === zcta);
}
