import shedHumanTargetsJson from "./data/results/shed-2024-human-targets-v1.json";
import { BenchmarkResultSnapshotSchema } from "./results-schema";

export const benchmarkResultSnapshots = [
  BenchmarkResultSnapshotSchema.parse(shedHumanTargetsJson),
];

export const benchmarkResultSnapshotsBySuiteId = Object.fromEntries(
  benchmarkResultSnapshots.map((snapshot) => [snapshot.suiteId, snapshot])
);
