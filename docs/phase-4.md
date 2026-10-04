# Phase 4: stroke and pixel erasers

## Implementation

- Primary-pointer gestures capture their starting row, tool and fixed brush size. Pen
  width and eraser diameter are independent. Coalesced samples remain clipped to that row.
- Stroke erasing tests each swept circular brush against bounds and a cached flattening
  of the shared quadratic path, including pen radius. Flattening tolerance is 0.25 logical
  units. A bounded native alpha intersection applies only masks later than the candidate
  stroke, so an already erased region does not delete surviving distant ink.
- Hit strokes are removed provisionally; surviving operations keep their original order.
  A sweep may remove multiple strokes, but committing it produces one history command.
  Whole-stroke erasure adds no mask and remains usable at page capacity.
- Pixel erasing appends an immutable vector mask. Shared replay uses destination-out,
  diameter twice the radius, round caps/joins and visible single-point dabs. Masks affect
  earlier strokes only. New pen strokes remain visible over previous masks.
- Pixel preview starts from the saved committed bitmap and applies the provisional mask
  on animation frames. Whole-stroke preview replays only the affected row. Cancellation,
  lost capture, external clear/history or resize restores committed pixels and releases
  pointer capture. No partial gesture enters document history or recognition.
- A mask that touches no surviving ink and an empty stroke sweep create no history entry.
  Every gesture still follows store invalidation, so stale recognition cannot repaint it.
- Operation/point limits preserve current work and block additional pen/mask input at
  capacity. Stroke erasing, clear and undo can reduce content; failed commits restore ink.

## Verification

The full 21-test Chromium suite and 56 unit tests passed on October 4, 2026. Editing checks
include narrow-strip removal from a thick line, single-point masks/dots, tangent hits,
control-point rejection for a curved stroke, fast sweeps across multiple strokes,
starting-row clipping, masks followed by new ink, blank-row answer removal and exact
bitmap restoration on undo/redo and cancellation. Existing tests cover DPR 1/2/3 with
emulated mouse, pen and touch, and geometry after resize.

At canonical logical resolution, shared DOM/worker replay is checked byte-for-byte.
The actual scaled notebook/OffscreenCanvas comparison allows one byte for Chromium
antialias quantization in alpha/premultiplied color; this bound was measured on the failing
comparison before being applied. Undo/redo and cancellation checks remain byte-exact.

No genuine handwriting accuracy, physical pen/touch hardware, 60 FPS or release-level
performance result is claimed. Phase 5 records subsequent ink-on offline implementation
and verification; TrOCR remains an optional candidate with its existing runtime gate.

## Developer B: editing regressions and runtime cleanup

Implemented on `b/recognition-foundation` on October 4, 2026. The eraser geometry and
history above are Developer A's existing implementation. B's changes harden recognition
during those edits and cover resource ownership in both model adapters.

### Editing acceptance

- A deterministic 200-edit regression mixes drawing, whole-stroke erasing, clear,
  undo and redo across all three rows while an inference is active. After the held
  response is discarded, only the latest snapshot from each row is dispatched:
  four total requests, including the initial obsolete request. No old backlog drains.
- Erase/redraw followed by undo/redo schedules fresh request/revision identities.
  An obsolete replacement reply cannot overwrite restored ink. Supplied transcripts
  follow original, replacement, original, replacement; these are synthetic replies.
- A committed stroke and pixel mask copy and freeze points, bounds, width and radius.
  Mutating the caller's input afterward cannot change the saved undo/redo snapshot.
- Existing Chromium tests cover tangent hits, single-point dots/masks, fast sweeps,
  partial-width removal, new ink after masks, no-op erasing, cancellation, blank-row
  answer removal, exact bitmap history restoration and shared worker/UI compositing.

### Runtime ownership and recovery

- Concurrent initialization shares one load. Disposing during verification prevents
  session creation; disposing during session creation releases the late result.
- Concurrent inference is rejected with `ADAPTER_BUSY`. An active session stays alive
  until its inference settles; disposal prevents that result from being returned.
- `RecognitionAdapter.dispose()` permits an asynchronous result. The worker awaits
  TrOCR pipeline disposal when replacing or retiring its adapter. Repeated disposal
  shares the same release operation.
- Rasterization clears its temporary full-row surface, including blank/error paths.
  The returned crop belongs to the adapter. CoMER resizing clears its temporary target;
  both adapters clear their crop and TrOCR's white-background surface when finished.
  Preprocessed arrays and RawImage/streamer objects remain local to each inference.
- Initialization or inference failure retires the adapter. The worker emits
  `recoverable: false`, meaning a new worker is required. TrialClient validates the
  model and request identity before terminating that worker, clearing timers and
  rejecting the active request. Foreign fatal messages cannot terminate a valid job.
- Session cleanup failure preserves the original inference error. Worker termination
  is the fallback for failed opaque runtime allocations. Retry uses a fresh worker
  through the existing coordinator; document ink and history are retained.

The installed ink-on engine owns its private ONNX tensors and session releases. Its
private failure paths do not consistently use `finally`, so adapter cleanup alone is
not evidence that every private tensor is explicitly released. Retiring the worker
after failure bounds that runtime's lifetime. Memory stability during successful real
inference still needs measurement; the 200-edit unit regression is not a memory benchmark.

### Changed files

| File | Phase 4 change |
| --- | --- |
| `src/recognition/adapter.ts` | Allow awaited asynchronous adapter disposal. |
| `src/recognition/adapters/ink-on.ts` | Shared initialization, safe late disposal, overlap guard, crop/session cleanup. |
| `src/recognition/adapters/trocr.ts` | Shared initialization, awaited pipeline release, overlap guard, temporary image cleanup. |
| `src/recognition/rasterize.ts` | Clear temporary full-row/resized canvases; report unavailable contexts explicitly. |
| `src/recognition/trial-worker.ts` | Retire failed adapters and mark runtime errors as requiring worker replacement. |
| `src/recognition/trial-client.ts` | Terminate on matching fatal errors after validating identity. |
| `src/recognition/protocol.ts` | Document the worker-replacement meaning of `recoverable: false`. |
| `tests/unit/adapter-lifecycle.test.ts` | New lifecycle coverage for both adapters, including cleanup failure. |
| `tests/unit/arithmetic-worker.test.ts` | Failed load/inference retirement and original error propagation. |
| `tests/unit/trial-client.test.ts` | Matching fatal errors terminate; foreign identities are ignored. |
| `tests/unit/foundation.test.ts` | Bounded 200-edit scheduling and fresh erase/history snapshots. |
| `tests/unit/history.test.ts` | Frozen stroke/mask snapshots resist mutation of caller input. |
| `tests/e2e/model.spec.ts` | Repeated real ink-on inference, unload, fresh-worker reload and inference. |
| `README.md`, `docs/phase-4.md` | Runtime behavior, scope, verification and commit handoff. |

### Validation and remaining evidence

Verified on October 4, 2026:

| Check | Result |
| --- | --- |
| `npm run check` | Passed; six existing lint warnings and one informational suggestion remain. |
| `npm run test:unit` | 178 tests passed across 11 files; 21 added for Phase 4. |
| Chromium browser suite with `CALCINK_MODEL_TEST=1`, two workers | All 24 passed, including the real ink-on reuse/unload/reload test. |
| `npm run assets:verify -- ink-on-comer-int8` | Seven comparison model/runtime files verified. |
| `npm run build` | Notebook production build passed. |
| `npm run build:lab` | Model-lab production build passed. |
| `npm run verify:production` | Mock mode rejected; no mock worker or fixture UI in the production bundle. |

Developer B's Phase 4 engineering work is complete. The model-dependent demonstration
below remains an open acceptance item.

The adapter lifecycle tests mock both model runtimes. Their test-only TrOCR license
stub permits lifecycle coverage without weights; it supplies no license or recognition
evidence. The optional real WASM browser test explicitly uses ink-on comparison assets
and checks local requests, inference reuse and worker replacement. TrOCR was selected at
the time of this Phase 4 verification. The subsequent main-branch model decision selects
ink-on, as recorded in Phase 5; TrOCR's existing license/loading gate remains enforced.

The genuine handwriting demonstration `18+4×3= → 30`, erase `4` and write `5` → `33`,
then undo/redo through both answers remains pending the chosen model's real evaluation.
The same applies to removing a handwritten equals without retaining a numeric answer.
Synthetic arithmetic, editing and blank-row tests do not satisfy those recognition gates.
Physical pen/touch, 60 FPS and real memory measurements belong to final validation.

### Original Phase 4 commit handoff

Phase 4 was committed and pushed as `1154930` before the subsequent merge from main.
The commands below record that original handoff; they are not needed again for the merge.

Run these commands only after reviewing the changes. No commit or push is performed
by the implementation agent. Explicit paths exclude the unrelated accidental file.

```powershell
Set-Location 'C:\Users\kushagra\OneDrive\Desktop\hj\CalcInk'
git branch --show-current
git add -- README.md docs/phase-4.md src/recognition/adapter.ts src/recognition/adapters/ink-on.ts src/recognition/adapters/trocr.ts src/recognition/rasterize.ts src/recognition/trial-worker.ts src/recognition/trial-client.ts src/recognition/protocol.ts tests/unit/adapter-lifecycle.test.ts tests/unit/arithmetic-worker.test.ts tests/unit/trial-client.test.ts tests/unit/foundation.test.ts tests/unit/history.test.ts tests/e2e/model.spec.ts
git diff --cached --check
git --no-pager diff --cached --stat
git commit -m "fix(recognition): complete phase 4 editing and runtime cleanup"
git push origin b/recognition-foundation
```

The branch command should print `b/recognition-foundation`. If a check fails, fix it
before committing. Committing/pushing this branch does not merge it into `main`.

## Merge integration verification

The merge of main `8606ebc` into recognition branch `1154930` preserves B's Phase 4
cleanup and regressions alongside A's ink-on selection and verified offline preparation.
The only textual conflict was this document; both implementation records are retained,
and model status distinguishes the historical TrOCR choice from the current ink-on choice.

On October 4, 2026, the combined working tree passed TypeScript/Biome (six existing
warnings and one informational suggestion), all 178 unit tests, all 24 development
Chromium tests including real ink-on reuse/reload, and all five production offline
Chromium tests. The Pages build, lab build, production mock exclusion and whitespace
checks passed. Offline tests cover disconnected reload/inference, initialization failure,
missing/corrupted weights, quota recovery and explicit update activation without ink loss.
Synthetic offline inputs decoded to duplicate-equals text and were correctly rejected;
these results establish runtime integration, not genuine handwriting accuracy.
