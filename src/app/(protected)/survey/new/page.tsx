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
import { MODEL_CONFIG, TIER_CONFIG } from "@/types";
import type { Model, ResponseType, DemographicFilters } from "@/types";

interface CostEstimate {
  tokens: { input: number; output: number; total: number };
  cost: { input: number; output: number; total: number };
  credits: number;
  model: string;
}

export default function NewSurveyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [question, setQuestion] = useState("");
  const [responseType, setResponseType] = useState<ResponseType>("likert");
  const [model, setModel] = useState<Model>("gpt-4o-mini");
  const [hiveSize, setHiveSize] = useState(10);
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 100]);
  const [incomeRange, setIncomeRange] = useState<[number, number]>([0, 500000]);

  const demographicFilters: DemographicFilters = {
    ageRange,
    incomeRange,
  };

  const fetchEstimate = async () => {
    if (question.length < 10) return;
    setEstimating(true);
    try {
      const res = await fetch("/api/survey/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          responseType,
          model,
          hiveSize,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEstimate(data);
      }
    } catch {
      // Ignore estimate errors
    } finally {
      setEstimating(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/survey", {
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create survey");
      }

      router.push(`/survey/${data.surveyId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
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

      {/* Step 3: Model & Size */}
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
                  <SelectItem value="gpt-4o-mini">
                    GPT-4o Mini (faster, cheaper)
                  </SelectItem>
                  <SelectItem value="gpt-4o">
                    GPT-4o (more capable)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label>Hive size: {hiveSize} respondents</Label>
              <div className="px-2">
                <Slider
                  value={[hiveSize]}
                  onValueChange={(v) => setHiveSize(v[0])}
                  min={1}
                  max={100}
                  step={1}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                More respondents = more statistically significant results
              </p>
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
                  <p className="font-medium">Hive Size</p>
                  <p className="text-muted-foreground">{hiveSize} respondents</p>
                </div>
                <div>
                  <p className="font-medium">Age Range</p>
                  <p className="text-muted-foreground">
                    {ageRange[0]} - {ageRange[1]}
                  </p>
                </div>
              </div>

              {estimate && (
                <div className="p-4 border rounded-lg space-y-2">
                  <p className="font-medium">Estimated Cost</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p className="text-muted-foreground">Tokens:</p>
                    <p>{estimate.tokens.total.toLocaleString()}</p>
                    <p className="text-muted-foreground">Cost:</p>
                    <p>${estimate.cost.total.toFixed(4)}</p>
                    <p className="text-muted-foreground font-medium">Credits:</p>
                    <p className="font-medium">{estimate.credits}</p>
                  </div>
                </div>
              )}
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
            onClick={() => {
              setStep(step + 1);
              if (step === 3) fetchEstimate();
            }}
            disabled={!canProceed()}
          >
            Continue
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading || estimating}>
            {loading ? "Creating..." : "Run Survey"}
          </Button>
        )}
      </div>
    </div>
  );
}
