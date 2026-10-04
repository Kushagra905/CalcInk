import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assetPath,
  installedRuntime,
  sha256,
  validateModelManifest,
  verifyAsset,
} from "./asset-manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(root, "public");
const catalog = JSON.parse(
  await readFile(resolve(root, "assets/model-candidates.json"), "utf8"),
);
const mode = process.argv[2] ?? "prepare";
const id = process.argv[3] ?? catalog.selectedModelId;
const candidate = catalog.candidates.find((item) => item.modelId === id);
if (!candidate) throw new Error("UNKNOWN_MODEL");
if (!/^[a-f0-9]{40}$/.test(candidate.revision))
  throw new Error("SOURCE_REVISION_NOT_PINNED");
if (candidate.license.status === "missing")
  throw new Error(
    `MODEL_LICENSE_UNRESOLVED: ${id}; record explicit weight-license evidence before preparing assets`,
  );

function destination(path) {
  return assetPath(publicRoot, path);
}
async function verify(file) {
  await verifyAsset(publicRoot, file);
}

const manifestPath = `models/${id}/manifest.json`;
if (mode === "verify") {
  const manifest = JSON.parse(
    await readFile(destination(manifestPath), "utf8"),
  );
  const runtime = await installedRuntime(root, candidate.adapter);
  validateModelManifest(manifest, candidate, runtime);
  for (const file of manifest.files) await verify(file);
  console.log(`Verified ${id}: ${manifest.files.length} model/runtime files`);
} else if (mode === "prepare") {
  for (const file of candidate.files) {
    const source = new URL(file.url);
    if (
      source.protocol !== "https:" ||
      !source.pathname.split("/").includes(candidate.revision)
    )
      throw new Error(`SOURCE_REVISION_NOT_PINNED: ${file.path}`);
    try {
      await verify(file);
      console.log(`Already verified: ${file.path}`);
      continue;
    } catch {
      /* absent or stale */
    }
    console.log(`Downloading ${file.path} (${file.bytes} bytes)`);
    const response = await fetch(file.url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(`DOWNLOAD_FAILED: ${response.status} ${file.url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length !== file.bytes || sha256(buffer) !== file.sha256)
      throw new Error(`SOURCE_HASH_MISMATCH: ${file.path}`);
    await mkdir(dirname(destination(file.path)), { recursive: true });
    await writeFile(destination(file.path), buffer);
  }
  const runtime = await installedRuntime(root, candidate.adapter);
  for (const file of runtime.files) {
    await mkdir(dirname(destination(file.path)), { recursive: true });
    await copyFile(
      resolve(runtime.source, basename(file.path)),
      destination(file.path),
    );
    await verify(file);
  }
  const files = [
    ...candidate.files.map(({ url, ...file }) => file),
    ...runtime.files,
  ];
  const manifest = {
    modelId: id,
    revision: candidate.revision,
    runtime: runtime.metadata,
    files,
  };
  validateModelManifest(manifest, candidate, runtime);
  await mkdir(dirname(destination(manifestPath)), { recursive: true });
  await writeFile(
    destination(manifestPath),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `Prepared ${id}: ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes including runtime`,
  );
} else
  throw new Error(
    "Usage: node scripts/model-assets.mjs prepare|verify [modelId]",
  );
