import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assetPath,
  installedRuntime,
  sha256,
  validateModelManifest,
} from "./asset-manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = new URL(
  process.argv[2] ?? "https://kushagra905.github.io/CalcInk/",
);
assert(
  base.protocol === "https:" ||
    (base.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(base.hostname)),
  "Deployment must use HTTPS, except a local preview",
);
assert(
  base.pathname.endsWith("/") && !base.search && !base.hash,
  "Use the app's base URL ending in /",
);
const catalog = JSON.parse(
  await readFile(resolve(root, "assets/model-candidates.json"), "utf8"),
);
const candidate = catalog.candidates.find(
  (item) => item.modelId === catalog.selectedModelId,
);
assert(
  candidate && candidate.license.status !== "missing",
  "MODEL_NOT_RELEASE_READY",
);

async function download(path) {
  assetPath(root, path);
  const url = new URL(path, base);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  assert(
    response.ok,
    `DEPLOYED_ASSET_MISSING: ${path} (HTTP ${response.status})`,
  );
  const final = new URL(response.url);
  assert(
    final.origin === base.origin && final.pathname.startsWith(base.pathname),
    "DEPLOYMENT_REDIRECT_OUTSIDE_BASE",
  );
  return Buffer.from(await response.arrayBuffer());
}

const manifest = JSON.parse(
  (await download("offline-manifest.json")).toString(),
);
assert.match(manifest.version, /^[a-f0-9]{24}$/);
if (process.env.CALCINK_EXPECTED_VERSION)
  assert.equal(
    manifest.version,
    process.env.CALCINK_EXPECTED_VERSION,
    "DEPLOYED_BUILD_VERSION_MISMATCH",
  );
assert.equal(manifest.modelId, candidate.modelId);
assert.equal(manifest.revision, candidate.revision);
assert(
  Array.isArray(manifest.assets) && manifest.assets.length > 0,
  "EMPTY_OFFLINE_MANIFEST",
);
const entries = new Map();
for (const file of manifest.assets) {
  assetPath(root, file.path);
  assert(!entries.has(file.path), "DUPLICATE_ASSET_PATH");
  assert(
    Number.isSafeInteger(file.bytes) && file.bytes > 0,
    "INVALID_ASSET_SIZE",
  );
  assert.match(file.sha256, /^[a-f0-9]{64}$/);
  entries.set(file.path, file);
}
for (const path of ["index.html", "model-license.txt", "model-attribution.txt"])
  assert(entries.has(path), `DEPLOYMENT_METADATA_MISSING: ${path}`);
const modelPath = `models/${candidate.modelId}/manifest.json`;
assert(entries.has(modelPath), "MODEL_MANIFEST_MISSING");
const modelBytes = await download(modelPath);
const modelManifest = JSON.parse(modelBytes.toString());
validateModelManifest(
  modelManifest,
  candidate,
  await installedRuntime(root, candidate.adapter),
);
for (const file of modelManifest.files) {
  assert.deepEqual(
    entries.get(file.path),
    file,
    `OFFLINE_MODEL_ENTRY_MISMATCH: ${file.path}`,
  );
}
let total = 0;
for (const file of entries.values()) {
  const data = file.path === modelPath ? modelBytes : await download(file.path);
  assert.equal(
    data.length,
    file.bytes,
    `DEPLOYED_ASSET_SIZE_MISMATCH: ${file.path}`,
  );
  assert.equal(
    sha256(data),
    file.sha256,
    `DEPLOYED_ASSET_HASH_MISMATCH: ${file.path}`,
  );
  if (file.path === "index.html") {
    assert(
      data
        .toString()
        .includes(`<meta name="calcink-build" content="${manifest.version}">`),
      "DEPLOYED_HTML_VERSION_MISMATCH",
    );
    assert.doesNotMatch(
      data.toString(),
      /CALCINK_DEVELOPMENT_MOCK|Fixture capture/,
    );
  }
  total += data.length;
}
const worker = (await download("service-worker.js")).toString();
assert(
  worker.includes(`"version":"${manifest.version}"`),
  "DEPLOYED_SERVICE_WORKER_VERSION_MISMATCH",
);
console.log(
  `Deployment verified: ${base.href} · build ${manifest.version} · ${entries.size} assets · ${total} verified bytes`,
);
console.log(
  "HTTP/hash verification only; genuine handwriting and browser offline acceptance require separate evidence.",
);
