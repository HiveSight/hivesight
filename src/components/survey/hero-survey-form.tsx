"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LocationInput } from "./location-input";
import type { LocationFilter } from "@/types";
import type { ProgressState } from "@/lib/survey-stream";
import { readSurveyStream } from "@/lib/survey-stream";
import { ArrowRight } from "lucide-react";
import { Label } from "@/components/ui/label";

const QUESTION_EXAMPLES = [
  "I support building more housing near transit.",
  "My city should spend more on public transportation.",
  "The federal minimum wage should be raised to $15/hour.",
];

export function HeroSurveyForm() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useState("");
  const [location, setLocation] = useState<LocationFilter | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressState, setProgressState] = useState<ProgressState | null>(
    null
  );
  const questionId = useId();
  const locationId = useId();
  const questionHintId = useId();
  const locationHintId = useId();

  const trimmedQuestion = question.trim();
  const canSubmit = trimmedQuestion.length >= 10 && location !== null;

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (trimmedQuestion.length < 10) {
        setError("Question must be at least 10 characters.");
      } else if (!location) {
        setError("Choose a ZIP code, state, district, or national audience.");
      }
      return;
    }

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
          question: trimmedQuestion,
          responseType: "likert",
          model: "gpt-5-mini",
          hiveSize: 25,
          location,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || data.message || "Failed to create survey");
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

  if (loading && progressState) {
    return (
      <Card className="w-full max-w-xl mx-auto animate-glow-pulse">
        <CardContent className="pt-6 space-y-4">
          <Progress value={progressState.progress} />
          <p className="text-center text-sm text-muted-foreground">
            {progressState.message}
          </p>
          {progressState.completed !== undefined &&
            progressState.total !== undefined && (
              <p className="text-center text-xs text-muted-foreground/70">
                {progressState.completed} of {progressState.total} responses
              </p>
            )}
        </CardContent>
      </Card>
    );
  }

  return (
    <form
      className="mx-auto w-full max-w-2xl space-y-4 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="rounded-[1.85rem] border border-amber-950/10 bg-white/90 p-4 shadow-editorial backdrop-blur-sm dark:border-amber-100/10 dark:bg-amber-950/25">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-amber-900/10 pb-4 dark:border-amber-100/10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
                Research desk
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Fast signal, grounded in calibrated local populations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground/80">
              <span className="rounded-full border border-amber-900/10 px-3 py-1 dark:border-amber-100/10">
                Likert run
              </span>
              <span className="rounded-full border border-amber-900/10 px-3 py-1 dark:border-amber-100/10">
                25 respondents
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor={questionId}
              className="text-xs uppercase tracking-[0.24em] text-amber-700/80 dark:text-amber-300/80"
            >
              Question
            </Label>
            <textarea
              id={questionId}
              ref={textareaRef}
              className="min-h-28 w-full resize-none rounded-2xl border border-amber-900/10 bg-background/80 p-4 text-base leading-relaxed placeholder:text-muted-foreground/50 transition-all duration-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-300 dark:border-amber-100/10 dark:bg-amber-950/20 dark:focus:border-amber-700 dark:focus:ring-amber-500/30"
              placeholder="e.g., I support increasing the minimum wage to $15/hour"
              value={question}
              disabled={loading}
              aria-describedby={questionHintId}
              aria-invalid={trimmedQuestion.length > 0 && trimmedQuestion.length < 10}
              onChange={(e) => {
                setQuestion(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
            <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p id={questionHintId}>
                {trimmedQuestion.length >= 10
                  ? "Ready to run. Press Cmd/Ctrl+Enter to submit."
                  : `${Math.max(10 - trimmedQuestion.length, 0)} more characters needed.`}
              </p>
              <p>{trimmedQuestion.length} characters</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={locationId}
              className="text-xs uppercase tracking-[0.24em] text-amber-700/80 dark:text-amber-300/80"
            >
              Audience location
            </Label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <LocationInput
                  id={locationId}
                  value={location}
                  onSelect={(nextLocation) => {
                    setLocation(nextLocation);
                    setError(null);
                  }}
                  placeholder="ZIP, state, district, or US"
                  disabled={loading}
                  aria-describedby={locationHintId}
                />
              </div>
              <Button
                size="lg"
                type="submit"
                disabled={!canSubmit || loading}
                className="gap-2 px-6 sm:self-start"
              >
                {loading ? "Running..." : "Ask"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
            <p id={locationHintId} className="text-xs text-muted-foreground">
              {location
                ? `Running 25 simulated respondents over the calibrated population in ${location.label}.`
                : "Pick a ZIP code, state, congressional district, or the entire United States."}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-700/80 dark:text-amber-300/80">
              Start from a live line
            </p>
            <div className="flex flex-wrap gap-2">
              {QUESTION_EXAMPLES.map((example) => (
                <Button
                  key={example}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  className="h-auto whitespace-normal px-3 py-2 text-left leading-relaxed"
                  onClick={() => {
                    setQuestion(example);
                    setError(null);
                    textareaRef.current?.focus();
                  }}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
