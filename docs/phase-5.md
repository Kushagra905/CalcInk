# Phase 5: offline preparation with ink-on

## Status and model decision

The user changed the current model choice to ink-on CoMER INT8 on October 4, 2026.
Notebook, model lab and asset tooling read selectedModelId from the same catalog.
TrOCR remains an optional candidate with its unchanged license gate.

Local offline engineering, deployment workflows and asset verification are implemented.
Phase 5 is merged into main as `2bffc0e`. Its Pages build passed, but deployment
run [37214914589](https://github.com/Kushagra905/CalcInk/actions/runs/37214914589)
failed with HTTP 404 and GitHub's instruction to enable Pages. Public publication
and genuine handwritten offline arithmetic acceptance remain pending. Two
synthetic smoke drawings decoded as 1== and 4==, which were correctly rejected; their
results prove input-dependent inference after reload, not successful handwriting accuracy.

## Implementation

- Production builds require assets:verify. offline-build.mjs reads the emitted shell and
  selected model/runtime manifest, verifies sizes/hashes and creates an immutable offline
  manifest and service worker. The version includes shell content, model revision and
  service-worker source. No generated weights or build output enter Git.
- The Pages build uses /CalcInk/. Asset URLs, worker registration, cache keys and navigation
  fallback derive from the actual base/scope. The root build remains available.
- Install verifies/caches shell files first. Offline preparation then verifies every
  critical model/runtime/manifest entry. Cache bytes are read and SHA-256 checked on each
  preparation; valid partial entries are reused on retry.
- Ready offline requires both verified caches and successful real model initialization.
  A deliberately failed model constructor with complete caches stays unready.
- Missing/corrupted entries revoke readiness; reconnect/retry repairs them. Quota errors
  provide a storage-specific retry message. Cache and model retries preserve ink/history.
- Critical fetches use the version's cache first. Missing entries never switch to a cloud
  model or another recognizer. Runtime/model settings remain local single-threaded WASM.
- Updates install into a separate version and wait for explicit activation. Reload is
  blocked while committed ink or a live gesture exists. Other CalcInk tabs must close
  before activation; a fresh gesture also prevents an automatic controller-change reload.
  Obsolete scoped caches retire only after the replacement activates.
- ink-on's upstream IndexedDB uses model URLs as keys. Engine URLs include the weight
  content hash to prevent an older model revision being reused under a stable pathname.
- The deployment includes the Apache-2.0 license and attribution as cached text files.
  The complete deployment artifact is checked against the 900 MB engineering ceiling.

## Local verification

On October 4, 2026, TypeScript/Biome, 56 unit tests and all 21 existing model-enabled
Chromium tests passed. The Pages build, lab build and five new production Chromium checks
passed. These additional checks use fresh profiles and real prepared ink-on assets:

1. Verified preparation under /CalcInk/, disconnected reload, new input-dependent inference,
   and no external runtime/model requests.
2. Complete verified caches plus failed model initialization cannot claim Ready offline.
3. Missing and same-size corrupted cached weights prevent readiness; reconnect repairs them
   without changing the committed bitmap.
4. Simulated native Cache.put quota failure is visible; manual retry preserves ink exactly.
5. A changed production build waits while ink exists, blocks activation with another tab,
   then activates/reloads explicitly and retires the old cache after the tab closes.

The checked prefixed build had 21 critical assets, 41,997,851 cache bytes and 90,747,913
total deployment bytes. This is an actual local artifact observation, not a size promise
for future builds. Bundler-emitted unused alternative-backend WASM files contribute to
deployment size; the selected engine's explicitly configured runtime files are cached.

The synthetic inputs produced invalid duplicate-equals transcripts. No model correction,
invented terminal equals, genuine sample, handwriting accuracy or p95 claim was added.

## Run and remaining acceptance

```sh
npm run assets:prepare
npm run build:pages
npm run preview -- --base /CalcInk/ --port 5174
# Open http://127.0.0.1:5174/CalcInk/
npm run test:offline
```

Feature-branch and PR checks prepare assets and run the prefixed production suite. The
main-branch Pages workflow now reuses those checks, uploads their tested `dist` artifact,
publishes it and verifies the public version and critical hashes. Publishing permissions
exist only in the deployment job. See [Pages setup and handoff](pages-deployment.md).
Repeat genuine arithmetic, editing, both erasers, undo/redo, clear and a fresh calculation
after disconnected reload on that public production build. Record device/browser and
actual outcomes. Phase 5 is not fully accepted until that sequence succeeds.

Phase 1 still needs 24 genuine development samples and a measured trial. Keep the 50
held-out samples separate for Phase 6. Physical input, performance and release QA remain
Phase 6; final clean setup/docs/demo remain Phase 7.

## Developer B: asset provenance and Pages delivery

Implemented on `b/recognition-foundation` on October 4, 2026. Developer A's service-worker
and readiness behavior remains the integrated implementation above.

### Asset and runtime verification

- Model downloads require an immutable 40-character source revision present in each
  HTTPS source URL. Prepared weights still require the catalog's exact size and SHA-256.
- Runtime files are derived from the installed ONNX package used by the selected adapter.
  Its version must match that package's committed lockfile entry. Generated manifests
  record the runtime package/version; verification compares every runtime size/hash to
  the installed source, rather than trusting a rewritten generated manifest.
- The manifest must contain exactly the pinned model and required runtime entries.
  Duplicate, unexpected, missing, incompatible or unsafe paths fail verification.
  `assets:prepare` upgrades older generated manifests without committing model binaries.
- The offline build uses the same provenance check and includes runtime version/backend
  details in cached attribution. Its existing 900 MB artifact ceiling remains enforced.

### Delivery workflow

- `ci.yml` is reusable. Feature pushes and PRs run checks; `pages.yml` calls the same
  checks on main before uploading the tested artifact. Main does not launch a second,
  duplicate standalone CI build. Manual Pages dispatch on another branch cannot publish.
- Checks install locked Node dependencies, validate code, run logic/asset regressions,
  prepare/verify assets, exercise the real ink-on worker, build under `/CalcInk/`, verify
  production isolation and run the five fresh-profile offline browser checks.
- Download caching is keyed by OS, model catalog, lockfile and asset tooling. Cache hits
  still pass preparation and verification; the installed runtime is recopied and verified.
- Actions are pinned to verified commit SHAs. Build/upload and public verification have
  read-only repository permissions. Only the publish job receives Pages/OIDC write access.
- The tested build version is carried through reusable-workflow outputs. After deployment,
  the read-only public check validates that exact version, model/runtime provenance and
  critical asset hashes. Three attempts allow brief publication propagation; failure
  remains visible and does not fabricate a successful deployment.

### Files changed in this continuation

| File | Responsibility |
| --- | --- |
| `.github/workflows/ci.yml` | Reusable verified build, download cache, real-model tests, tested-version output and conditional artifact upload. |
| `.github/workflows/pages.yml` | Main-only publication, scoped deployment permissions and public verification. |
| `scripts/asset-manifest.mjs` | Path, lockfile/runtime provenance and exact manifest validation. |
| `scripts/model-assets.mjs` | Immutable source checks, verified runtime copying and manifest metadata. |
| `scripts/offline-build.mjs` | Shared provenance gate and runtime attribution. |
| `scripts/verify-deployment.mjs` | Hosted build-version, required-file and hash audit. |
| `tests/scripts/asset-manifest.test.mjs` | Runtime mismatch, tampered manifest, invalid entries/paths and real same-size corruption regressions. |
| `package.json` | `test:assets` and `verify:deployed` commands; dependencies unchanged. |
| `README.md`, `docs/phase-5.md`, `docs/pages-deployment.md` | Current status, migration, publication and acceptance instructions. |

### Verification and remaining acceptance

Verified on October 4, 2026:

| Check | Result |
| --- | --- |
| TypeScript/Biome | Passed; six existing warnings remain. |
| Unit tests | All 178 passed. |
| Asset regression tests | All eight passed, including actual same-size corruption and installed/locked runtime mismatch. |
| Real-model development Chromium suite | All 24 passed. |
| Production offline Chromium suite | All five passed. |
| `assets:prepare` and `assets:verify` | Seven selected model/runtime files verified; runtime provenance recorded. |
| Pages and model-lab builds | Passed; production mock exclusion passed. |
| Workflow validation | Both workflows passed actionlint 1.7.12; action SHAs were checked against their official repositories. |
| Deployment verifier against local `/CalcInk/` preview | Passed: build `1d32557008d3e284ddc09a6d`, 21 assets, 42,004,002 verified bytes. |
| Deliberately wrong expected deployment version | Rejected with `DEPLOYED_BUILD_VERSION_MISMATCH`, as required. |
| Working-tree whitespace check | Passed. |

The current Pages artifact totals 90,754,064 bytes, below the existing 900 MB build ceiling.
No source or dependency changes were committed; generated models/builds remain ignored.
The local source tree matches main's latest merged tree before this continuation.

Developer B's Phase 5 implementation is complete. Public GitHub Pages returned HTTP 404
during this work; the new workflow has not been committed, run remotely or used to publish
a site. Enable Pages, commit and merge as documented in the handoff. Public publication,
hosted verification and the genuine handwritten offline sequence remain open acceptance
items. Local engineering checks do not establish a public or accuracy result.
