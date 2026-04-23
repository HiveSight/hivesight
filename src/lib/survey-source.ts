export type SurveyPersonaSource =
  | "microdata"
  | "synthetic_fallback"
  | "legacy_personas";

const SURVEY_SOURCE_META: Record<
  SurveyPersonaSource,
  {
    badgeClass: string;
    description: string;
    label: string;
    shortLabel: string;
  }
> = {
  microdata: {
    badgeClass:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    description:
      "Respondents were simulated from calibrated microdata records assigned to this audience.",
    label: "Calibrated microdata",
    shortLabel: "Microdata",
  },
  synthetic_fallback: {
    badgeClass:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
    description:
      "Calibrated local microdata was unavailable for this run, so HiveSight used synthetic fallback profiles instead.",
    label: "Synthetic fallback",
    shortLabel: "Fallback",
  },
  legacy_personas: {
    badgeClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    description:
      "This survey used the older persona simulator rather than the geography-assigned microdata pipeline.",
    label: "Legacy personas",
    shortLabel: "Legacy",
  },
};

export function getSurveyPersonaSourceMeta(
  source: string | null | undefined
) {
  if (!source) {
    return null;
  }

  return SURVEY_SOURCE_META[source as SurveyPersonaSource] ?? null;
}
