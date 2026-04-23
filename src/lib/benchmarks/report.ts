import benchmarkProgramJson from "./data/foundation-v1.json";
import { BenchmarkProgramSchema } from "./schema";

export const benchmarkProgram = BenchmarkProgramSchema.parse(
  benchmarkProgramJson
);
