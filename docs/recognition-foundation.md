# Recognition Foundation

## Status

Shared types, adapter interface, and mock adapter are implemented.

Phase 1 adds a local real-model trial worker, asset verification, loading state,
and handwriting capture/benchmark tooling. The user changed the current choice to
ink-on CoMER INT8 on October 4, 2026. Measured genuine development validation remains
pending. TrOCR remains an optional license-gated candidate. See `phase-1-model-evaluation.md`.

Phase 2 strict worker arithmetic and Phase 3 reactive recognition scheduling are implemented.
Arithmetic retains raw transcripts, exposes normalized text separately, and preserves decoder-limit failures.
See `phase-2-arithmetic.md` for grammar, resource bounds and decimal formatting.
Notebook and lab now share TrialClient and the nested INIT/RECOGNIZE protocol.
Phase 4 adds both erasers. Phase 5 implements verified offline caching; public deployment
and genuine offline arithmetic acceptance remain pending. See `phase-5.md`.

## Ownership

- Developer A owns ink operations, history, epoch, and row revisions.
- Developer B owns recognition adapters, request IDs, worker transport,
  scheduling, arithmetic, and model asset integration.

## Coordinates

The page uses a 960 × 480 logical coordinate space.

Points, widths, mask radii, and returned visible ink bounds use
logical page coordinates.

Worker rasterization may use row-local coordinates internally.
Returned bounds must be translated back to page coordinates.

## Ink operations

Replay operations in chronological order:

- stroke: source-over
- pixel-mask: destination-out

A pixel mask erases earlier ink. Later strokes remain visible.

Recognition must use composited visible ink.

## Mock adapter

MockRecognitionAdapter requires an explicit fixtureFor callback.

It supports deterministic results, request-specific delays,
and failures thrown by fixtureFor.

It does not recognize handwriting or evaluate arithmetic.
Its timings are zero and must not enter model benchmarks.

Production adapter selection must reject mock mode before deployment.

## Result identity

Recognition responses preserve epoch, rowId, rowRevision,
and requestId, and include modelId.

TrialClient and the notebook coordinator validate all five before applying
a response or request-specific error.

## Verification

Run:

npm run check
npm run test:unit
