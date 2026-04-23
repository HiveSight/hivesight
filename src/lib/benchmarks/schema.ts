import { z } from "zod/v4";

export const BenchmarkComparisonSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

export const BenchmarkMetricSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

export const BenchmarkSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  fieldDates: z.string().min(1),
  releaseDate: z.string().min(1),
  freshnessNote: z.string().min(1),
});

export const BenchmarkSuiteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["planned", "in_progress", "complete"]),
  focus: z.string().min(1),
  whyThisSuite: z.string().min(1),
  questionFamilies: z.array(z.string().min(1)).min(1),
  targetComparisons: z.array(z.string().min(1)).min(1),
  targetMetrics: z.array(z.string().min(1)).min(1),
  source: BenchmarkSourceSchema,
  notes: z.string().min(1),
});

export const BenchmarkRoadmapItemSchema = z.object({
  step: z.string().min(1),
  status: z.enum(["now", "next", "later"]),
});

export const BenchmarkProgramSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  thesis: z.string().min(1),
  currentStatus: z.string().min(1),
  comparisons: z.array(BenchmarkComparisonSchema).min(1),
  metrics: z.array(BenchmarkMetricSchema).min(1),
  suites: z.array(BenchmarkSuiteSchema).min(1),
  roadmap: z.array(BenchmarkRoadmapItemSchema).min(1),
});

export type BenchmarkProgram = z.infer<typeof BenchmarkProgramSchema>;
export type BenchmarkSuite = z.infer<typeof BenchmarkSuiteSchema>;
