import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  installedRuntime,
  sha256,
  validateModelManifest,
  verifyAsset,
} from "./asset-manifest.mjs";

const root = process.cwd();
const catalog = JSON.parse(
  await readFile("assets/model-candidates.json", "utf8"),
);
const candidate = catalog.candidates.find(
  (item) => item.modelId === catalog.selectedModelId,
);
if (!candidate || candidate.license.status === "missing")
  throw new Error("SELECTED_LICENSED_MODEL_REQUIRED");
const runtime = await installedRuntime(root, candidate.adapter);
const modelManifest = JSON.parse(
  await readFile(`dist-lab/models/${candidate.modelId}/manifest.json`, "utf8"),
);
validateModelManifest(modelManifest, candidate, runtime);
const names = (
  await readdir("dist-lab", { recursive: true, withFileTypes: true })
)
  .filter((entry) => entry.isFile() && entry.name !== "evaluation-build.json")
  .map((entry) =>
    resolve(entry.parentPath, entry.name)
      .slice(resolve("dist-lab").length + 1)
      .replaceAll("\\", "/"),
  )
  .sort();
const files = await Promise.all(
  names.map(async (path) => {
    const bytes = await readFile(`dist-lab/${path}`);
    return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }),
);
for (const file of modelManifest.files)
  await verifyAsset(resolve("dist-lab"), file);
const payload = {
  schemaVersion: 1,
  baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceDiffSha256: createHash("sha256")
    .update(
      execFileSync("git", [
        "diff",
        "HEAD",
        "--",
        "src",
        "tools",
        "vite.lab.config.ts",
        "scripts/evaluation-build.mjs",
      ]),
    )
    .digest("hex"),
  modelId: candidate.modelId,
  revision: candidate.revision,
  runtimeVersion: runtime.metadata.version,
  backend: "wasm",
  numThreads: 1,
  files,
};
const manifest = {
  ...payload,
  version: sha256(Buffer.from(JSON.stringify(payload))),
};
await writeFile(
  "dist-lab/evaluation-build.json",
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Frozen evaluation build: ${manifest.version}; ${files.length} hashed files; WASM ${runtime.metadata.version}.`,
);
