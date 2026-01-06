"use client";

import { useState, useMemo } from "react";
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
import type { Model, ResponseType, DemographicFilters } from "@/types";

interface ProgressState {
  stage: string;
  message: string;
  progress: number;
  completed?: number;
  total?: number;
}

export default function NewSurveyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressState, setProgressState] = useState<ProgressState | null>(null);

  // Form state
  const [question, setQuestion] = useState("");
  const [responseType, setResponseType] = useState<ResponseType>("likert");
  const [model, setModel] = useState<Model>("gpt-5-mini");
  const [credits, setCredits] = useState(10);
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 100]);
  const [incomeRange, setIncomeRange] = useState<[number, number]>([0, 500000]);

  // Calculate respondents from credits
  const respondentsPerCredit = useMemo(() => {
    const config = MODEL_CONFIG[model];
    return responseType === "likert"
      ? config.respondentsPerCreditLikert
      : config.respondentsPerCreditOpenEnded;
  }, [model, responseType]);

  const hiveSize = useMemo(() => {
    return credits * respondentsPerCredit;
  }, [credits, respondentsPerCredit]);

  const demographicFilters: DemographicFilters = {
    ageRange,
    incomeRange,
  };

  const handleSubmit = async () => {
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
          demographicFilters,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create survey");
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No response stream");
      }

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

  const canProceed = () => {
    switch (step) {
      case 1:
        return question.length >= 10;
      case 2:
        return true;
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress Modal */}
      {loading && progressState && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="text-center">Running Survey</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progressState.progress} />
              <p className="text-center text-sm text-muted-foreground">
                {progressState.message}
              </p>
              {progressState.completed !== undefined && progressState.total !== undefined && (
                <p className="text-center text-xs text-muted-foreground">
                  {progressState.completed} of {progressState.total} responses
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">New Survey</h1>
        <div className="text-sm text-muted-foreground">Step {step} of 4</div>
      </div>

      {/* Progress indicator */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded-full ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Step 1: Question */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>What do you want to ask?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="question">Your question or statement</Label>
              <textarea
                id="question"
                className="w-full min-h-32 p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g., I support increasing the minimum wage to $15/hour"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                {question.length < 10
                  ? `${10 - question.length} more characters needed`
                  : "Ready to continue"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Response type</Label>
              <Tabs
                value={responseType}
                onValueChange={(v) => setResponseType(v as ResponseType)}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="likert" className="flex-1">
                    Likert Scale
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
      )}

      {/* Step 2: Demographics */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Who should respond?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label>Age range: {ageRange[0]} - {ageRange[1]}</Label>
              <div className="px-2">
                <Slider
                  value={ageRange}
                  onValueChange={(v) => setAgeRange(v as [number, number])}
                  min={18}
                  max={100}
                  step={1}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label>
                Income range: ${incomeRange[0].toLocaleString()} - $
                {incomeRange[1].toLocaleString()}
              </Label>
              <div className="px-2">
                <Slider
                  value={incomeRange}
                  onValueChange={(v) => setIncomeRange(v as [number, number])}
                  min={0}
                  max={500000}
                  step={10000}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Model & Credits */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Configure simulation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>AI Model</Label>
              <Select value={model} onValueChange={(v) => setModel(v as Model)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-5-mini">
                    GPT-5 Mini (best value)
                  </SelectItem>
                  <SelectItem value="gpt-5">
                    GPT-5 (highest quality)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {MODEL_CONFIG[model].name}: {respondentsPerCredit} {responseType === "likert" ? "likert" : "open-ended"} respondents per credit
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
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {hiveSize} respondents
                </p>
                <p className="text-sm text-muted-foreground">
                  for {credits} credits (${(credits * 0.01).toFixed(2)})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Submit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">Question</p>
                <p className="text-muted-foreground">&quot;{question}&quot;</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium">Response Type</p>
                  <p className="text-muted-foreground">
                    {responseType === "likert" ? "Likert Scale" : "Open-ended"}
                  </p>
                </div>
                <div>
                  <p className="font-medium">Model</p>
                  <p className="text-muted-foreground">{MODEL_CONFIG[model].name}</p>
                </div>
                <div>
                  <p className="font-medium">Respondents</p>
                  <p className="text-muted-foreground">{hiveSize}</p>
                </div>
                <div>
                  <p className="font-medium">Age Range</p>
                  <p className="text-muted-foreground">
                    {ageRange[0]} - {ageRange[1]}
                  </p>
                </div>
              </div>

              <div className="p-4 border-2 border-primary rounded-lg space-y-2 bg-primary/5">
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-lg">Cost</p>
                  <p className="text-2xl font-bold text-primary">{credits} credits</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {hiveSize} respondents at {respondentsPerCredit} per credit
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 1}
        >
          Back
        </Button>
        {step < 4 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
          >
            Continue
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "Run Survey"}
          </Button>
        )}
      </div>
    </div>
  );
}
