import gssManifestJson from "./data/manifests/gss-2024-evergreen.json";
import shedManifestJson from "./data/manifests/shed-2024-household-finance.json";
import sdcpcManifestJson from "./data/manifests/sdcpc-2024-consumer-choice.json";
import { BenchmarkQuestionManifestSchema } from "./manifest-schema";

export const benchmarkManifests = [
  BenchmarkQuestionManifestSchema.parse(gssManifestJson),
  BenchmarkQuestionManifestSchema.parse(shedManifestJson),
  BenchmarkQuestionManifestSchema.parse(sdcpcManifestJson),
];

export const benchmarkManifestBySuiteId = Object.fromEntries(
  benchmarkManifests.map((manifest) => [manifest.suiteId, manifest])
);
