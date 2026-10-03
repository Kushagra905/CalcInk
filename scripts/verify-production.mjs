import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const mockBuild = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--mode", "mock"],
  { encoding: "utf8" },
);
assert.notEqual(mockBuild.status, 0, "Production must reject mock mode");
assert.match(mockBuild.stderr, /Mock recognition is development-only/);

const files = readdirSync("dist", {
  recursive: true,
  withFileTypes: true,
}).filter((entry) => entry.isFile());
assert(
  files.some((entry) => entry.name === "index.html"),
  "Run npm run build first",
);
for (const file of files) {
  assert.doesNotMatch(file.name, /mock\.worker/);
  assert.doesNotMatch(
    readFileSync(join(file.parentPath, file.name), "utf8"),
    /CALCINK_DEVELOPMENT_MOCK|Fixture capture|Synthetic 18\+4/,
    `Mock content leaked into ${file.name}`,
  );
}
console.log(
  "Production verified: mock mode rejected; no mock worker or fixture UI in the bundle.",
);
