import { z } from "zod/v4";

export const BenchmarkQuestionManifestItemSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  sourceVariable: z.string().min(1),
  benchmarkField: z.string().min(1),
  responseFormat: z.string().min(1),
  targetSlices: z.array(z.string().min(1)).min(1),
  confirmatorySlices: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(1),
});

export const BenchmarkQuestionManifestSchema = z.object({
  version: z.number().int().positive(),
  suiteId: z.string().min(1),
  datasetId: z.string().min(1),
  datasetLabel: z.string().min(1),
  normalizationSpec: z.object({
    envVar: z.string().min(1),
    defaultPath: z.string().min(1),
    expectedTopLevelKey: z.string().min(1),
    notes: z.string().min(1),
  }),
  questions: z.array(BenchmarkQuestionManifestItemSchema).min(1),
});

export type BenchmarkQuestionManifest = z.infer<typeof BenchmarkQuestionManifestSchema>;
export type BenchmarkQuestionManifestItem = z.infer<
  typeof BenchmarkQuestionManifestItemSchema
>;
