# Phase 2: smooth ink, history and worker arithmetic

## Drawing and editing

Notebook, model lab and worker share `src/ink/replay.ts` quadratic rendering. The live
preview caches stable curve segments and repaints its changing tail on animation frames.
Commits repaint affected rows; resize/DPR changes replay the full page. Dots remain visible,
writing areas clip ink and selected width applies to future gestures. Pressure is recorded
without changing width. Bounds use curve extrema and pen width.

Primary Pointer Events, coalesced samples, capture/cancel/lost-capture cleanup and logical
960 x 480 coordinates are retained. Each gesture commits one frozen operation and global
history command. Undo/Redo follows edit order across rows; new edits clear Redo. Clear is
one undoable command across changed rows. History retains at most 100 commands with shared
immutable operations. Existing 1,000-operation/200,000-point live caps preserve committed
ink when rejecting an oversized commit.

The store owns epoch/revisions; Undo/Redo never restore counters. Clear advances the epoch;
Undo of Clear uses fresh revisions in the current epoch. Buttons expose availability.
Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y work outside editable controls. Development capture
resets explicitly discard history at prompt/dataset boundaries. A single-row capture reset
preserves other rows and their identities; a full reset advances the epoch.

## Arithmetic

`src/math/evaluate.ts` implements recursive-descent grammar with pinned decimal.js 10.6.0:
precedence, unary signs, multi-digit numbers, decimals and parentheses. It normalizes
required Unicode operators and explicitly supported LaTeX operator/spacing wrappers.
One terminal equals is required. Unsupported commands/symbols and malformed syntax are
rejected; transcripts are never repaired. Limits are 128 normalized characters and 64
operators. No eval or Function executes recognized text.

Arithmetic uses 28 significant digits and half-up rounding. Answers have at most 12 decimal
places, trimmed zeros and normalized negative zero. Exact zero divisors return Undefined
only after the entire expression passes syntax validation. Missing equals is incomplete.
The real trial worker evaluates adapter transcripts and records evaluation timing separately.
Decoder-limit failures are retained. Benchmark latency includes preprocessing, inference
and evaluation. The lab displays actual outcomes.

## Verification and boundaries

Unit checks cover history branching, multi-row Clear, increasing identities, the 100-command
cap, curve extrema, arithmetic faults and capture interchange. Chromium checks cover exact
history restoration, shortcuts, future widths, resize, emulated mouse/pen/touch at DPR 1/2/3,
coalesced pressure, second-pointer rejection, row clipping, changed-row repaint and matching
DOM/worker pixels including ordered masks. Physical stylus/touch hardware remains a release
check; emulated inputs do not establish hardware coverage.

The optional real-model check requires assets:prepare, assets:verify and CALCINK_MODEL_TEST=1.
It verifies initialization/inference and worker arithmetic, not handwriting accuracy.
Ordinary CI needs no model downloads. Both builds and production mock/capture exclusion
are checked. Reactive notebook results remain Phase 3; eraser tools/offline caching remain
Phases 4/5. Genuine Phase 1 trial evidence is still pending.
