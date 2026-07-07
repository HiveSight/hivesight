import type { Cell, GeographyRef, ResponseFormat, SampleRecord } from "./types";
import { optionIds } from "./types";

export const PROMPT_VERSION = "prompts:v3-expert-cell";

/**
 * Expert-predictor framing (not persona roleplay): the model estimates a
 * group's response distribution. Backed by direct-distribution results
 * (Gong et al. 2026; Meister et al. 2024) and our SHED benchmark.
 */
export const CELL_SYSTEM_PROMPT = `You are an expert survey methodologist estimating how specific groups of US adults respond to survey questions. Ground your estimates in empirical survey research, government statistics, and economic data about the group described — not stereotypes. Account for within-group diversity: distributions are rarely extreme. Reply with JSON only.`;

export function describeCell(cell: Cell, geography: GeographyRef): string {
  const parts = [`aged ${cell.age}`, cell.sex];
  parts.push(
    cell.income === "$0 earned"
      ? "with no wage or self-employment income this year"
      : `with personal earned income of ${cell.income} per year`
  );
  if (cell.detailed) {
    parts.push(cell.tenure!, cell.children!, cell.benefits!);
    if (cell.social_security) parts.push(cell.social_security);
  }
  const where =
    geography.type === "national"
      ? "US adults"
      : `Adults in ${geography.label}`;
  return `${where} who are ${parts.join(", ")}.`;
}

function formatBlock(format: ResponseFormat): { optionsText: string; jsonShape: string } {
  if (format.kind === "likert5") {
    return {
      optionsText:
        "Response options: strongly disagree, disagree, neither agree nor disagree, agree, strongly agree.",
      jsonShape: `{"strongly_disagree": n, "disagree": n, "neither": n, "agree": n, "strongly_agree": n}`,
    };
  }
  if (format.kind === "binary") {
    return {
      optionsText: "Response options: yes, no.",
      jsonShape: `{"yes": n, "no": n}`,
    };
  }
  const ids = optionIds(format);
  return {
    optionsText:
      "Response options:\n" +
      format.options.map((o, i) => `${ids[i]}: ${o}`).join("\n"),
    jsonShape: `{${ids.map((id) => `"${id}": n`).join(", ")}}`,
  };
}

export function cellUserPrompt(
  cell: Cell,
  geography: GeographyRef,
  question: string,
  format: ResponseFormat
): string {
  const { optionsText, jsonShape } = formatBlock(format);
  const stem =
    format.kind === "likert5"
      ? `Survey statement: "${question}"\nEstimate the percentage of the group below choosing each response option.`
      : `Survey question: "${question}"\nEstimate the percentage of the group below choosing each response option.`;
  return `${stem}

Group: ${describeCell(cell, geography)}

${optionsText}

Reply with JSON only, integer percentages summing to 100:
${jsonShape}`;
}

export function describeSample(p: SampleRecord, geography: GeographyRef): string {
  const earned = Math.round(p.employment_income + p.self_employment_income);
  const where = geography.type === "national" ? "the United States" : geography.label;
  const parts = [
    `A ${p.age}-year-old ${p.is_female ? "woman" : "man"} living in ${where}`,
    earned > 0
      ? `earning about $${earned.toLocaleString()} per year`
      : "with no wage or self-employment income this year",
    p.tenure_type === 1 ? "who owns their home" : "who rents",
  ];
  if (p.children_count > 0)
    parts.push(`with ${p.children_count} child${p.children_count > 1 ? "ren" : ""} at home`);
  const benefits = [];
  if (p.receives_snap) benefits.push("SNAP");
  if (p.receives_ssi) benefits.push("SSI");
  if (p.receives_social_security) benefits.push("Social Security");
  if (p.receives_unemployment) benefits.push("unemployment insurance");
  if (benefits.length) parts.push(`receiving ${benefits.join(", ")}`);
  if (p.is_in_college) parts.push("currently in college");
  if (p.is_disabled) parts.push("living with a disability");
  return parts.join(", ") + ".";
}

/**
 * Verbatims are illustrative color, not the estimator. The prompt asks for a
 * plausible individual voice consistent with the group's known distribution.
 */
export const VERBATIM_SYSTEM_PROMPT = `You write short, realistic survey verbatims: the kind of one-or-two-sentence open-ended answer a real survey respondent types. Plain, specific, first-person, no marketing tone. Reply with JSON only.`;

export function verbatimUserPrompt(
  personaDescription: string,
  question: string,
  format: ResponseFormat
): string {
  const ids = optionIds(format);
  return `Respondent profile: ${personaDescription}

Survey question: "${question}"

Write the answer this respondent plausibly gives. Reply with JSON only:
{"choice": <one of ${JSON.stringify(ids)}>, "text": "<their one-or-two-sentence explanation, in their own voice>"}`;
}
