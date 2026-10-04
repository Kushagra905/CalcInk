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
