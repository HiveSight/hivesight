import shedHumanTargetsJson from "./data/results/shed-2024-human-targets-v1.json";
import shedMiniComparisonJson from "./data/results/shed-2024-mini-comparison-v1.json";
import { BenchmarkResultSnapshotSchema } from "./results-schema";

export const benchmarkResultSnapshots = [
  BenchmarkResultSnapshotSchema.parse(shedHumanTargetsJson),
  BenchmarkResultSnapshotSchema.parse(shedMiniComparisonJson),
];

export const benchmarkResultSnapshotsBySuiteId = Object.fromEntries(
  benchmarkResultSnapshots.map((snapshot) => [snapshot.suiteId, snapshot])
);
