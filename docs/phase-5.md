# Phase 5: offline preparation with ink-on

## Status and model decision

The user changed the current model choice to ink-on CoMER INT8 on October 4, 2026.
Notebook, model lab and asset tooling read selectedModelId from the same catalog.
TrOCR remains an optional candidate with its unchanged license gate.

Local offline engineering and production checks are implemented. Public deployment and
the genuine handwritten offline arithmetic acceptance sequence remain pending. Two
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

The checks workflow prepares assets and runs this prefixed production suite; it does not
publish the site. Developer B still needs the Pages deployment integration/public URL.
Repeat genuine arithmetic, editing, both erasers, undo/redo, clear and a fresh calculation
after disconnected reload on that public production build. Record device/browser and
actual outcomes. Phase 5 is not fully accepted until that sequence succeeds.

Phase 1 still needs 24 genuine development samples and a measured trial. Keep the 50
held-out samples separate for Phase 6. Physical input, performance and release QA remain
Phase 6; final clean setup/docs/demo remain Phase 7.
