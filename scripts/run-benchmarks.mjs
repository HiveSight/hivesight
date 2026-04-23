import fs from "node:fs";
import path from "node:path";
import {
  buildExecutionMatrix,
  loadBenchmarkExecutionSpec,
  loadBenchmarkManifests,
  loadBenchmarkProgram,
  validateBenchmarkAssets,
} from "./benchmark-common.mjs";

const outFlagIndex = process.argv.findIndex((arg) => arg === "--out");
const outPath =
  outFlagIndex >= 0 && process.argv[outFlagIndex + 1]
    ? path.resolve(process.cwd(), process.argv[outFlagIndex + 1])
    : null;

const dryRun = process.argv.includes("--dry-run");
const strict = process.argv.includes("--strict");

const program = loadBenchmarkProgram();
const executionSpec = loadBenchmarkExecutionSpec();
const manifests = loadBenchmarkManifests();
validateBenchmarkAssets(program, manifests, executionSpec);

const executionMatrix = buildExecutionMatrix(program, manifests);

if (strict) {
  const missingInputs = executionMatrix.filter((suite) => !suite.datasetInput.ready);
  if (missingInputs.length > 0) {
    throw new Error(
      `Missing normalized benchmark inputs for: ${missingInputs
        .map((suite) => suite.datasetId)
        .join(", ")}`
    );
  }
}

const executionPlan = {
  generatedAt: new Date().toISOString(),
  mode: dryRun ? "dry_run" : "plan_only",
  benchmarkProgram: {
    title: program.title,
    updatedAt: program.updatedAt,
    version: program.version,
  },
  executionSpec: {
    version: executionSpec.version,
    updatedAt: executionSpec.updatedAt,
    model: executionSpec.model.id,
    confirmatorySuites: executionSpec.analysisPlan.confirmatorySuites,
    confirmatorySliceFamilies: executionSpec.analysisPlan.confirmatorySliceFamilies,
    respondentsPerQuestion: executionSpec.simulationProtocol.respondentsPerQuestion,
    seeds: executionSpec.simulationProtocol.seeds,
  },
  suites: executionMatrix,
  totals: {
    suites: executionMatrix.length,
    questions: executionMatrix.reduce((total, suite) => total + suite.questionCount, 0),
    tasks: executionMatrix.reduce((total, suite) => total + suite.taskCount, 0),
    readySuites: executionMatrix.filter((suite) => suite.datasetInput.ready).length,
  },
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(executionPlan, null, 2)}\n`);
  console.log(`Wrote benchmark execution plan to ${outPath}`);
} else {
  console.log(JSON.stringify(executionPlan, null, 2));
}
