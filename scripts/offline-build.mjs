import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalog = JSON.parse(
  await readFile("assets/model-candidates.json", "utf8"),
);
const model = catalog.candidates.find(
  (item) => item.modelId === catalog.selectedModelId,
);
if (!model || model.license.status === "missing")
  throw new Error("MODEL_NOT_RELEASE_READY");
const root = resolve("dist");
if (!model.license.file) throw new Error("MODEL_LICENSE_FILE_MISSING");
await writeFile(
  resolve(root, "model-license.txt"),
  await readFile(model.license.file),
);
await writeFile(
  resolve(root, "model-attribution.txt"),
  `CalcInk model: ${model.modelId}\nRevision: ${model.revision}\nSource: ${model.source}\nLicense: ${model.license.id}\nEvidence: ${model.license.evidence}\n${model.license.note}\n`,
);
const htmlPath = resolve(root, "index.html");
const html = (await readFile(htmlPath, "utf8")).replace(
  /\s*<meta name="calcink-build" content="[a-f0-9]+">/,
  "",
);
await writeFile(htmlPath, html);
const modelPath = `models/${model.modelId}/manifest.json`;
const modelManifest = JSON.parse(
  await readFile(resolve(root, modelPath), "utf8"),
);
if (
  modelManifest.modelId !== model.modelId ||
  modelManifest.revision !== model.revision
)
  throw new Error("MODEL_MANIFEST_MISMATCH");
const source = await readFile("scripts/service-worker.js", "utf8");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const paths = (await readdir(root, { recursive: true })).map((path) =>
  path.replaceAll("\\", "/"),
);
const shellPaths = paths
  .filter(
    (path) =>
      /\.(?:html|js|css|svg|png|ico|woff2?|txt)$/.test(path) &&
      !path.startsWith("models/") &&
      !path.startsWith("runtime/") &&
      path !== "service-worker.js",
  )
  .sort();
if (!shellPaths.includes("index.html")) throw new Error("APP_SHELL_MISSING");
async function entry(path) {
  if (
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes(":") ||
    path.includes("\\")
  )
    throw new Error("INVALID_ASSET_PATH");
  const data = await readFile(resolve(root, path));
  return { path, bytes: data.length, sha256: hash(data) };
}
const shell = [];
for (const path of shellPaths) shell.push(await entry(path));
const critical = [];
for (const file of modelManifest.files) {
  const actual = await entry(file.path);
  if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256)
    throw new Error(`ASSET_VERIFICATION_FAILED: ${file.path}`);
  critical.push(actual);
}
for (const file of model.files)
  if (
    !critical.some(
      (item) =>
        item.path === file.path &&
        item.sha256 === file.sha256 &&
        item.bytes === file.bytes,
    )
  )
    throw new Error("MODEL_MANIFEST_MISMATCH");
if (!critical.some((file) => file.path.startsWith("runtime/")))
  throw new Error("RUNTIME_MANIFEST_MISSING");
critical.push(await entry(modelPath));
const version = hash(
  JSON.stringify({ shell, critical, revision: model.revision, source }),
).slice(0, 24);
await writeFile(
  htmlPath,
  html.replace(
    "<head>",
    `<head>\n    <meta name="calcink-build" content="${version}">`,
  ),
);
shell[shell.findIndex((file) => file.path === "index.html")] =
  await entry("index.html");
const manifest = {
  version,
  modelId: model.modelId,
  revision: model.revision,
  shell,
  assets: [...shell, ...critical],
};
const bytes = manifest.assets.reduce((sum, file) => sum + file.bytes, 0);
await writeFile(
  resolve(root, "offline-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await writeFile(
  resolve(root, "service-worker.js"),
  `self.CALCINK_OFFLINE_MANIFEST = ${JSON.stringify(manifest)};\n${source}`,
);
let artifactBytes = 0;
for (const path of await readdir(root, { recursive: true })) {
  const file = await stat(resolve(root, path));
  if (file.isFile()) artifactBytes += file.size;
}
if (artifactBytes >= 900_000_000)
  throw new Error("DEPLOYMENT_SIZE_TARGET_EXCEEDED");
console.log(
  `Offline build ${version}: ${manifest.assets.length} verified assets, ${bytes} cache bytes, ${artifactBytes} deployment bytes, ${model.modelId}`,
);
