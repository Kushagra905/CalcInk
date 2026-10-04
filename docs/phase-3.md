# Phase 3: reactive recognition and inline results

## Implementation

- Production `connect.ts` uses the catalog's selected TrOCR candidate. The lab and asset
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

The optional real-model browser test needs comparison assets and does not demonstrate
TrOCR recognition:

```powershell
npm run assets:prepare -- ink-on-comer-int8
npm run assets:verify -- ink-on-comer-int8
$env:CALCINK_MODEL_TEST = '1'
npm run test:e2e -- --workers=2
Remove-Item Env:\CALCINK_MODEL_TEST
```

### Commit boundary

The assistant leaves these changes uncommitted on the existing recognition branch.
Review and stage only these files; the unrelated accidental untracked file stays excluded.

```powershell
git add -- src/recognition/coordinator.ts src/recognition/trial-client.ts src/app/Notebook.tsx src/dev/mockCoordinator.ts src/dev/mock.worker.ts tests/unit/foundation.test.ts tests/unit/trial-client.test.ts tests/unit/blank-ink.test.ts tests/e2e/results-erasers.spec.ts README.md docs/phase-3.md
git diff --cached --check
git --no-pager diff --cached --stat
git commit -m "feat(recognition): complete phase 3 scheduling and recovery"
git push origin b/recognition-foundation
```

## Developer B verification — 4 October 2026

- TypeScript/Biome passed with ten existing lint warnings and one informational finding.
- All 157 unit tests across ten files passed.
- All 24 Chromium tests passed in the final full run with two workers, including the
  local ink-on WASM smoke test, normalized LaTeX display, controlled stale replies,
  automatic timeout recovery and manual retry with ink/history preservation.
- Notebook and model-lab builds passed; production mock/capture exclusion passed.
- Working-tree whitespace checks passed. No commit, staging or push was performed.

An earlier four-worker run hit a timeout in the existing multi-device export test; it
passed in the final two-worker run. The new LaTeX regression also uncovered a real
Windows dev-worker import failure, fixed by URL-safe fixture transport. The existing
stale-reply browser check now controls reply release instead of relying on a brief status window.

These checks establish engineering integration, not real handwriting accuracy, a 60 FPS
measurement, offline readiness, or TrOCR inference. The genuine selected-model exit
demonstration remains pending for the reason below.

## Earlier integration evidence and remaining requirement

TypeScript/Biome, 56 unit tests, the full 21-test Chromium suite, both builds and local
comparison asset verification passed on October 4, 2026. Browser checks cover inline
answers, Undefined, overflow, delayed replies during an edit, other-row preservation,
clear/undo and readiness while drawing. Unit checks exercise 100 queued replacements,
fresh epochs, ten-second timeouts, the restart limit, disposal, foreign errors and tampered
weight manifests. Automated fixtures remain clearly labeled and are not handwriting evidence.

The real-model browser test initializes and runs ink-on locally without external requests;
it also verifies that the selected TrOCR default remains blocked. It does not verify TrOCR
inference or accuracy. TrOCR asset preparation currently fails with MODEL_LICENSE_UNRESOLVED.
The genuine TrOCR 18+4×3= → 30 demonstration, handwriting benchmark, latency/resource
measurements and license evidence remain pending. Phase 3's engineering is implemented;
its real TrOCR exit demonstration has not been completed.

A separate production-build Chromium check passed: the real notebook shows the selected
TrOCR gate, contains no mock UI, accepts ink and preserves its exact bitmap on retry.
There were no browser errors or external requests. The temporary preview/browser were stopped.

Offline readiness/deployment remains Phase 5; physical-device/performance QA remains Phase 6.
