import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import {
  assetPath,
  installedRuntime,
  sha256,
  validateModelManifest,
  verifyAsset,
} from "../../scripts/asset-manifest.mjs";

const weight = {
  path: "models/example/encoder.onnx",
  bytes: 4,
  sha256: sha256(Buffer.from("ink!")),
};
const wasm = {
  path: "runtime/ink-on/ort-wasm.wasm",
  bytes: 4,
  sha256: sha256(Buffer.from("wasm")),
};
const candidate = { modelId: "example", revision: "pinned", files: [weight] };
const runtime = {
  metadata: { package: "onnxruntime-web", version: "1.22.0" },
  files: [wasm],
};
function manifest() {
  return structuredClone({
    modelId: candidate.modelId,
    revision: candidate.revision,
    runtime: runtime.metadata,
    files: [weight, wasm],
  });
}

async function temporaryRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), "calcink-assets-test-"));
  t.after(async () => {
    const suffix = relative(resolve(tmpdir()), resolve(root));
    assert(!isAbsolute(suffix) && !suffix.startsWith(`..${sep}`));
    assert(suffix.startsWith("calcink-assets-test-"));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test("anchors runtime provenance to the installed package and matching lockfile", async (t) => {
  const root = await temporaryRoot(t);
  const directory = resolve(root, "node_modules/onnxruntime-web");
  await mkdir(resolve(directory, "dist"), { recursive: true });
  await writeFile(resolve(root, "package.json"), "{}");
  await writeFile(resolve(directory, "index.js"), "");
  await writeFile(
    resolve(directory, "package.json"),
    JSON.stringify({
      name: "onnxruntime-web",
      version: "1.22.0",
      main: "index.js",
    }),
  );
  await writeFile(resolve(directory, "dist/ort-wasm.wasm"), "wasm");
  const lockPath = resolve(root, "package-lock.json");
  await writeFile(
    lockPath,
    JSON.stringify({
      packages: { "node_modules/onnxruntime-web": { version: "0.0.0" } },
    }),
  );
  await assert.rejects(
    installedRuntime(root, "ink-on"),
    /RUNTIME_LOCK_MISMATCH/,
  );
  await writeFile(
    lockPath,
    JSON.stringify({
      packages: { "node_modules/onnxruntime-web": { version: "1.22.0" } },
    }),
  );
  const actual = await installedRuntime(root, "ink-on");
  assert.deepEqual(actual.metadata, runtime.metadata);
  assert.deepEqual(actual.files, [wasm]);
});

test("accepts an exact model and installed runtime manifest", () => {
  validateModelManifest(manifest(), candidate, runtime);
});
test("rejects missing runtime provenance and incompatible runtime versions", () => {
  const legacy = manifest();
  delete legacy.runtime;
  assert.throws(
    () => validateModelManifest(legacy, candidate, runtime),
    /RUNTIME_MANIFEST_MISMATCH/,
  );
  const foreign = manifest();
  foreign.runtime.version = "0.0.0";
  assert.throws(
    () => validateModelManifest(foreign, candidate, runtime),
    /RUNTIME_MANIFEST_MISMATCH/,
  );
});
test("rejects a regenerated manifest that legitimizes changed runtime bytes", () => {
  const modified = manifest();
  modified.files[1].sha256 = sha256(Buffer.from("fake"));
  assert.throws(
    () => validateModelManifest(modified, candidate, runtime),
    /ASSET_MANIFEST_MISMATCH/,
  );
});
test("rejects missing, duplicate and unexpected model/runtime entries", () => {
  const variants = [
    [weight],
    [weight, wasm, wasm],
    [weight, { ...wasm, path: "runtime/ink-on/unknown.wasm" }],
    [weight, wasm, { ...weight, path: "models/example/extra.onnx" }],
  ];
  for (const files of variants)
    assert.throws(() =>
      validateModelManifest({ ...manifest(), files }, candidate, runtime),
    );
});
test("rejects model revision changes and altered pinned weight hashes", () => {
  const changed = manifest();
  changed.revision = "another";
  assert.throws(() => validateModelManifest(changed, candidate, runtime));
  const tampered = manifest();
  tampered.files[0].sha256 = wasm.sha256;
  assert.throws(() => validateModelManifest(tampered, candidate, runtime));
});
test("rejects traversal, absolute, encoded and query-bearing asset paths", () => {
  for (const path of [
    "../file",
    "/models/file",
    "C:/models/file",
    "models\\file",
    "models/%2e%2e/file",
    "runtime/file?other=1",
    "runtime/file#fragment",
    ".",
  ])
    assert.throws(
      () => assetPath(resolve("public"), path),
      /INVALID_ASSET_PATH/,
    );
});
test("verifies actual bytes and rejects same-size corruption or missing files", async (t) => {
  const root = await temporaryRoot(t);
  const path = assetPath(root, weight.path);
  await mkdir(resolve(root, "models/example"), { recursive: true });
  await writeFile(path, "ink!");
  await verifyAsset(root, weight);
  await writeFile(path, "bad!");
  await assert.rejects(verifyAsset(root, weight), /ASSET_VERIFICATION_FAILED/);
  await rm(path);
  await assert.rejects(verifyAsset(root, weight), /ENOENT/);
});
