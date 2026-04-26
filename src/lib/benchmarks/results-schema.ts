import { z } from "zod/v4";

export const BenchmarkSliceResultSchema = z.object({
  family: z.string().min(1),
  label: z.string().min(1),
  unweightedN: z.number().int().nonnegative(),
  weightedMean: z.number().min(0).max(1),
});

export const BenchmarkQuestionResultSchema = z.object({
  questionId: z.string().min(1),
  benchmarkField: z.string().min(1),
  prompt: z.string().min(1),
  unweightedN: z.number().int().nonnegative(),
  missingRows: z.number().int().nonnegative(),
  weightedMean: z.number().min(0).max(1),
  sliceHighlights: z.array(BenchmarkSliceResultSchema),
});

export const BenchmarkResultSnapshotSchema = z.object({
  version: z.number().int().positive(),
  suiteId: z.string().min(1),
  datasetId: z.string().min(1),
  datasetLabel: z.string().min(1),
  resultType: z.enum(["human_targets", "model_comparison"]),
  status: z.enum(["complete", "partial"]),
  generatedAt: z.string().min(1),
  sourceRows: z.number().int().positive(),
  notes: z.string().min(1),
  questions: z.array(BenchmarkQuestionResultSchema).min(1),
});

export type BenchmarkResultSnapshot = z.infer<
  typeof BenchmarkResultSnapshotSchema
>;
