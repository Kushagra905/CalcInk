# CalcInk: joint release decision

## Decision on 5 October 2026

**Final release acceptance: HOLD pending recorded handwriting and physical-input results.**

**Engineering integration and deployed release candidate: accepted on the available automated evidence.** Developer A's Phase 6 work merged in PR #10; Developer B's work merged in [PR #11](https://github.com/Kushagra905/CalcInk/pull/11). The candidate on remote `main` is `16efb8a817a3046638454d180d4b9f08556fe6cc`. Keep ink-on CoMER INT8 as the current model while validating this candidate. No model switch or optional feature is justified by the evidence reviewed here.

The user confirmed that genuine handwriting evaluation and physical checks were performed. Their report files, scores, timings, device details and observed failures have not yet been supplied for this review. This is an evidence gap, not a finding that those checks failed or were never performed. No handwriting accuracy or latency value can be inferred from that confirmation.

This records the joint release gates and the technical review outcome. It does not record approval on behalf of Developer A or fabricate either developer's final sign-off.

## Candidate and verified delivery

| Item | Verified observation |
|---|---|
| Developer A implementation | PR #10 merged as `515301d`; input/accessibility and production performance checks integrated. |
| Developer B implementation | PR #11 merged as `16efb8a`; its branch commit is `0ce4c2e`. |
| Main CI and delivery | [Pages run 37229041440](https://github.com/Kushagra905/CalcInk/actions/runs/37229041440) completed successfully. Build, deploy and verify-public checks all succeeded for the candidate commit. |
| Public URL | [CalcInk](https://kushagra905.github.io/CalcInk/). |
| Public artifact | Version `65c8f66148592467556514b6`; this review reran HTTP/hash verification successfully: 21 critical assets, 42,004,089 verified bytes. |
| Recognition runtime | ink-on CoMER INT8, revision `2585994ee11fe2ed98065c555c4aae8ee9096209`; ONNX Runtime Web 1.22.0, single-threaded WASM. |
| Supported evidence scope | Desktop Chromium and installed Edge. Both share the Chromium engine; mobile, Safari and Firefox acceptance is not established. |

The GitHub snapshot and independent HTTP verification are recorded in [delivery evidence](evidence/joint-release-delivery.json). A green deployment verifies delivery and synthetic engineering checks; it does not establish genuine recognition quality.

## Requirement review

R1-R9 refer to the agreed architecture's product contract. The 90% and two-second thresholds below are project engineering targets, not asserted competition thresholds.

| Requirement | Evidence reviewed | Gate status |
|---|---|---|
| R1: smooth mouse, pen, touch and DPR/resize behavior | A's layout, focus, contrast, 44px target and DPR regressions; production drawing traces. User reports physical checks performed. | Automated checks pass; physical results await review. |
| R2: pen width, undo/redo, clear and both erasers | Geometry/history/browser regressions, 100-command history cap and repeated editing. | Automated checks pass; actual input-device demonstration awaits review. |
| R3: pretrained recognition of required symbols | Pinned model assets and evaluator implemented; no genuine benchmark report available in the reviewed evidence. | HOLD: verify 50 genuine held-out samples, all required symbols, at least 45/50 exact canonical transcripts, no manual corrections. |
| R4: arithmetic and precedence | Strict parsing and decimal arithmetic regressions, including invalid and unsupported expressions. | Automated logic gate passes; genuine handwriting examples remain part of R3/R5 acceptance. |
| R5: inline results and recomputation after edits | Coordinator revision/epoch filtering, result rendering and edit/erase/history regressions. | Automated checks pass; genuine write/edit/undo/redo demonstration awaits review. |
| R6: browser-only execution and disconnected reload | Local/public real WASM tests in Chromium and Edge; hosted hashes verified. Synthetic marks yielded `1==` and `4==`, rejected as invalid. | Engineering gate passes; genuine correct arithmetic after public offline reload awaits review. |
| R7: drawing performance and resource stability | Both B browser runs held drawing for over 60 seconds and completed 200 cycles: one worker, bounded history, no recorded main-thread task >=50 ms, observed WASM capacity stable at 40 MiB through idle checkpoints. | Named-device engineering observations pass; genuine warmed total-update p95 <=2,000 ms and physical drawing observations await review. |
| R8: recoverable errors and Undefined | Invalid/incomplete/unsupported text, stale errors, timeout/restart/retry and exact division by zero have regressions. | Automated checks pass; genuine division-by-zero demonstration awaits review. |
| R9: reproducibility and submission | Public repository, README, automated CI, asset attribution/license delivery and deployment exist. | Phase 7 remains: clean setup, repository architecture/attribution consolidation, demo and final evidence package. |

See [performance evidence](performance.md), [model acceptance](model-evaluation.md), [final evaluator workflow](phase-6-recognition.md), and [public offline acceptance](pages-deployment.md#5-finish-genuine-public-offline-acceptance).

Frame timing is an rAF proxy rather than physical pen-to-display latency. Stable observed WASM capacity is not proof about all native allocations or process memory. The synthetic evaluator regression and synthetic public inputs do not count toward the genuine sample targets.

## Remaining work and ownership

| Owner | Next action | Evidence needed to close the gate |
|---|---|---|
| B (user) | Supply the already completed evaluation reports and their original frozen lab artifact. If only development evaluation was performed, run the separate final evaluator on 50 held-out samples, 25 per writer, after freezing changes. | Capture provenance; tested commit/artifact digest; raw transcripts and failures; exact-transcription count; separate arithmetic correctness; per-symbol errors; median/p95 total update; device/OS/browser. Use the same artifact and samples in Chromium and Edge. |
| B | Run `npm run phase6:report -- '<report.json>' '<frozen-lab-directory>' --require-targets` for each genuine final report. | Verifier exits 0 and confirms at least 45/50 exact transcripts, symbol coverage and warmed total-update p95 <=2 seconds. A valid report that misses the targets exits 2; preserve the failures. |
| A | Record the performed mouse/touch/stylus checks and any failures against the deployed candidate. | Device and input type, OS/browser/version, public build version, each result for writing/dots, both erasers, cancellation, undo/redo/clear, resize/DPR/zoom and 60-second drawing during inference. Mark an unavailable device untested. |
| A + B | Supply the genuine public offline sequence's observed results. Repeat it if the performed check used a different build or only synthetic marks. | Online preparation to Ready offline, disconnection, successful handwritten arithmetic, edits/history/both erasers, then disconnected reload and a fresh correct equation; also a negative decimal and division by zero. Preserve failed transcripts. |
| A | Complete Phase 7 usage screenshots and the short demonstration. | Precedence `18+4x3= -> 30`, replacement `4` to `5 -> 33`, undo/redo, `-2.5+4= -> 1.5`, `8/0= -> Undefined`, and disconnected recognition using genuine ink. |
| B | Complete Phase 7 clean setup and documentation. | Separate clean-directory install/assets/build/preview result; commit current architecture and model/runtime attribution; link the genuine evaluation and measured limitations in the final PR. |
| A + B | Review the assembled evidence and record final sign-off. | Both developers approve the exact candidate commit, public version and any remaining limitations. Then tag and submit that accepted version through the organizer's process. |

The evaluation implementation and existing CI are already complete. The next step is to review the performed manual work, not to add another implementation phase or substitute new synthetic tests for it.

## Rules for the final decision

1. Approve final acceptance only when the missing evidence establishes the required behavior on the named devices and the final handwriting targets pass.
2. If genuine recognition or latency misses a target, record the measured result and failed sample IDs. Use the separate 24-sample development set to investigate preprocessing/model changes. If tuning follows inspection of held-out results, collect a new held-out set before claiming a fresh final result.
3. Fix confirmed failures in required behavior before extensions. Do not count corrected transcripts as automatic recognition. A model change must pass the existing asset/license gate, genuine evaluation, browser/runtime and offline checks.
4. Leave transcription correction, saved notebooks, export and other optional features deferred until core acceptance passes and time remains.
5. Updating code/model/runtime requires evidence appropriate to the changed behavior and a verified new public artifact. Documentation-only updates do not invalidate the current production measurements.

## Sign-off record

| Review | Status |
|---|---|
| Automated engineering/delivery review | Passed for the candidate and evidence cited above. |
| Genuine recognition/latency review | User reports evaluation performed; report values and artifact not yet available for verification. |
| Physical input and genuine offline review | User reports checks performed; device matrix and observed outcomes not yet available for verification. |
| Developer A final approval | Not recorded. |
| Developer B final approval | Not recorded. |
| Final release acceptance | HOLD pending evidence review and Phase 7 completion. |

Update this record with actual results and sign-offs when supplied; retain failures and the identity of the tested artifact.
