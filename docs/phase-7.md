# Phase 7: reproducibility and submission

## Scope and status

This batch supplies the missing architecture, model attribution, product usage,
screenshots, live-demo script, consolidated owner checklist and manual-result record.
The clean setup/browser measurements below are automated engineering evidence.
Final acceptance stays **HOLD** until genuine evaluation and physical results are
recorded and both developers approve the exact release candidate.

See [the single release checklist](release-checklist.md) for every remaining A/B/joint item.

## Clean setup

A separate fresh HTTPS clone of `b/recognition-foundation` at
`15c25c4f69fb69abc1d0c1cb95b3b7b272fb79e9` was made into an empty directory.
The clone contained no preexisting model, runtime, build or `node_modules` directories.
`npm ci` installed 94 packages using the committed lockfile and reported zero audit
vulnerabilities. The global npm download cache may have been reused; this is not a
guaranteed cold network/download timing experiment.

Commands and actual results are retained in
[the clean setup evidence](evidence/phase-7-clean-setup.json). Engineering browser
results from the same source tree are in
[the browser evidence](evidence/phase-7-browser-checks.json).
Documentation/screenshots in this batch do not change the product/runtime source.

| Check | Result |
|---|---|
| Locked install | Passed; 94 packages installed; zero reported audit vulnerabilities. |
| TypeScript/Biome | Passed; six preexisting warnings. |
| Unit and asset tests | 187 unit tests across 13 files and eight asset tests passed. |
| Asset preparation/verification | Passed from the fresh clone; no copied developer model files. |
| Pages/lab builds and production isolation | Passed; production version `65c8f66148592467556514b6`. |
| Model-enabled development browser suite | All 26 tests passed with two workers. |
| Final evaluator browser/CLI regression | Passed using explicitly synthetic inputs; no genuine accuracy claim. |
| Production offline suites | Five checks passed in Chromium and five in installed Edge. |
| Public HTTP/hash verifier | Passed: 21 critical assets, 42,004,089 verified bytes. |
| Public disconnected browser inference | Passed in Chromium and Edge with synthetic inputs; genuine correct arithmetic remains unverified. |
| Desktop/narrow production screenshots | Captured and inspected, Ready offline, no horizontal overflow or page errors. |

### Reproduce

Use Node.js >=22.12 (the workflow uses Node.js 24) and Git:

```powershell
git clone https://github.com/Kushagra905/CalcInk.git CalcInk
Set-Location CalcInk
# For an exact reproduction, checkout the commit recorded in the evidence first.
npm ci
npm run check
npm run test:unit
npm run test:assets
npm run assets:prepare
npm run assets:verify
npm run build:pages
npm run build:lab
npm run verify:production
npx playwright install chromium
```

`assets:prepare` initially needs network access and obtains hash-pinned weights;
production browser inference uses local files. Generated assets stay ignored.
The model lab defaults to port 4173 in preview. It must not run concurrently with
the development mock server on that same port.

For the development interaction suite on Windows, start a separate mock server:

```powershell
npm run dev:mock -- --port 4173 --strictPort
```

In a second terminal, enable the real-model check alongside the other browser tests:

```powershell
$env:CALCINK_MODEL_TEST = '1'
npm run test:e2e -- --workers=2
Remove-Item Env:CALCINK_MODEL_TEST
```

The normal config reuses the already running local server when CI is not set. Stop
that server with Ctrl+C before moving to the lab preview.

For prefixed production offline checks, use a separate preview:

```powershell
npm run preview -- --port 4183 --strictPort --base /CalcInk/
```

In the second terminal:

```powershell
$env:CALCINK_EXTERNAL_SERVER = '1'
npm run test:offline
# Set CALCINK_BROWSER_CHANNEL=msedge to repeat on installed Edge.
Remove-Item Env:CALCINK_EXTERNAL_SERVER
npm run verify:deployed
npm run test:public
```

Stop previews after testing. Firefox/Safari/mobile and physical pen latency are not
established by Chromium/Edge automation. Existing performance measurements remain
in [performance.md](performance.md); this documentation batch introduces no new
runtime or rendering behavior requiring another optional 200-cycle experiment.

## Submission package

- Public repository and accepted commit/tag.
- [Public app](https://kushagra905.github.io/CalcInk/) and verified build version.
- [README usage/setup](../README.md), [architecture](architecture.md) and
  [model attribution](model-attribution.md).
- Genuine handwriting reports, their frozen artifact identity, device/browser
  details, exact transcription/arithmetic metrics and actual failed sample IDs.
- [Performance](performance.md), clean setup and public offline evidence.
- Completed [physical/offline acceptance](manual-acceptance.md), genuine
  [demo](demo.md) recording and both developers' final sign-off.

Verify the organizer's actual submission fields, deadline and demo requirements.
The prepared script and project targets do not replace the official instructions.
After final approval, tag the accepted main commit and submit the same tested version.
