import { z } from "zod/v4";

export const BenchmarkExecutionModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: z.string().min(1),
  apiSurface: z.string().min(1),
  maxCompletionTokens: z.number().int().positive(),
  reasoningEffort: z.string().min(1),
  temperature: z.string().min(1),
  snapshotDate: z.string().min(1),
});

export const BenchmarkPromptTemplateSchema = z.object({
  systemLikertTemplateId: z.string().min(1),
  userLikertTemplateId: z.string().min(1),
  sourceFile: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  personaFormatterId: z.string().min(1),
  personaFormatterFile: z.string().min(1),
  personaFormatterSha256: z.string().regex(/^[a-f0-9]{64}$/),
  dependencyFiles: z.array(
    z.object({
      file: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
  ).min(1),
});

export const BenchmarkDataPipelineSchema = z.object({
  normalizerFiles: z.array(
    z.object({
      file: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
  ).min(1),
});

export const BenchmarkSimulationProtocolSchema = z.object({
  respondentsPerQuestion: z.number().int().positive(),
  seeds: z.array(z.number().int()).length(3),
  promptPerturbations: z.array(z.string().min(1)).length(4),
});

export const BenchmarkAnalysisPlanSchema = z.object({
  confirmatorySuites: z.array(z.string().min(1)).min(1),
  confirmatorySliceFamilies: z.array(z.string().min(1)).min(1),
  confirmatorySliceDefinitions: z.record(
    z.string().min(1),
    z.object({
      bins: z.array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          minInclusive: z.number(),
          maxInclusive: z.number().nullable(),
        })
      ).min(2),
      minimumHumanRespondentsPerBin: z.number().int().positive(),
      missingRule: z.string().min(1),
    })
  ),
  poolingRule: z.string().min(1),
});

export const BenchmarkArmSpecSchema = z.object({
  comparisonId: z.string().min(1),
  conditioningMode: z.string().min(1),
  populationSource: z.string().min(1),
  locationContext: z.string().min(1),
  contextFields: z.array(z.string().min(1)).min(1),
  promptTemplateId: z.string().min(1),
});

export const BenchmarkExecutionSpecSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().min(1),
  model: BenchmarkExecutionModelSchema,
  promptTemplates: BenchmarkPromptTemplateSchema,
  dataPipeline: BenchmarkDataPipelineSchema,
  simulationProtocol: BenchmarkSimulationProtocolSchema,
  analysisPlan: BenchmarkAnalysisPlanSchema,
  armSpecs: z.array(BenchmarkArmSpecSchema).min(1),
});

export type BenchmarkExecutionSpec = z.infer<typeof BenchmarkExecutionSpecSchema>;
