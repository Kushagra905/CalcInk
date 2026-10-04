import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import {
  assetPath,
  installedRuntime,
  sha256,
  validateModelManifest,
  verifyAsset,
} from "./asset-manifest.mjs";

const argumentsList = process.argv
  .slice(2)
  .filter((item) => item !== "--require-targets");
const filename = argumentsList[0];
const artifact = resolve(argumentsList[1] ?? "dist-lab");
if (!filename)
  throw new Error(
    "Usage: npm run phase6:report -- <final-report.json> [frozen-lab-directory]",
  );
const report = JSON.parse(await readFile(filename, "utf8"));
const build = JSON.parse(
  await readFile(resolve(artifact, "evaluation-build.json"), "utf8"),
);
const { version, ...payload } = build;
assert.equal(
  version,
  sha256(Buffer.from(JSON.stringify(payload))),
  "Evaluation manifest digest mismatch",
);
assert(
  Array.isArray(build.files) && build.files.length > 0,
  "Empty evaluation artifact",
);
const paths = new Set();
for (const file of build.files) {
  assetPath(artifact, file.path);
  assert(!paths.has(file.path), "Duplicate artifact path");
  paths.add(file.path);
  await verifyAsset(artifact, file);
}
const catalog = JSON.parse(
  await readFile("assets/model-candidates.json", "utf8"),
);
const candidate = catalog.candidates.find(
  (item) => item.modelId === catalog.selectedModelId,
);
assert(
  candidate &&
    candidate.modelId === build.modelId &&
    candidate.revision === build.revision &&
    candidate.license.status !== "missing",
  "Selected model/revision/license mismatch",
);
const runtime = await installedRuntime(process.cwd(), candidate.adapter);
assert.equal(
  build.runtimeVersion,
  runtime.metadata.version,
  "Runtime version mismatch",
);
const model = JSON.parse(
  await readFile(
    resolve(artifact, `models/${candidate.modelId}/manifest.json`),
    "utf8",
  ),
);
validateModelManifest(model, candidate, runtime);
// Vite loads the same TypeScript scorer/parser as the browser, including the strict
// arithmetic evaluator. No second implementation and no TypeScript runtime dependency.
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true },
});
try {
  const { validateFinalReport } = await server.ssrLoadModule(
    "/tools/model-lab/evaluation.ts",
  );
  const { samples, summary } = validateFinalReport(report, build);
  const digest = createHash("sha256")
    .update(JSON.stringify(samples))
    .digest("hex");
  assert.equal(report.fixturesSha256, digest, "Fixture digest mismatch");
  const targetsMet = Object.entries(summary.gates)
    .filter(([key]) => key !== "automaticCorrections")
    .every(([, value]) => value);
  console.log(
    JSON.stringify(
      {
        build,
        recordedAt: report.recordedAt,
        environment: report.environment,
        initializationMs: report.initializationMs,
        summary,
        targetsMet,
        decision: targetsMet
          ? "Measured transcription and display-readiness targets met. Physical input, public offline and resource acceptance require their separate evidence."
          : "One or more measured targets missed. Preserve the failures; do not retune on this held-out set and claim it remains held out.",
        provenance:
          "Writer-attested capture and measurement metadata; integrity checks do not independently prove human handwriting or unmodified measurements.",
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--require-targets") && !targetsMet)
    process.exitCode = 2;
} finally {
  await server.close();
}
