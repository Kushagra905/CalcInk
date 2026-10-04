import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function assetPath(root, path) {
  if (
    typeof path !== "string" ||
    !/^[A-Za-z0-9_./-]+$/.test(path) ||
    path.startsWith("/") ||
    path.includes("..")
  )
    throw new Error("INVALID_ASSET_PATH");
  const target = resolve(root, path);
  const suffix = relative(root, target);
  if (!suffix || isAbsolute(suffix) || suffix.startsWith(`..${sep}`))
    throw new Error("INVALID_ASSET_PATH");
  return target;
}

async function packageRoot(name, from) {
  const require = createRequire(resolve(from, "package.json"));
  let directory = dirname(require.resolve(name));
  while (true) {
    try {
      const metadata = JSON.parse(
        await readFile(resolve(directory, "package.json"), "utf8"),
      );
      if (metadata.name === name) return { directory, metadata };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`PACKAGE_NOT_FOUND: ${name}`);
    directory = parent;
  }
}

/** Anchor generated runtime hashes to the installed package and committed lockfile. */
export async function installedRuntime(root, adapter) {
  const from =
    adapter === "trocr"
      ? (await packageRoot("@huggingface/transformers", root)).directory
      : root;
  const { directory, metadata } = await packageRoot("onnxruntime-web", from);
  const lock = JSON.parse(
    await readFile(resolve(root, "package-lock.json"), "utf8"),
  );
  const key = relative(root, directory).split(sep).join("/");
  if (
    metadata.name !== "onnxruntime-web" ||
    lock.packages?.[key]?.version !== metadata.version
  )
    throw new Error("RUNTIME_LOCK_MISMATCH");
  const source = resolve(directory, "dist");
  const files = [];
  for (const name of (await readdir(source)).sort()) {
    if (!/^ort-wasm.*\.(?:mjs|wasm)$/.test(name)) continue;
    const data = await readFile(resolve(source, name));
    files.push({
      path: `runtime/${adapter}/${name}`,
      bytes: data.length,
      sha256: sha256(data),
    });
  }
  if (!files.length) throw new Error("RUNTIME_FILES_NOT_FOUND");
  return {
    source,
    metadata: { package: metadata.name, version: metadata.version },
    files,
  };
}

export function validateModelManifest(manifest, candidate, runtime) {
  if (
    manifest.modelId !== candidate.modelId ||
    manifest.revision !== candidate.revision ||
    !Array.isArray(manifest.files)
  )
    throw new Error("MODEL_MANIFEST_MISMATCH");
  if (
    manifest.runtime?.package !== runtime.metadata.package ||
    manifest.runtime?.version !== runtime.metadata.version
  )
    throw new Error("RUNTIME_MANIFEST_MISMATCH: run npm run assets:prepare");
  const expected = [...candidate.files, ...runtime.files];
  const entries = new Map();
  for (const file of manifest.files) {
    assetPath(".", file.path);
    if (entries.has(file.path)) throw new Error("DUPLICATE_ASSET_PATH");
    entries.set(file.path, file);
  }
  if (entries.size !== expected.length)
    throw new Error("MODEL_MANIFEST_MISMATCH");
  for (const file of expected) {
    const declared = entries.get(file.path);
    if (
      !declared ||
      declared.bytes !== file.bytes ||
      declared.sha256 !== file.sha256
    )
      throw new Error(`ASSET_MANIFEST_MISMATCH: ${file.path}`);
  }
}

export async function verifyAsset(root, file) {
  const data = await readFile(assetPath(root, file.path));
  if (data.length !== file.bytes || sha256(data) !== file.sha256)
    throw new Error(`ASSET_VERIFICATION_FAILED: ${file.path}`);
}
