import benchmarkExecutionSpecJson from "./data/execution-spec-v1.json";
import { BenchmarkExecutionSpecSchema } from "./execution-schema";

export const benchmarkExecutionSpec = BenchmarkExecutionSpecSchema.parse(
  benchmarkExecutionSpecJson
);
