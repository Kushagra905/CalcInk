import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(root, "public");
const catalog = JSON.parse(
  await readFile(resolve(root, "assets/model-candidates.json"), "utf8"),
);
const mode = process.argv[2] ?? "prepare";
const id = process.argv[3] ?? "ink-on-comer-int8";
const candidate = catalog.candidates.find((item) => item.modelId === id);
if (!candidate) throw new Error("UNKNOWN_MODEL");
if (candidate.license.status === "missing")
  throw new Error(
    `MODEL_LICENSE_UNRESOLVED: ${id}; record explicit weight-license evidence before preparing assets`,
  );

function destination(path) {
  const target = resolve(publicRoot, path);
  const suffix = relative(publicRoot, target);
  if (
    !suffix ||
    isAbsolute(suffix) ||
    suffix === ".." ||
    suffix.startsWith(`..${sep}`) ||
    resolve(target) === publicRoot
  )
    throw new Error("INVALID_ASSET_PATH");
  return target;
}
function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
async function verify(file) {
  const buffer = await readFile(destination(file.path));
  if (buffer.length !== file.bytes || hash(buffer) !== file.sha256)
    throw new Error(`ASSET_VERIFICATION_FAILED: ${file.path}`);
}
async function packageRoot(name, from = root) {
  const require = createRequire(resolve(from, "package.json"));
  let directory = dirname(require.resolve(name));
  while (true) {
    try {
      const metadata = JSON.parse(
        await readFile(resolve(directory, "package.json"), "utf8"),
      );
      if (metadata.name === name) return directory;
    } catch {
      /* continue up to package root */
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`PACKAGE_NOT_FOUND: ${name}`);
    directory = parent;
  }
}

const manifestPath = `models/${id}/manifest.json`;
if (mode === "verify") {
  const manifest = JSON.parse(
    await readFile(destination(manifestPath), "utf8"),
  );
  if (manifest.modelId !== id || manifest.revision !== candidate.revision)
    throw new Error("MODEL_MANIFEST_MISMATCH");
  for (const file of candidate.files) {
    const declared = manifest.files.find((item) => item.path === file.path);
    if (
      !declared ||
      declared.sha256 !== file.sha256 ||
      declared.bytes !== file.bytes
    )
      throw new Error("MODEL_MANIFEST_MISMATCH");
  }
  if (!manifest.files.some((file) => file.path.startsWith("runtime/")))
    throw new Error("RUNTIME_MANIFEST_MISSING");
  for (const file of manifest.files) await verify(file);
  console.log(`Verified ${id}: ${manifest.files.length} model/runtime files`);
} else if (mode === "prepare") {
  for (const file of candidate.files) {
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
    if (buffer.length !== file.bytes || hash(buffer) !== file.sha256)
      throw new Error(`SOURCE_HASH_MISMATCH: ${file.path}`);
    await mkdir(dirname(destination(file.path)), { recursive: true });
    await writeFile(destination(file.path), buffer);
  }
  const from =
    candidate.adapter === "trocr"
      ? await packageRoot("@huggingface/transformers")
      : root;
  const runtime = await packageRoot("onnxruntime-web", from);
  const runtimeDist = resolve(runtime, "dist");
  const runtimeFiles = [];
  for (const name of await readdir(runtimeDist)) {
    if (
      !name.startsWith("ort-wasm") ||
      (!name.endsWith(".wasm") && !name.endsWith(".mjs"))
    )
      continue;
    const path = `runtime/${candidate.adapter}/${name}`;
    await mkdir(dirname(destination(path)), { recursive: true });
    await copyFile(resolve(runtimeDist, name), destination(path));
    const buffer = await readFile(destination(path));
    runtimeFiles.push({ path, bytes: buffer.length, sha256: hash(buffer) });
  }
  if (!runtimeFiles.length) throw new Error("RUNTIME_FILES_NOT_FOUND");
  const files = [
    ...candidate.files.map(({ url, ...file }) => file),
    ...runtimeFiles,
  ];
  const manifest = { modelId: id, revision: candidate.revision, files };
  await mkdir(dirname(destination(manifestPath)), { recursive: true });
  await writeFile(
    destination(manifestPath),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    `Prepared ${id}: ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes including runtime`,
  );
} else
  throw new Error(
    "Usage: node scripts/model-assets.mjs prepare|verify [modelId]",
  );
