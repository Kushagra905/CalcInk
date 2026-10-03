import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  normalizeTranscript,
  summarizeBenchmark,
} from "../src/recognition/benchmark.ts";
import { sampleCases } from "../tools/model-lab/cases.ts";
import { parseFixtures } from "../tools/model-lab/fixtures.ts";

const filename = process.argv[2];
if (!filename)
  throw new Error("Usage: npm run benchmark:report -- <exported-report.json>");
const report = JSON.parse(await readFile(filename, "utf8"));
const catalog = JSON.parse(
  await readFile(
    fileURLToPath(new URL("../assets/model-candidates.json", import.meta.url)),
    "utf8",
  ),
);
const candidate = catalog.candidates.find(
  (item) => item.modelId === report.modelId,
);
if (
  report.schemaVersion !== 1 ||
  report.split !== "development" ||
  !candidate ||
  candidate.revision !== report.revision ||
  !Array.isArray(report.entries)
)
  throw new Error("INVALID_BENCHMARK_REPORT");
if (candidate.license.status === "missing")
  throw new Error("MODEL_LICENSE_UNRESOLVED");
const cases = sampleCases.filter((item) => item.split === "development");
const samples = parseFixtures({
  schemaVersion: 1,
  samples: report.samples,
}).samples;
if (
  samples.length !== 24 ||
  samples.some((sample) => !cases.some((item) => item.id === sample.sampleId))
)
  throw new Error("INCOMPLETE_DEVELOPMENT_FIXTURES");
if (report.entries.length !== 24)
  throw new Error("INCOMPLETE_DEVELOPMENT_REPORT");
for (const entry of report.entries) {
  const item = cases.find((item) => item.id === entry.sampleId);
  if (
    !item ||
    typeof entry.expected !== "string" ||
    typeof entry.transcript !== "string" ||
    normalizeTranscript(entry.expected) !== normalizeTranscript(item.expected)
  )
    throw new Error("GROUND_TRUTH_MISMATCH");
}
const summary = summarizeBenchmark(report.entries);
console.log(
  JSON.stringify(
    {
      modelId: candidate.modelId,
      revision: candidate.revision,
      license: candidate.license.id,
      summary,
      decision:
        summary.gate === "pass"
          ? "Development targets met; verify offline reload and final deployment/attribution before release."
          : "Do not claim the model meets the development targets.",
    },
    null,
    2,
  ),
);
