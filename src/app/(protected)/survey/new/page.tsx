"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { MODEL_CONFIG } from "@/types";
import { LocationInput } from "@/components/survey/location-input";
import type {
  AudienceBenefitsStatus,
  AudienceDisabilityStatus,
  AudienceFilters,
  AudienceHousingTenure,
  AudienceInsurance,
  AudienceRaceEthnicity,
  AudienceSex,
  AudienceStudentStatus,
  Model,
  ResponseType,
  LocationFilter,
} from "@/types";
import type { ProgressState } from "@/lib/survey-stream";
import { readSurveyStream } from "@/lib/survey-stream";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

interface AudienceFilterState {
  ageMin: string;
  ageMax: string;
  incomeMin: string;
  incomeMax: string;
  sex: AudienceSex | "any";
  raceEthnicity: AudienceRaceEthnicity | "any";
  housingTenure: AudienceHousingTenure | "any";
  hasChildren: "any" | "yes" | "no";
  studentStatus: AudienceStudentStatus | "any";
  disabilityStatus: AudienceDisabilityStatus | "any";
  benefitsStatus: AudienceBenefitsStatus | "any";
  insurance: AudienceInsurance | "any";
  occupationQuery: string;
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAudienceFilters(state: AudienceFilterState): AudienceFilters {
  const filters: AudienceFilters = {};
  const minAge = parseOptionalNumber(state.ageMin);
  const maxAge = parseOptionalNumber(state.ageMax);
  const minIncome = parseOptionalNumber(state.incomeMin);
  const maxIncome = parseOptionalNumber(state.incomeMax);

  if (minAge !== null || maxAge !== null) {
    const lower = Math.max(18, Math.round(minAge ?? 18));
    const upper = Math.min(100, Math.round(maxAge ?? 100));
    filters.ageRange = [Math.min(lower, upper), Math.max(lower, upper)];
  }

  if (minIncome !== null || maxIncome !== null) {
    const lower = Math.max(0, Math.round(minIncome ?? 0));
    const upper = Math.max(0, Math.round(maxIncome ?? 5_000_000));
    filters.incomeRange = [Math.min(lower, upper), Math.max(lower, upper)];
  }

  if (state.sex !== "any") filters.sex = state.sex;
  if (state.raceEthnicity !== "any") filters.raceEthnicity = [state.raceEthnicity];
  if (state.housingTenure !== "any") filters.housingTenure = [state.housingTenure];
  if (state.hasChildren !== "any") filters.hasChildren = state.hasChildren === "yes";
  if (state.studentStatus !== "any") filters.studentStatus = state.studentStatus;
  if (state.disabilityStatus !== "any") {
    filters.disabilityStatus = state.disabilityStatus;
  }
  if (state.benefitsStatus !== "any") filters.benefitsStatus = state.benefitsStatus;
  if (state.insurance !== "any") filters.insurance = [state.insurance];
  if (state.occupationQuery.trim()) {
    filters.occupationQuery = state.occupationQuery.trim();
  }

  return filters;
}

export default function NewSurveyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressState, setProgressState] = useState<ProgressState | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state
  const [question, setQuestion] = useState("");
  const [responseType, setResponseType] = useState<ResponseType>("likert");
  const [location, setLocation] = useState<LocationFilter | null>(null);
  const [model, setModel] = useState<Model>("gpt-5-mini");
  const [credits, setCredits] = useState(25);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [incomeMin, setIncomeMin] = useState("");
  const [incomeMax, setIncomeMax] = useState("");
  const [sex, setSex] = useState<AudienceSex | "any">("any");
  const [raceEthnicity, setRaceEthnicity] = useState<
    AudienceRaceEthnicity | "any"
  >("any");
  const [housingTenure, setHousingTenure] = useState<
    AudienceHousingTenure | "any"
  >("any");
  const [hasChildren, setHasChildren] = useState<"any" | "yes" | "no">("any");
  const [studentStatus, setStudentStatus] = useState<
    AudienceStudentStatus | "any"
  >("any");
  const [disabilityStatus, setDisabilityStatus] = useState<
    AudienceDisabilityStatus | "any"
  >("any");
  const [benefitsStatus, setBenefitsStatus] = useState<
    AudienceBenefitsStatus | "any"
  >("any");
  const [insurance, setInsurance] = useState<AudienceInsurance | "any">("any");
  const [occupationQuery, setOccupationQuery] = useState("");

  // Calculate respondents from credits
  const config = MODEL_CONFIG[model];
  const respondentsPerCredit =
    responseType === "likert"
      ? config.respondentsPerCreditLikert
      : config.respondentsPerCreditOpenEnded;
  const hiveSize = credits * respondentsPerCredit;
  const audienceFilters = buildAudienceFilters({
    ageMin,
    ageMax,
    incomeMin,
    incomeMax,
    sex,
    raceEthnicity,
    housingTenure,
    hasChildren,
    studentStatus,
    disabilityStatus,
    benefitsStatus,
    insurance,
    occupationQuery,
  });
  const audienceFilterCount = Object.keys(audienceFilters).length;

  const canSubmit = question.length >= 10 && location !== null;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setProgressState({
      stage: "starting",
      message: "Starting survey...",
      progress: 0,
    });

    try {
      const res = await fetch("/api/survey/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          responseType,
          model,
          hiveSize,
          location,
          audienceFilters,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create survey");
      }

      await readSurveyStream(res, {
        onProgress: setProgressState,
        onComplete: (surveyId) => router.push(`/survey/${surveyId}`),
        onError: (message) => { throw new Error(message); },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
      setProgressState(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Progress Modal */}
      {loading && progressState && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4 animate-slide-up animate-glow-pulse">
            <CardHeader>
              <CardTitle className="text-center font-serif">Running survey</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progressState.progress} />
              <p className="text-center text-sm text-muted-foreground">
                {progressState.message}
              </p>
              {progressState.completed !== undefined && progressState.total !== undefined && (
                <p className="text-center text-xs text-muted-foreground/70">
                  {progressState.completed} of {progressState.total} responses
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <h1 className="text-3xl font-bold font-serif">New survey</h1>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 dark:bg-red-900/10 dark:text-red-400 dark:border-red-800/30">{error}</div>
      )}

      {/* Main form */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Question */}
          <div className="space-y-2">
            <Label htmlFor="question">Your question or statement</Label>
            <textarea
              id="question"
              className="w-full min-h-28 p-4 border border-[var(--color-border-strong)] rounded-xl resize-none bg-white/80 text-base leading-relaxed placeholder:text-muted-foreground/50 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-300 transition-all duration-200 dark:bg-amber-950/20 dark:border-[var(--color-border-strong)] dark:focus:ring-amber-500/30 dark:focus:border-amber-700"
              placeholder="e.g., I support increasing the minimum wage to $15/hour"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <p className="text-sm text-muted-foreground/70">
              {question.length < 10
                ? `${10 - question.length} more characters needed`
                : "Ready"}
            </p>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="survey-location">Location</Label>
            <LocationInput
              id="survey-location"
              value={location}
              onSelect={setLocation}
              disabled={loading}
            />
            <p className="text-sm text-muted-foreground/70">
              Search by ZIP code, state abbreviation, district like NY-17, or US. HiveSight will
              run over the calibrated population for that geography.
            </p>
          </div>

          {/* Response type */}
          <div className="space-y-2">
            <Label>Response type</Label>
            <Tabs
              value={responseType}
              onValueChange={(v) => setResponseType(v as ResponseType)}
            >
              <TabsList className="w-full">
                <TabsTrigger value="likert" className="flex-1">
                  Likert scale
                </TabsTrigger>
                <TabsTrigger value="open_ended" className="flex-1">
                  Open-ended
                </TabsTrigger>
              </TabsList>
              <TabsContent value="likert" className="text-sm text-muted-foreground">
                Respondents will agree/disagree on a 5-point scale
              </TabsContent>
              <TabsContent value="open_ended" className="text-sm text-muted-foreground">
                Respondents will provide free-text answers
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Advanced options (collapsible) */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 w-full transition-colors duration-200"
      >
        {showAdvanced ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        Advanced options
      </button>

      {showAdvanced && (
        <Card className="animate-slide-down">
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-2">
              <Label>AI model</Label>
              <Select value={model} onValueChange={(v) => setModel(v as Model)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-5-mini">
                    GPT-5 Mini (best value)
                  </SelectItem>
                  <SelectItem value="gpt-5.2">
                    GPT-5.2 (highest quality)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {MODEL_CONFIG[model].name}: {respondentsPerCredit}{" "}
                {responseType === "likert" ? "likert" : "open-ended"} respondents
                per credit
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-amber-900/10 bg-amber-50/35 p-4 dark:border-amber-100/10 dark:bg-amber-950/10">
              <div>
                <Label>Audience filters</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional microdata filters for segment research inside the selected geography.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="age-min">Age range</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="age-min"
                      type="number"
                      min={18}
                      max={100}
                      inputMode="numeric"
                      placeholder="Min"
                      value={ageMin}
                      onChange={(e) => setAgeMin(e.target.value)}
                    />
                    <Input
                      type="number"
                      min={18}
                      max={100}
                      inputMode="numeric"
                      placeholder="Max"
                      value={ageMax}
                      onChange={(e) => setAgeMax(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="income-min">Earned income</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="income-min"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="Min"
                      value={incomeMin}
                      onChange={(e) => setIncomeMin(e.target.value)}
                    />
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="Max"
                      value={incomeMax}
                      onChange={(e) => setIncomeMax(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Sex</Label>
                  <Select
                    value={sex}
                    onValueChange={(value) => setSex(value as AudienceSex | "any")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Race/ethnicity</Label>
                  <Select
                    value={raceEthnicity}
                    onValueChange={(value) =>
                      setRaceEthnicity(value as AudienceRaceEthnicity | "any")
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="white">White</SelectItem>
                      <SelectItem value="black">Black</SelectItem>
                      <SelectItem value="hispanic">Hispanic/Latino</SelectItem>
                      <SelectItem value="asian">Asian</SelectItem>
                      <SelectItem value="native">American Indian/Alaskan Native</SelectItem>
                      <SelectItem value="pacific">Hawaiian/Pacific Islander</SelectItem>
                      <SelectItem value="multiracial">Multiracial</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Housing tenure</Label>
                  <Select
                    value={housingTenure}
                    onValueChange={(value) =>
                      setHousingTenure(value as AudienceHousingTenure | "any")
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="renter">Renter</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Children</Label>
                  <Select value={hasChildren} onValueChange={(value) => setHasChildren(value as "any" | "yes" | "no")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="yes">Has children</SelectItem>
                      <SelectItem value="no">No children</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>College status</Label>
                  <Select
                    value={studentStatus}
                    onValueChange={(value) =>
                      setStudentStatus(value as AudienceStudentStatus | "any")
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="not_student">Not a student</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Disability</Label>
                  <Select
                    value={disabilityStatus}
                    onValueChange={(value) =>
                      setDisabilityStatus(value as AudienceDisabilityStatus | "any")
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                      <SelectItem value="not_disabled">Not disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Benefits</Label>
                  <Select
                    value={benefitsStatus}
                    onValueChange={(value) =>
                      setBenefitsStatus(value as AudienceBenefitsStatus | "any")
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="receives_benefits">Receives benefits</SelectItem>
                      <SelectItem value="no_benefits">No benefits recorded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Public coverage</Label>
                  <Select
                    value={insurance}
                    onValueChange={(value) =>
                      setInsurance(value as AudienceInsurance | "any")
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="medicare">Medicare</SelectItem>
                      <SelectItem value="medicaid">Medicaid</SelectItem>
                      <SelectItem value="dual_medicare_medicaid">Medicare and Medicaid</SelectItem>
                      <SelectItem value="neither">Neither Medicare nor Medicaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="occupation-query">Occupation contains</Label>
                  <Input
                    id="occupation-query"
                    placeholder="software, nurse, teacher, driver"
                    value={occupationQuery}
                    onChange={(e) => setOccupationQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {audienceFilterCount === 0
                    ? "No segment filters applied"
                    : `${audienceFilterCount} segment filter${audienceFilterCount === 1 ? "" : "s"} applied`}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAgeMin("");
                    setAgeMax("");
                    setIncomeMin("");
                    setIncomeMax("");
                    setSex("any");
                    setRaceEthnicity("any");
                    setHousingTenure("any");
                    setHasChildren("any");
                    setStudentStatus("any");
                    setDisabilityStatus("any");
                    setBenefitsStatus("any");
                    setInsurance("any");
                    setOccupationQuery("");
                  }}
                >
                  Reset filters
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Credits to spend: {credits}</Label>
              <div className="px-2">
                <Slider
                  value={[credits]}
                  onValueChange={(v) => setCredits(v[0])}
                  min={1}
                  max={100}
                  step={1}
                />
              </div>
              <div className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl border border-amber-200/50 dark:from-amber-900/10 dark:to-amber-800/10 dark:border-amber-700/20">
                <p className="text-2xl font-bold font-serif text-amber-700 dark:text-amber-400">
                  {hiveSize} respondents
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  for {credits} credits (${(credits * 0.10).toFixed(2)})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary and submit */}
      <div className="flex items-center justify-between py-2">
        <div className="text-sm text-muted-foreground">
          {location ? (
            <>
              {hiveSize} respondents in {location.label} &middot; {credits}{" "}
              credits
            </>
          ) : (
            "Select a location to continue"
          )}
        </div>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="gap-2"
        >
          {loading ? "Running..." : "Run survey"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
