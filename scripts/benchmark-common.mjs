import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const programPath = path.join(
  rootDir,
  "src/lib/benchmarks/data/foundation-v1.json"
);
const executionSpecPath = path.join(
  rootDir,
  "src/lib/benchmarks/data/execution-spec-v1.json"
);
const manifestDir = path.join(rootDir, "src/lib/benchmarks/data/manifests");

export const DATASET_INPUTS = {
  gss_2024: {
    envVar: "GSS_2024_DATA_PATH",
    defaultPath: ".benchmarks/input/gss-2024.json",
  },
  shed_2024: {
    envVar: "SHED_2024_DATA_PATH",
    defaultPath: ".benchmarks/input/shed-2024.json",
  },
  sdcpc_2024: {
    envVar: "SDCPC_2024_DATA_PATH",
    defaultPath: ".benchmarks/input/sdcpc-2024.json",
  },
};

const BenchmarkComparisonSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const BenchmarkMetricSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const BenchmarkSuiteSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["planned", "in_progress", "complete"]),
  focus: z.string().min(1),
  whyThisSuite: z.string().min(1),
  questionFamilies: z.array(z.string().min(1)).min(1),
  targetComparisons: z.array(z.string().min(1)).min(1),
  targetMetrics: z.array(z.string().min(1)).min(1),
  source: z.object({
    name: z.string().min(1),
    url: z.string().url(),
    fieldDates: z.string().min(1),
    releaseDate: z.string().min(1),
    freshnessNote: z.string().min(1),
  }),
  notes: z.string().min(1),
});

const BenchmarkProgramSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  thesis: z.string().min(1),
  currentStatus: z.string().min(1),
  comparisons: z.array(BenchmarkComparisonSchema).min(1),
  metrics: z.array(BenchmarkMetricSchema).min(1),
  suites: z.array(BenchmarkSuiteSchema).min(1),
  roadmap: z.array(
    z.object({
      step: z.string().min(1),
      status: z.enum(["now", "next", "later"]),
    })
  ).min(1),
});

const BenchmarkExecutionSpecSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().min(1),
  model: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    provider: z.string().min(1),
    apiSurface: z.string().min(1),
    maxCompletionTokens: z.number().int().positive(),
    reasoningEffort: z.string().min(1),
    temperature: z.string().min(1),
    snapshotDate: z.string().min(1),
  }),
  promptTemplates: z.object({
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
  }),
  dataPipeline: z.object({
    normalizerFiles: z.array(
      z.object({
        file: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
    ).min(1),
  }),
  simulationProtocol: z.object({
    respondentsPerQuestion: z.number().int().positive(),
    seeds: z.array(z.number().int()).length(3),
    promptPerturbations: z.array(z.string().min(1)).length(4),
  }),
  analysisPlan: z.object({
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
  }),
  armSpecs: z.array(
    z.object({
      comparisonId: z.string().min(1),
      conditioningMode: z.string().min(1),
      populationSource: z.string().min(1),
      locationContext: z.string().min(1),
      contextFields: z.array(z.string().min(1)).min(1),
      promptTemplateId: z.string().min(1),
    })
  ).min(1),
});

const BenchmarkQuestionManifestSchema = z.object({
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
  questions: z.array(
    z.object({
      id: z.string().min(1),
      prompt: z.string().min(1),
      sourceVariable: z.string().min(1),
      benchmarkField: z.string().min(1),
      responseFormat: z.string().min(1),
      targetSlices: z.array(z.string().min(1)).min(1),
      confirmatorySlices: z.array(z.string().min(1)).min(1),
      rationale: z.string().min(1),
    })
  ).min(1),
});

function readJson(jsonPath) {
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function loadBenchmarkProgram() {
  return BenchmarkProgramSchema.parse(readJson(programPath));
}

export function loadBenchmarkExecutionSpec() {
  return BenchmarkExecutionSpecSchema.parse(readJson(executionSpecPath));
}

export function loadBenchmarkManifests() {
  return fs
    .readdirSync(manifestDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      BenchmarkQuestionManifestSchema.parse(readJson(path.join(manifestDir, name)))
    );
}

export function validateBenchmarkAssets(program, manifests, executionSpec) {
  const suiteIds = new Set(program.suites.map((suite) => suite.id));
  const comparisonIds = new Set(program.comparisons.map((comparison) => comparison.id));
  const metricIds = new Set(program.metrics.map((metric) => metric.id));
  const manifestSuiteIds = new Set();
  const armSpecComparisonIds = new Set();
  const confirmatorySuiteIds = new Set(executionSpec.analysisPlan.confirmatorySuites);
  const confirmatorySliceFamilies = new Set(
    executionSpec.analysisPlan.confirmatorySliceFamilies
  );
  const confirmatorySliceDefinitions =
    executionSpec.analysisPlan.confirmatorySliceDefinitions;

  for (const suite of program.suites) {
    for (const comparisonId of suite.targetComparisons) {
      if (!comparisonIds.has(comparisonId)) {
        throw new Error(
          `Suite "${suite.id}" references unknown comparison "${comparisonId}".`
        );
      }
    }

    for (const metricId of suite.targetMetrics) {
      if (!metricIds.has(metricId)) {
        throw new Error(`Suite "${suite.id}" references unknown metric "${metricId}".`);
      }
    }
  }

  for (const manifest of manifests) {
    if (!suiteIds.has(manifest.suiteId)) {
      throw new Error(
        `Manifest for dataset "${manifest.datasetId}" references unknown suite "${manifest.suiteId}".`
      );
    }

    if (manifestSuiteIds.has(manifest.suiteId)) {
      throw new Error(`Duplicate benchmark manifest found for suite "${manifest.suiteId}".`);
    }
    manifestSuiteIds.add(manifest.suiteId);

    const config = DATASET_INPUTS[manifest.datasetId];
    if (!config) {
      throw new Error(`No dataset input configuration found for "${manifest.datasetId}".`);
    }

    if (config.envVar !== manifest.normalizationSpec.envVar) {
      throw new Error(
        `Manifest "${manifest.datasetId}" env var does not match dataset input configuration.`
      );
    }

    if (config.defaultPath !== manifest.normalizationSpec.defaultPath) {
      throw new Error(
        `Manifest "${manifest.datasetId}" default path does not match dataset input configuration.`
      );
    }

    for (const question of manifest.questions) {
      for (const confirmatorySlice of question.confirmatorySlices) {
        if (!question.targetSlices.includes(confirmatorySlice)) {
          throw new Error(
            `Question "${question.id}" in manifest "${manifest.datasetId}" references confirmatory slice "${confirmatorySlice}" outside targetSlices.`
          );
        }
      }
    }
  }

  for (const suite of program.suites) {
    if (!manifestSuiteIds.has(suite.id)) {
      throw new Error(`No benchmark manifest found for suite "${suite.id}".`);
    }
  }

  for (const suiteId of confirmatorySuiteIds) {
    if (!suiteIds.has(suiteId)) {
      throw new Error(`Execution spec references unknown confirmatory suite "${suiteId}".`);
    }
  }

  for (const armSpec of executionSpec.armSpecs) {
    if (!comparisonIds.has(armSpec.comparisonId)) {
      throw new Error(
        `Execution spec references unknown comparison "${armSpec.comparisonId}".`
      );
    }

    if (armSpecComparisonIds.has(armSpec.comparisonId)) {
      throw new Error(
        `Execution spec contains duplicate arm spec for "${armSpec.comparisonId}".`
      );
    }

    armSpecComparisonIds.add(armSpec.comparisonId);
  }

  for (const comparisonId of comparisonIds) {
    if (!armSpecComparisonIds.has(comparisonId)) {
      throw new Error(`Execution spec is missing an arm spec for "${comparisonId}".`);
    }
  }

  const promptSourcePath = path.join(rootDir, executionSpec.promptTemplates.sourceFile);
  const personaFormatterPath = path.join(
    rootDir,
    executionSpec.promptTemplates.personaFormatterFile
  );

  if (!fs.existsSync(promptSourcePath)) {
    throw new Error(`Prompt template source file is missing: ${promptSourcePath}`);
  }

  if (!fs.existsSync(personaFormatterPath)) {
    throw new Error(
      `Persona formatter source file is missing: ${personaFormatterPath}`
    );
  }

  if (sha256(promptSourcePath) !== executionSpec.promptTemplates.sourceSha256) {
    throw new Error(
      `Prompt template source hash does not match execution spec for ${promptSourcePath}.`
    );
  }

  if (
    sha256(personaFormatterPath) !==
    executionSpec.promptTemplates.personaFormatterSha256
  ) {
    throw new Error(
      `Persona formatter source hash does not match execution spec for ${personaFormatterPath}.`
    );
  }

  for (const dependency of executionSpec.promptTemplates.dependencyFiles) {
    const dependencyPath = path.join(rootDir, dependency.file);

    if (!fs.existsSync(dependencyPath)) {
      throw new Error(`Dependency source file is missing: ${dependencyPath}`);
    }

    if (sha256(dependencyPath) !== dependency.sha256) {
      throw new Error(
        `Dependency source hash does not match execution spec for ${dependencyPath}.`
      );
    }
  }

  for (const normalizer of executionSpec.dataPipeline.normalizerFiles) {
    const normalizerPath = path.join(rootDir, normalizer.file);

    if (!fs.existsSync(normalizerPath)) {
      throw new Error(`Normalizer source file is missing: ${normalizerPath}`);
    }

    if (sha256(normalizerPath) !== normalizer.sha256) {
      throw new Error(
        `Normalizer source hash does not match execution spec for ${normalizerPath}. Re-run shasum -a 256 on the file and update execution-spec-v1.json to re-freeze the data pipeline.`
      );
    }
  }

  for (const sliceFamily of confirmatorySliceFamilies) {
    if (!confirmatorySliceDefinitions[sliceFamily]) {
      throw new Error(
        `Execution spec is missing a confirmatory slice definition for "${sliceFamily}".`
      );
    }
  }

  for (const manifest of manifests) {
    if (!confirmatorySuiteIds.has(manifest.suiteId)) {
      continue;
    }

    for (const question of manifest.questions) {
      for (const confirmatorySlice of question.confirmatorySlices) {
        if (!confirmatorySliceFamilies.has(confirmatorySlice)) {
          throw new Error(
            `Confirmatory suite "${manifest.suiteId}" question "${question.id}" uses unregistered confirmatory slice "${confirmatorySlice}".`
          );
        }
      }
    }

    const hasConfirmatorySlice = manifest.questions.some((question) =>
      question.confirmatorySlices.some((slice) => confirmatorySliceFamilies.has(slice))
    );

    if (!hasConfirmatorySlice) {
      throw new Error(
        `Confirmatory suite "${manifest.suiteId}" does not expose any confirmatory slice families.`
      );
    }
  }
}

export function resolveDatasetInput(datasetId) {
  const config = DATASET_INPUTS[datasetId];

  if (!config) {
    throw new Error(`Unknown dataset input configuration for "${datasetId}".`);
  }

  const configuredPath =
    process.env[config.envVar] ?? path.join(rootDir, config.defaultPath);
  const absolutePath = path.resolve(configuredPath);

  if (!fs.existsSync(absolutePath)) {
    return {
      ready: false,
      envVar: config.envVar,
      path: absolutePath,
      rowCount: null,
      parseError: null,
    };
  }

  try {
    const parsed = readJson(absolutePath);
    const rows = Array.isArray(parsed.rows) ? parsed.rows : null;

    return {
      ready: rows !== null,
      envVar: config.envVar,
      path: absolutePath,
      rowCount: rows ? rows.length : null,
      parseError: rows ? null : `Expected top-level "rows" array in ${absolutePath}.`,
    };
  } catch (error) {
    return {
      ready: false,
      envVar: config.envVar,
      path: absolutePath,
      rowCount: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildSimulationBudget(program, manifests, executionSpec) {
  const armCount = executionSpec.armSpecs.length;
  const seedCount = executionSpec.simulationProtocol.seeds.length;
  const respondentsPerQuestion =
    executionSpec.simulationProtocol.respondentsPerQuestion;
  const perturbationCount =
    executionSpec.simulationProtocol.promptPerturbations.length;

  const suites = manifests.map((manifest) => {
    const questionCount = manifest.questions.length;
    const baseSimulations =
      armCount * questionCount * seedCount * respondentsPerQuestion;
    const perturbationSimulations =
      baseSimulations * perturbationCount;
    return {
      suiteId: manifest.suiteId,
      datasetId: manifest.datasetId,
      questionCount,
      baseSimulations,
      perturbationSimulations,
      totalSimulations: baseSimulations + perturbationSimulations,
    };
  });

  const totalBase = suites.reduce(
    (sum, suite) => sum + suite.baseSimulations,
    0
  );
  const totalPerturbations = suites.reduce(
    (sum, suite) => sum + suite.perturbationSimulations,
    0
  );

  return {
    per: {
      arms: armCount,
      seeds: seedCount,
      respondentsPerQuestion,
      perturbations: perturbationCount,
    },
    baseSimulations: totalBase,
    perturbationSimulations: totalPerturbations,
    totalSimulations: totalBase + totalPerturbations,
    suites,
  };
}

export function buildExecutionMatrix(program, manifests) {
  return manifests.map((manifest) => {
    const suite = program.suites.find((item) => item.id === manifest.suiteId);
    if (!suite) {
      throw new Error(`No suite found for manifest "${manifest.suiteId}".`);
    }

    const datasetInput = resolveDatasetInput(manifest.datasetId);

    return {
      suiteId: suite.id,
      suiteTitle: suite.title,
      datasetId: manifest.datasetId,
      datasetLabel: manifest.datasetLabel,
      datasetInput,
      questionCount: manifest.questions.length,
      questions: manifest.questions.map((question) => ({
        ...question,
        comparisons: suite.targetComparisons,
        metrics: suite.targetMetrics,
      })),
      taskCount:
        manifest.questions.length *
        suite.targetComparisons.length *
        suite.targetMetrics.length,
    };
  });
}
