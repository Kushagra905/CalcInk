# Phase 6 performance evidence

## Build and reference device

Measured locally on October 4, 2026, from main `2bffc0e58f547df798bf2276592da02914369ec0`
plus the Phase 6 toolbar/color and first-install notice fixes. The application diff SHA-256 is
`28b9fcdde334da8b7b59c9c0498600dffca134807a53832e1d6fbc2e645c6e62`;
the `/CalcInk/` production build version is `65c8f66148592467556514b6`.
No application code changed after this measured build.

Reference device: Intel Core i7-14700HX, 28 logical CPUs, Windows build
10.0.26200, x64; headless browser, 1280 × 720 CSS-pixel viewport, DPR 2.
Model: ink-on CoMER INT8 revision `2585994ee11fe2ed98065c555c4aae8ee9096209`,
local single-threaded ONNX Runtime Web 1.22.0 WASM, beam width 3, maximum decode steps 64.

## Chromium measurement

[Machine-readable report](evidence/phase-6-local-performance.json), browser
153.0.8010.12. The workload warmed the real model, recorded a two-second idle
baseline, then drew two-second strokes in row 2 with brief lifts while editing
row 1 to trigger repeated recognition. The final run lasted 62.57 seconds,
with the pointer held for 60.65 seconds and 3,630 move events. The test
requires at least 60 seconds of accumulated held drawing.

| Observation | Measured result |
|---|---:|
| Idle frame interval median / p95 / maximum | 16.7 / 16.8 / 16.8 ms |
| Drawing frame interval median / p95 / maximum | 16.7 / 16.7 / 16.8 ms |
| Observed drawing rAF cadence | 59.99 callbacks/s |
| Estimated missed callback slots (16.7 ms idle reference) | 0 of 3,754 observed intervals |
| Input event to next rAF median / p95 / maximum | 16.5 / 17.9 / 26.7 ms |
| Recorded main-thread tasks ≥50 ms during drawing | 0 |
| Real results received while another row was actively drawn | 30 |
| DOM mutation records during drawing | 210 |
| Completed draw/edit/recognize/clear cycles | 200 |
| Synthetic worker processing median / p95 / maximum | 403.2 / 469.0 / 504.0 ms |
| Recognition workers created / peak / remaining | 1 / 1 / 1 |
| Undo commands retained after 200 cycles | 100 |
| Browser / worker errors | 0 / 0 |

Worker processing sums reported preprocessing, inference and arithmetic times;
it excludes debounce, queueing and result painting. It is not genuine-sample
total update latency and cannot establish the 2-second handwriting p95 target.

The callback cadence is an automated proxy, not a physical display-frame count.
Input-to-next-rAF does not measure paint completion or hardware pen-to-display
latency. The generator, observers and report recorder add measurement overhead.
No rendering optimization was justified by this drawing workload: it recorded
no long task or missed callback slot. Dense-page erasing and slower physical
devices still need their own traces.

## Microsoft Edge measurement

[Machine-readable Edge report](evidence/phase-6-edge-performance.json), browser
154.0.4258.53, same device/model, before the first-install notice fix. Its build
was `40731051a8aacf8438e8c59c`, application diff SHA-256
`799561f8ecd2e224a715c7a206c74f4fc7320e845ce9297a32952cf09aa50ab1`.
This run lasted 61.80 seconds, with 60.34 seconds
of accumulated held drawing, 8,672 move events and 30 overlapping real results.

| Observation | Measured result |
|---|---:|
| Idle frame interval median / p95 / maximum | 6.9 / 7.1 / 7.6 ms |
| Drawing frame interval median / p95 / maximum | 6.9 / 7.1 / 21.0 ms |
| Observed drawing rAF cadence | 143.81 callbacks/s |
| Input event to next rAF median / p95 / maximum | 6.7 / 7.0 / 26.6 ms |
| Long-task observer supported / recorded tasks ≥50 ms | Yes / 0 |
| Completed draw/edit/recognize/clear cycles | 200 |
| Synthetic worker processing median / p95 / maximum | 394.0 / 442.5 / 481.4 ms |
| Recognition workers created / peak / remaining | 1 / 1 / 1 |
| Undo commands retained / browser and worker errors | 100 / 0 |

Edge's callback clock ran near 144 Hz; Chromium's ran near 60 Hz. The earlier
Edge report's `estimatedMissedSlots` uses a rounded 16.7 ms reference and reports
zero. That coarse estimate does not count all missed high-refresh callbacks:
Edge's maximum 21 ms gap exceeded its observed idle interval. Neither browser
report is a physical dropped-frame measurement. No main-thread task reached
the 50 ms investigation threshold. The final measurement command calibrates its
slot estimate to the measured idle median and records `referenceFrameBudgetMs`.

## Resource evidence and limits

After forced main-thread JS garbage collection:

| Cycle | Chromium JS heap, bytes | Edge JS heap, bytes |
|---|---:|---:|
| 20 | 4,388,916 | 4,931,848 |
| 50 | 4,304,804 | 4,452,568 |
| 100 | 4,414,224 | 4,565,364 |
| 150 | 4,467,288 | 4,615,436 |
| 200 | 4,528,068 | 4,626,316 |

The measurement recorder retains frames and response objects, and history grows
until its 100-command cap. There is a small measured rise after cycle 50;
this does not certify a runtime memory plateau. The single-worker and history
bounds passed. Worker/WASM and post-idle measurements were pending in that run;
Developer B's follow-up below records them on a separate reference machine.
GPU allocations and browser process memory are outside these measurements.

## Accessibility and input regressions

The initial 390-pixel viewport audit found Pen, Redo and Clear widths of
35.34, 43.20 and 42.89 CSS pixels respectively. The release checks now enforce
at least 44 × 44 CSS pixels at widths 320, 390 and 1280, with no horizontal overflow.
Normal small-text contrast is checked at 4.5:1, alongside visible keyboard focus
and reduced motion. Disabled controls and decorative notebook guides are not
claimed as normal text contrast measurements.

Existing checks cover emulated mouse/touch/pen, DPR 1/2/3, resize, cancellation,
row clipping, coalesced samples, both eraser taps, exact replay and history.
The new live DPR test explicitly supplies the resolution-change event that CDP
does not emit, and checks provisional-mask cancellation plus Ctrl+Y/Cmd shortcuts.
Physical mouse, touchscreen and stylus checks are pending; see the
[hands-on checklist](phase-6.md#physical-checks-to-record).

## Reproduction

```sh
npm ci
npm run assets:prepare
npm run build:pages
npm run test:performance
```

The command writes `performance.json` below `test-results/performance/`, attaches
it to the Playwright result and prints the JSON in the CI log. It asserts workload
completion, observable long-task support, real overlapping results, history/worker
bounds and no errors. Timings are reported rather than used as universal FPS gates.

For installed Microsoft Edge on Windows PowerShell:

```powershell
$env:CALCINK_BROWSER_CHANNEL = 'msedge'
npm run test:offline
npm run test:performance
Remove-Item Env:CALCINK_BROWSER_CHANNEL
```

After the first-install fix, the same production offline suite passed in Chromium
(5 tests, 31.5 seconds) and Microsoft Edge 154.0.4258.53 (5 tests, 33.9 seconds).
Offline synthetic marks
still decoded as `1 = =` and `4 = =`, rejected as `MULTIPLE_EQUALS`; these checks
establish input-dependent offline inference and recovery, not correct handwriting.
Both timed measurements passed; their separate reports retain the actual browser clocks.

## Acceptance still open

Physical-device checks are unrecorded, and no genuine
24-development/50-held-out sample benchmark has been provided. These measurements
do not close those acceptance items. Public deployment verification is recorded
in the follow-up below. See
[model-evaluation.md](model-evaluation.md) and [phase-6.md](phase-6.md).

## Developer B runtime follow-up — October 5, 2026

Production source is main `515301dd4cb377d729f30a314d23fb0d2126c577`, with no
application source diff; build `65c8f66148592467556514b6`. The model/runtime remain
the pinned ink-on INT8 / ONNX Runtime Web 1.22.0 single-threaded WASM baseline.
Device: Intel Core i5-12450H, 12 logical CPUs, Windows 10.0.26200 x64. These
headless measurements use a 1280 × 720 viewport and DPR 2. They are separate
from the earlier Developer A machine's evidence above.

[Chromium 153.0.8010.12 report](evidence/phase-6-b-chromium-runtime.json) and
[Edge 154.0.4258.53 report](evidence/phase-6-b-edge-runtime.json):

| Observation | Chromium | Edge |
|---|---:|---:|
| Accumulated held drawing | 60.95 s | 60.65 s |
| Drawing frame interval p95 / maximum | 16.8 / 33.4 ms | 17.0 / 18.1 ms |
| Estimated missed rAF slots | 40 (1.04%) | 0 |
| Main-thread tasks ≥50 ms | 0 | 0 |
| Real results overlapping other-row drawing | 30 | 30 |
| Completed draw/edit/recognize/clear cycles | 200 | 200 |
| Synthetic worker-processing median / p95 | 431.1 / 649.2 ms | 267.2 / 367.9 ms |
| Recognition workers created / peak / active | 1 / 1 / 1 | 1 / 1 / 1 |
| Undo commands retained | 100 | 100 |
| Cleared ink surface empty | Yes | Yes |
| Browser / worker errors | 0 / 0 | 0 / 0 |

The workload records callback cadence and input-to-next-rAF, rather than physical
paint or pen latency. Chromium did have estimated missed slots; no claim of zero
dropped physical frames is made. Neither run crossed the 50 ms long-task threshold.
No product hot-path optimization was justified by these results. The timing
differences are observations, not a controlled browser-speed comparison.

### Worker and WASM retention

A test-only wrapper observes `WebAssembly.Memory` construction at worker startup,
records WeakRefs, and samples each surviving memory's `buffer.byteLength`. It
does not retain a strong reference to the memory. CDP collects garbage and measures
the recognition worker's JS heap separately from the page. Sampling occurs after
the frame measurement, after cycle checkpoints and after Clear at 2/5/10 seconds
idle, before Undo triggers more inference. Debugging instrumentation adds overhead.

| Cycle | Chromium worker JS, bytes | Edge worker JS, bytes | Observed WASM capacity, both |
|---|---:|---:|---:|
| 0, after drawing warm-up | 2,478,228 | 2,482,116 | 41,943,040 |
| 20 | 2,578,596 | 2,605,736 | 41,943,040 |
| 50 | 2,616,432 | 2,643,628 | 41,943,040 |
| 100 | 2,650,616 | 2,646,568 | 41,943,040 |
| 150 | 2,615,272 | 2,650,776 | 41,943,040 |
| 200 | 2,612,548 | 2,625,332 | 41,943,040 |
| Idle 2 / 5 / 10 seconds | 2,612,548 each | 2,625,332 each | 41,943,040 each |

Each checkpoint found one tracked WASM memory. Its reserved capacity stayed at
40 MiB, and the worker JS readings plateaued during the observed idle interval.
Reserved linear memory does not measure live allocator blocks, every native/GPU
allocation, or process RSS; it cannot prove that every upstream tensor is released.
The recorded page JS heap also includes the measurement recorder's frame/results
arrays and retained history. It must not be presented as worker or total memory.
The limitations of `performance.memory` are described by
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory);
the separate JS/GC/backing-storage fields come from
[CDP Runtime.getHeapUsage](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage).

The document-store regression executes 200 two-stroke draw/edit/clear cycles,
traverses exactly 100 remaining undo commands and observes at most 68 reachable
stroke IDs / 136 points across those replayable states. A new edit clears redo,
and reset removes current ink and replayable history. These scenario bounds are
not a byte estimate or a claim about all unreachable objects in browser memory.

### Public build

The HTTP/hash verifier passed for the live
[CalcInk deployment](https://kushagra905.github.io/CalcInk/): build
`65c8f66148592467556514b6`, 21 critical assets, 42,004,089 verified bytes.
Fresh-profile public tests passed in
[Chromium](evidence/phase-6-public-chromium-offline.json) and
[Edge](evidence/phase-6-public-edge-offline.json): prepare online, disconnect, reload
and recognize two different synthetic inputs with the real model and one worker.
Their actual transcripts were `1 = =` and `4 = =`, rejected as `MULTIPLE_EQUALS`.
This verifies public offline engineering, not correct genuine handwriting.

The final 50-sample evaluator and frozen-artifact verifier are implemented in
[Developer B's Phase 6 workflow](phase-6-recognition.md). Genuine sample exports
have not been supplied; no handwriting accuracy or genuine latency value is claimed.
