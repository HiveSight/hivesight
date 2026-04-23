"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import type { Model, ResponseType, LocationFilter } from "@/types";
import type { ProgressState } from "@/lib/survey-stream";
import { readSurveyStream } from "@/lib/survey-stream";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

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

  // Calculate respondents from credits
  const config = MODEL_CONFIG[model];
  const respondentsPerCredit =
    responseType === "likert"
      ? config.respondentsPerCreditLikert
      : config.respondentsPerCreditOpenEnded;
  const hiveSize = credits * respondentsPerCredit;

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
              className="w-full min-h-28 p-4 border border-amber-900/10 rounded-xl resize-none bg-white/80 text-base leading-relaxed placeholder:text-muted-foreground/50 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-300 transition-all duration-200 dark:bg-amber-950/20 dark:border-amber-100/10 dark:focus:ring-amber-500/30 dark:focus:border-amber-700"
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
