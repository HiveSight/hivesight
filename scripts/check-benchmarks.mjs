import {
  buildExecutionMatrix,
  buildSimulationBudget,
  loadBenchmarkExecutionSpec,
  loadBenchmarkManifests,
  loadBenchmarkProgram,
  validateBenchmarkAssets,
} from "./benchmark-common.mjs";

const program = loadBenchmarkProgram();
const executionSpec = loadBenchmarkExecutionSpec();
const manifests = loadBenchmarkManifests();
validateBenchmarkAssets(program, manifests, executionSpec);

const executionMatrix = buildExecutionMatrix(program, manifests);
const simulationBudget = buildSimulationBudget(program, manifests, executionSpec);

console.log(
  JSON.stringify(
    {
      title: program.title,
      updatedAt: program.updatedAt,
      suites: program.suites.length,
      manifests: manifests.length,
      comparisons: program.comparisons.length,
      metrics: program.metrics.length,
      confirmatorySuites: executionSpec.analysisPlan.confirmatorySuites.length,
      readySuites: executionMatrix.filter((suite) => suite.datasetInput.ready).length,
      tasks: executionMatrix.reduce((total, suite) => total + suite.taskCount, 0),
      simulationBudget,
    },
    null,
    2
  )
);
