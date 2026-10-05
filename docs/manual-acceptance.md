# Manual acceptance record

**Status: not recorded.** Fill this with observed results. Do not mark an automated pointer test as physical input or a synthetic fixture as genuine handwriting. Previously performed checks have no retained results available to this review.

## Tested candidate

| Field | Recorded value |
|---|---|
| Tester and date/time | Pending |
| Git commit and public build version | Pending |
| URL | https://kushagra905.github.io/CalcInk/ |
| Model revision | `2585994ee11fe2ed98065c555c4aae8ee9096209` unless the candidate changes |
| Device / OS / browser and version | Pending |
| Mouse / touchscreen / stylus hardware | Pending; list unavailable inputs as untested |

## Input-device checks

For each available physical input, record pass/fail/untested and attach failure details. Include expected versus observed behavior and reproduction steps.

| Check | Mouse | Touch | Stylus |
|---|---|---|---|
| Write in all rows; smooth strokes and visible decimal dots | Pending | Pending | Pending |
| Pen width changes future ink; row clipping remains correct | Pending | Pending | Pending |
| Whole-stroke eraser removes the intended visible stroke | Pending | Pending | Pending |
| Pixel eraser removes part of a stroke; new ink remains visible | Pending | Pending | Pending |
| Cancel/leave/rotate/resize during a gesture; committed ink returns | Pending | Pending | Pending |
| Undo/redo erase and Clear; new edit discards redo | Pending | Pending | Pending |
| Answers remain beside ink without overlap | Pending | Pending | Pending |
| Narrow layout, zoom and available DPR changes preserve alignment | Pending | Pending | Pending |
| 60 seconds of drawing during other-row inference; visible lag recorded | Pending | Pending | Pending |

Keyboard: record Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y outside editable fields; visible focus and readable feedback. Record initialization/retry behavior with preserved ink if encountered.

## Public offline sequence

Use a fresh browser profile. Record the candidate/version before starting. Reload clears tab ink/history; the equation after reload must be freshly written.

| Step | Expected result | Actual transcript/outcome and pass/fail |
|---|---|---|
| Load online and prepare | Ready offline after model initialization and cache verification | Pending |
| Disconnect; write `18+4×3=` | Inline `30` | Pending |
| Erase `4`, write `5`; undo/redo replacement and erasure | `33`, then `30`, then `33` at the appropriate history states | Pending |
| Exercise both erasers; remove `=` | Updated ink; numeric answer disappears | Pending |
| Clear; write `-2.5+4=` | `1.5` | Pending |
| Write `8÷0=` | `Undefined` | Pending |
| Reload disconnected; write a fresh equation | Ready offline and a correct new calculation | Pending |
| Inspect model/runtime requests | No cloud inference or external model/runtime request | Pending |

## Handwriting reports

Record separate Chromium and Edge reports from the same frozen artifact/samples. Use the existing verifier; retain source exports and failures.

| Field | Chromium | Edge |
|---|---|---|
| Report file and frozen lab artifact | Pending | Pending |
| Writers / genuine held-out sample count | Pending: 2 writers / 50 samples | Pending: same samples |
| Exact canonical transcription count | Pending; target >=45/50 | Pending; target >=45/50 |
| Separate arithmetic correctness | Pending | Pending |
| Required-symbol coverage and failed IDs | Pending | Pending |
| Median / p95 total update | Pending; p95 target <=2,000 ms | Pending; p95 target <=2,000 ms |
| Initialization and excluded warm-up | Pending | Pending |
| Verifier command and exit code | Pending | Pending |

If a held-out result is used to tune the model/preprocessing, preserve that report and collect a new held-out set before the next final claim. Manual transcript corrections do not count as automatic successes.

## Joint sign-off

| Item | Recorded decision |
|---|---|
| Outstanding required-behavior failures and fixes | Pending |
| Supported/untested devices and disclosed limitations | Pending |
| Developer A approval of exact candidate | Pending |
| Developer B approval of exact candidate | Pending |
| Final release decision / accepted tag | HOLD; pending evidence |

Attach the completed record and genuine reports to the final PR. Update `joint-release-decision.md` with the reviewed outcomes; do not infer sign-off from a green CI run.
