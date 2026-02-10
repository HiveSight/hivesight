// CPS race codes (cps_race variable) -> human-readable string
// Based on Census Bureau Current Population Survey race recode

export const CPS_RACE_MAP: Record<number, string> = {
  1: "White",
  2: "Black",
  3: "American Indian/Alaskan Native",
  4: "Asian",
  5: "Hawaiian/Pacific Islander",
  6: "White-Black",
  7: "White-American Indian",
  8: "White-Asian",
  9: "White-Hawaiian/Pacific Islander",
  10: "Black-American Indian",
  11: "Black-Asian",
  12: "Black-Hawaiian/Pacific Islander",
  13: "American Indian-Asian",
  14: "American Indian-Hawaiian/Pacific Islander",
  15: "Asian-Hawaiian/Pacific Islander",
  16: "White-Black-American Indian",
  17: "White-Black-Asian",
  18: "White-Black-Hawaiian/Pacific Islander",
  19: "White-American Indian-Asian",
  20: "White-American Indian-Hawaiian/Pacific Islander",
  21: "White-Asian-Hawaiian/Pacific Islander",
  22: "Black-American Indian-Asian",
  23: "White-Black-American Indian-Asian",
  24: "White-American Indian-Asian-Hawaiian/Pacific Islander",
  25: "Other (3+ races)",
  26: "Other (4+ races)",
};

export function getRaceLabel(cpsRace: number, isHispanic: boolean): string {
  const race = CPS_RACE_MAP[cpsRace] ?? "Unknown";
  if (isHispanic) {
    return `Hispanic/Latino (${race})`;
  }
  return race;
}
