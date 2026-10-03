# Phase 0 integration contract

These APIs are implemented for Developer A's foundation and are ready for Developer B's review.
The shared contract is not yet jointly approved. No real-model, arithmetic, or offline result is claimed.

## Document boundary

`src/document/types.ts` exports points, strokes, pixel masks, operations, history-command shapes,
row snapshots, and `DocumentEditEvent`. History execution is Phase 2 work.

`src/document/rows.ts` fixes the logical page at 960 × 480: stable `row-1`–`row-3` IDs,
160-unit bands, 136-unit writing areas, and row-top + 104 answer baselines.
Points and bounds are page coordinates. CSS scaling/DPR do not change document data.

`createDocumentStore()` exposes:

```ts
store.getEpoch();
store.getRow('row-1');
store.getRows();
const unsubscribe = store.subscribe((event) => { /* consume immutable snapshots */ });
store.begin('row-1', 'draw');
store.commit(nextRowOperations);
store.cancel();
unsubscribe();
```

Only the store mutates revisions/epoch. Begin increments the row revision and emits `begin`;
commit validates and freezes operations, increments again, and emits `commit`;
cancel retains committed ink and the current revision, then emits `cancel`.
Only one gesture is active. Invalid/capacity-exceeding commits preserve committed ink;
the caller cancels the provisional gesture. Existing immutable operations are shared.

`store.clear()` currently supports the development fixture reset: cancel, advance epoch,
empty changed rows, advance their revisions, and emit a clear commit. The user-facing Clear
control is disabled until Phase 2 adds undoable history. Revision counters must never be restored from history.

This follows the handoff's explicit single ownership rule, resolving the architecture's
older wording that assigned begin-time revision increments to the coordinator.

## Rendering and capture

`src/ink/geometry.ts` maps viewport coordinates and computes clipped stroke bounds.
`src/rendering/replay.ts` replays ordered strokes/masks with round dots/caps and row clipping
on either a DOM canvas context or an OffscreenCanvas context; it imports no React or DOM application module.
Pixel masks erase earlier ink only. This helper is foundational; the eraser tools are not implemented.

Basic pen capture supplies the fixture screen. It captures primary mouse/pen/touch pointers,
coalesced samples, fixed width/pressure metadata, and one operation per completed gesture.
Lost capture/cancellation/resize discard provisional input. The three canvases share actual
backing-size transforms. Live input uses animation frames and does not update React for each point.
Quadratic smoothing, changed-row replay, and editing history remain Phase 2 work.

## Recognition boundary

`src/recognition/contracts.ts` exports `RevisionKey`, outcomes, responses, INIT/RECOGNIZE/DISPOSE
requests, PROGRESS/READY/RESULT/ERROR replies, model/asset shapes, `ModelAdapter`,
and `CoordinatorCallbacks`. The production connector signature is:

```ts
connectRecognition(document, callbacks): RecognitionCoordinator
// coordinator.retry(); coordinator.dispose();
```

Callbacks expose model progress/ready/failure, immediate row clearing, recognizing state,
accepted row results and recoverable row errors. UI listens to this API, not raw worker messages.
B replaces `src/recognition/connect.ts` with real integration, preserving this boundary or coordinating its revision.

The development connector uses one actual module worker. It rejects results/errors whose
epoch, revision, request ID or model ID are obsolete. It postpones an actively edited row and
invalidates all requests on reset. Dispose unsubscribes and terminates the worker.
Delays, initialization failure, recognition failure and out-of-order replies are deterministic test fixtures.
The mock deliberately permits overlapping jobs to test stale rejection; B's bounded queue,
350 ms debounce and timeout/restart policy are Phase 3 production work.

Vite selects the mock connector only for `dev:mock`. A regular/production build resolves
the unavailable connector, omits the fixture UI/mock worker, and rejects mock build mode.
No runtime CDN, model download, asset script, service worker or production adapter is introduced.

## Verification

Unit checks cover coordinate scaling/dots, immutable snapshots, lifecycle/counters,
invalid/capacity input, fixture protocol delivery, stale results/errors, readiness during a gesture,
and disposal. Browser checks cover actual module-worker delivery, DPR-aligned canvases,
fixture export provenance, pointer cleanup, and initialization retry with preserved ink.
The model/asset interface and callback names require B's review before shared-interface merge.
