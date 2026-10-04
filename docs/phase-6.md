# Phase 6: input, accessibility and measured performance

## Status

Developer A's release checks merged into main `515301d`. Developer B added the
[final handwriting evaluator, report verifier and runtime measurements](phase-6-recognition.md)
in PR #11, merged into main `16efb8a`. Its build, deployment and public verification
checks passed. Public HTTP/hash and disconnected browser checks have passed in
Chromium and Edge. The user reports genuine evaluation and physical checks performed;
their recorded results are still needed for review. The
[joint release decision](joint-release-decision.md) accepts engineering integration
and holds final acceptance pending that evidence and Phase 7 completion.

## Changes

- Toolbar buttons have a minimum 44 × 44 CSS-pixel target, including Pen,
  Redo and Clear on narrow screens. Small instructions and status text were
  darkened; Clear has a distinct color and retains its undoable-clear title.
- Fixed a first-install service-worker notice: a fresh browser briefly exposes
  an installed waiting worker before activation. The client now requires an
  existing active worker before announcing an update. A production regression
  failed before the fix; first install and genuine replacement updates are checked.
- Added browser checks at 320, 390 and 1280 CSS-pixel widths for horizontal
  overflow, target size, 4.5:1 text contrast, keyboard focus and reduced motion.
- Added a live DPR 2 → 3 check during provisional pixel erasing: cancel the
  mask, replay committed ink at the new density, then exercise Ctrl+Y,
  Cmd+Z and Cmd+Shift+Z and a new gesture. CDP changes DPR without emitting
  media-query events, also reproduced on a blank page; the test explicitly
  supplies that event. This is emulation, not a physical monitor test.
- Added `npm run test:performance`, using the prefixed production build and
  real ink-on WASM inference. It measures 60 seconds of drawing while another
  row is repeatedly recognized, then performs 200 draw/edit/recognize/clear
  cycles and checks the 100-command history cap and single-worker limit.
  CI runs the same measurement; its timings belong to that runner.

Results and methodology are recorded in [performance.md](performance.md).
Genuine model acceptance is tracked in [model-evaluation.md](model-evaluation.md).

## Automated verification

On October 4, 2026: TypeScript/Biome passed (six existing warnings), all 178 unit
tests, eight asset checks and 26 model-enabled development browser tests passed.
The Pages and model-lab builds and production mock-exclusion check passed.
All five production offline checks passed in Chromium and all five in installed
Microsoft Edge. Both real-model performance runs completed 200 cycles with one
worker, a 100-command history cap and no recorded main-thread long tasks.
Both final browser measurements accumulated over 60 seconds of held drawing.

Production desktop and 390-pixel mobile screenshots were captured and inspected.
The mobile toolbar audit measured Pen, Redo and Clear at 44 × 44 CSS pixels,
and no horizontal overflow. Screenshots and generated browser output stay ignored.

## Physical checks to record

The user has a mouse, touchscreen and stylus available. Their physical checks
have not been performed by automation. Record device, OS, browser/version,
build version, input type and each observed failure for all three inputs:

1. Write in every row. Check dots, smooth strokes, row clipping and answer spacing.
2. Tap with each eraser; erase part of a stroke and a whole stroke. Cancel an
   active gesture by leaving the app or rotating/resizing; committed ink must return.
3. Undo/redo quickly, undo Clear, and draw after undo to discard redo. Check
   Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y outside editable fields.
4. Check narrow portrait/landscape layouts, browser zoom and movement between
   screens with different densities. Existing ink must remain aligned.
5. Draw for 60 seconds while another row is recognized; record visible lag and
   a browser performance trace. Automated frame timing does not measure physical pen latency.
6. On the public build, load online until Ready offline, disconnect, reload,
   and write a fresh genuine equation. Then edit, erase, undo/redo and calculate again.

## Public deployment verification

The earlier Pages HTTP 404 was resolved after enabling GitHub Actions as the Pages
source. On October 5, 2026, the public build `65c8f66148592467556514b6` passed
critical-file/hash verification and fresh-profile offline browser inference in
Chromium and Edge. Synthetic inputs decoded as `1 = =` and `4 = =`; this proves
real input-dependent offline inference, not correct handwriting. Reports are
linked in [performance.md](performance.md#public-build).
