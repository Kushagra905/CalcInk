# Recognition Foundation

## Status

Shared types, adapter interface, and mock adapter are implemented.

Real model inference, worker transport, recognition scheduling,
arithmetic evaluation, and offline caching are pending.

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

The future coordinator must validate all five before applying
a response or request-specific error.

## Verification

Run:

npm run check
npm run test:unit