# Phase 3: reactive recognition and inline results

The current selected model is ink-on CoMER INT8, following the user's later decision.
The notebook and production offline build run real ink-on locally. Its genuine handwritten
arithmetic/edit demonstration and 24-sample evaluation remain pending. TrOCR's licensing
gate remains on that optional candidate; it no longer blocks the selected application.

## Implementation

- Production `connect.ts` uses the catalog's selected candidate. The lab and asset
  commands use that same choice. The existing license gate remains enforced.
- Notebook and development fixtures use one coordinator, TrialClient and nested worker
  protocol. The obsolete duplicate flat protocol/model adapter placeholders were removed;
  `contracts.ts` retains the accepted UI callback API and re-exports shared result types.
- Store events clear affected answers synchronously. The store alone advances epoch/row
  revisions; the coordinator owns scheduling and the client owns monotonic request IDs.
- A completed edit waits 350 ms. There is one active inference and one latest pending
  snapshot per row. Ready jobs prefer the most recently edited row. Active gestures defer
  their row; cancellation schedules its unchanged committed ink at the current revision.
- Both the client and coordinator check reply identity. Old results/errors cannot change
  the current page after replacement, clear, undo/redo, retry, unload or disposal.
- Rows without strokes clear without a worker request. Rows containing pixel masks are
  composited inside the worker; if no ink survives, the adapter returns empty bounds/text
  before tensor preparation or model inference. Recognition image scans never run in the coordinator.
- Ten seconds without an inference result terminates the worker and permits one automatic
  restart. A repeated timeout or initialization failure remains visible and retryable.
  Manual retry resets the restart allowance and preserves all ink/history.
- Accepted numeric answers and Undefined use the separate result canvas. Position is
  surviving ink's right edge +12 at the fixed row baseline. Font shrinks from 32 to 16
  logical units. Failure to fit produces Leave room after =, with no wrapping/overwriting.
- Status distinguishes readiness, unfinished expressions, malformed writing, unrecognized
  output and runtime failure. Equivalent * and / operators display as × and ÷. The model
  receives ink operations only; paper, status, cursor and result pixels stay outside crops.
- Row feedback uses normalized arithmetic when available, including supported LaTeX
  operator/wrapper output. Raw transcripts remain intact in responses and benchmarks;
  unsupported text remains visible without inventing a replacement expression.
- Unload, disposal and a replacement load abort an outstanding manifest request. Obsolete
  download failures cannot replace the current loading state or create a stray worker.

## Developer B completion

The coordinator and result canvas were already integrated through Developer A's merge.
This continuation completes the UI-thread boundary, download cleanup and readable feedback,
then expands failure/recovery regression coverage on `b/recognition-foundation`.

| File | Work in this continuation |
| --- | --- |
| `src/recognition/coordinator.ts` | Removed recognition rasterization from the UI thread; retained structural empty-row detection, debounce and bounded scheduling. |
| `src/recognition/trial-client.ts` | Added cancellation for manifest fetch/body consumption on unload and replacement, combined with the existing timeout. |
| `src/app/Notebook.tsx` | Displays normalized supported arithmetic while retaining the raw response. |
| `src/dev/mockCoordinator.ts`, `src/dev/mock.worker.ts` | Transports UTF-8 fixture text as URL-safe Base64 so LaTeX backslashes cannot break Windows development-worker imports. Production recognition remains separate. |
| `tests/unit/foundation.test.ts` | Covers no UI-thread recognition canvas, ready-row scheduling, empty-row removal and obsolete worker replies after retry. |
| `tests/unit/trial-client.test.ts` | Exercises all five reply identity fields for results/errors and download cancellation/replacement. |
| `tests/unit/blank-ink.test.ts` | Uses the real ink-on adapter with mocked raster/runtime dependencies to verify empty surviving ink skips tensor preparation and inference. Pixel geometry is checked separately by browser replay tests. |
| `tests/e2e/results-erasers.spec.ts` | Adds normalized LaTeX display, manual retry with intact ink/history and recovery after one ten-second timeout. The stale-result test holds/releases a real fixture-worker reply explicitly rather than depending on a transient timing window. |
| `README.md`, this file | Current behavior, verification and commit boundary. |

### Verify locally

```powershell
npm run check
npm run test:unit
npm run test:e2e -- --workers=2
npm run build
npm run build:lab
npm run verify:production
```

The optional real-model browser test uses the selected ink-on assets and checks
the optional TrOCR licensing gate:

```powershell
npm run assets:prepare -- ink-on-comer-int8
npm run assets:verify -- ink-on-comer-int8
$env:CALCINK_MODEL_TEST = '1'
npm run test:e2e -- --workers=2
Remove-Item Env:\CALCINK_MODEL_TEST
```

These changes were committed as `71133b3` and merged into `main` through PR #6.
They are preserved alongside the ink-on selection and Phase 5 offline implementation.

## Developer B verification — 4 October 2026

- TypeScript/Biome passed with ten existing lint warnings and one informational finding.
- All 157 unit tests across ten files passed.
- All 24 Chromium tests passed in the final full run with two workers, including the
  local ink-on WASM smoke test, normalized LaTeX display, controlled stale replies,
  automatic timeout recovery and manual retry with ink/history preservation.
- Notebook and model-lab builds passed; production mock/capture exclusion passed.
- Working-tree whitespace checks passed before Developer B's commit.

An earlier four-worker run hit a timeout in the existing multi-device export test; it
passed in the final two-worker run. The new LaTeX regression also uncovered a real
Windows dev-worker import failure, fixed by URL-safe fixture transport. The existing
stale-reply browser check now controls reply release instead of relying on a brief status window.

These checks establish engineering integration, not real handwriting accuracy, a 60 FPS
measurement, offline readiness, or TrOCR inference. The genuine selected ink-on exit
demonstration remains pending handwriting validation.

## Earlier TrOCR-selected milestone evidence

TypeScript/Biome, 56 unit tests, the full 21-test Chromium suite, both builds and local
comparison asset verification passed on October 4, 2026. Browser checks cover inline
answers, Undefined, overflow, delayed replies during an edit, other-row preservation,
clear/undo and readiness while drawing. Unit checks exercise 100 queued replacements,
fresh epochs, ten-second timeouts, the restart limit, disposal, foreign errors and tampered
weight manifests. Automated fixtures remain clearly labeled and are not handwriting evidence.

At that earlier milestone, the real-model browser test initialized and ran ink-on locally
without external requests; it also verified that the then-selected TrOCR default remained
blocked. It did not verify TrOCR
inference or accuracy. TrOCR asset preparation currently fails with MODEL_LICENSE_UNRESOLVED.
The genuine TrOCR 18+4×3= → 30 demonstration, handwriting benchmark, latency/resource
measurements and license evidence were pending. TrOCR was subsequently replaced by ink-on;
these observations describe the earlier selection rather than the current exit requirement.

A separate production-build Chromium check passed: the real notebook shows the selected
TrOCR gate, contains no mock UI, accepts ink and preserves its exact bitmap on retry.
There were no browser errors or external requests. The temporary preview/browser were stopped.

## Current ink-on milestone

The 56 unit tests and 21 model-enabled development browser tests passed again after the
selection change. Five additional production offline checks passed with real ink-on,
including a fresh disconnected reload and input-dependent model transcripts.
Two synthetic engineering drawings decoded as `1==` and `4==`; the arithmetic parser
rejected their duplicate equals signs. These are measured failures, not valid calculations
or human handwriting evaluation. The release demonstration remains pending genuine inputs.

Phase 5 records cache/retry/update implementation and its local verification.
Public deployment acceptance and physical-device/performance QA remain pending.
