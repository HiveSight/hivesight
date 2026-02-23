"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LocationInput } from "./location-input";
import type { LocationFilter } from "@/types";
import { ArrowRight } from "lucide-react";

interface ProgressState {
  stage: string;
  message: string;
  progress: number;
  completed?: number;
  total?: number;
}

export function HeroSurveyForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [location, setLocation] = useState<LocationFilter | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressState, setProgressState] = useState<ProgressState | null>(
    null
  );

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

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (eventType === "progress") {
              setProgressState({
                stage: data.stage,
                message: data.message,
                progress: data.progress,
                completed: data.completed,
                total: data.total,
              });
            } else if (eventType === "complete") {
              router.push(`/survey/${data.surveyId}`);
              return;
            } else if (eventType === "error") {
              throw new Error(data.message);
            }
          }
        }
      }
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
    <div className="w-full max-w-xl mx-auto space-y-3 text-left">
      <textarea
        className="w-full min-h-24 p-4 border border-amber-900/10 rounded-xl resize-none bg-white/80 shadow-warm-sm text-base leading-relaxed placeholder:text-muted-foreground/50 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-300 transition-all duration-200 dark:bg-amber-950/20 dark:border-amber-100/10 dark:focus:ring-amber-500/30 dark:focus:border-amber-700"
        placeholder="e.g., I support increasing the minimum wage to $15/hour"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <div className="flex gap-3">
        <div className="flex-1">
          <LocationInput
            value={location}
            onSelect={setLocation}
            placeholder="Location (ZIP, state, or district)"
          />
        </div>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-6 gap-2"
        >
          Ask
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
