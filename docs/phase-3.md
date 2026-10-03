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
- Empty/completely masked rows clear without model inference. Masked blankness is checked
  once per completed edit, using shared compositing; it is not a per-pointer scan.
- Ten seconds without an inference result terminates the worker and permits one automatic
  restart. A repeated timeout or initialization failure remains visible and retryable.
  Manual retry resets the restart allowance and preserves all ink/history.
- Accepted numeric answers and Undefined use the separate result canvas. Position is
  surviving ink's right edge +12 at the fixed row baseline. Font shrinks from 32 to 16
  logical units. Failure to fit produces Leave room after =, with no wrapping/overwriting.
- Status distinguishes readiness, unfinished expressions, malformed writing, unrecognized
  output and runtime failure. Equivalent * and / operators display as × and ÷. The model
  receives ink operations only; paper, status, cursor and result pixels stay outside crops.

## Evidence and remaining requirement

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
