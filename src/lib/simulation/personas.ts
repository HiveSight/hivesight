// Legacy personas module - kept for backward compatibility
// New surveys use real CPS microdata via src/lib/data/

export interface Persona {
  id: string;
  age: number;
  income: number;
  state: string;
  weight: number;
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
