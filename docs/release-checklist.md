# CalcInk: remaining work and release checklist

**Reviewed: 6 October 2026 (Asia/Calcutta).** This is the single checklist for Developer A, Developer B and joint release work. The implementation is integrated, but final acceptance is **HOLD** while genuine recognition and physical-input evidence is missing.

The user previously said manual tests were performed, then confirmed no report paths or test results are available. Automation in this batch supplies fresh setup/browser checks and screenshots. It cannot reconstruct those lost results, provide two people's handwriting, operate a physical stylus, or sign off for either developer.

## Developer A: product and physical input

| Deliverable | Status | Evidence or next action |
|---|---|---|
| Usage, supported symbols, tools and shortcuts | Implemented in this batch | [README](../README.md#using-the-notebook). |
| Desktop and narrow-screen product screenshots | Completed in this batch | [Screenshot record](screenshots/README.md); inspected blank production UI, no invented recognition result. |
| Demonstration script | Implemented in this batch | [Demo sequence](demo.md); actual live demonstration/recording remains pending. |
| Mouse, touch and stylus acceptance | Pending physical results | Complete [manual acceptance](manual-acceptance.md#input-device-checks); record actual device/build and failures. Automated pointer events cannot establish hardware behavior. |
| Product fixes | Conditional | Fix specific failures found in the physical/device or genuine equation tests; retest the changed behavior. |
| Genuine demo recording | Pending | Follow the script on the accepted public build; show its actual behavior and preserve failed transcripts. |

## Developer B: recognition and reproducibility

| Deliverable | Status | Evidence or next action |
|---|---|---|
| Final evaluation import/scoring/verifier | Already implemented | [Evaluation workflow](phase-6-recognition.md); same store/coordinator/model as the notebook. |
| Clean setup and engineering checks | Passed in this batch | [Phase 7 evidence](phase-7.md#clean-setup); fresh clone, locked install, asset downloads and actual production builds. |
| Current architecture | Implemented in this batch | [Architecture](architecture.md), using actual module paths and the selected model. |
| Model/runtime attribution | Implemented in this batch | [Attribution](model-attribution.md), catalog hashes and pinned runtime. |
| Genuine development samples | Pending supplied captures | 24 samples, 12 per writer, used only for development/model/preprocessing work. |
| Genuine final evaluation | Pending supplied captures/results | 50 held-out samples, 25 per writer, covering digits and required operators. Freeze before inspecting results; no synthetic inputs or manual transcript corrections. |
| Accuracy, latency and failures | Pending | Verify both browser reports against their original frozen lab artifact. Target >=45/50 exact transcripts and warmed p95 total update <=2,000 ms. Report arithmetic correctness and symbol errors separately. |
| Model or preprocessing improvement | Conditional | Use measured development failures to decide changes. TrOCR remains license-blocked; an unsupported switch is not an accepted fallback. Tuning after held-out inspection requires a new held-out set. |

## Together: acceptance and submission

| Deliverable | Status | Evidence or next action |
|---|---|---|
| Automated public/offline engineering checks | Passed in this batch | [Phase 7](phase-7.md). Real model, automated synthetic strokes, explicitly not genuine handwriting accuracy. |
| Genuine public offline acceptance | Pending recorded results | Follow [offline acceptance](manual-acceptance.md#public-offline-sequence), including a fresh correct calculation after disconnected reload. |
| Requirement review | Implemented; acceptance open | [Joint decision](joint-release-decision.md); attach actual results to close R1-R9. |
| Final candidate freeze | Pending evidence and fixes | Name the commit, model revision and public build version; evaluate that candidate. |
| Both developers' approval | Pending | Fill [sign-off](manual-acceptance.md#joint-sign-off) after reviewing all failures and limitations. |
| Final main merge and publication | Pending this batch's PR | Push the branch, open a PR, review changes and wait for checks before merging. Verify publication after merge. |
| Accepted release tag and submission | Pending acceptance | Tag the approved commit and submit repository/deployment/demo/evidence using the organizer's process. |

## Order of execution

1. Review this batch's documentation, screenshots and clean setup evidence; commit/push it on `b/recognition-foundation`.
2. Both writers produce the missing genuine development/held-out captures. A records physical input results while B verifies genuine evaluation reports. Preserve the held-out split.
3. Together run the genuine public offline sequence. Fix confirmed required-behavior failures and repeat relevant checks.
4. Complete Phase 7's live demo, final PR evidence, joint approval and accepted release tag/submission.

Optional transcription correction, saved notebooks and export remain outside the required release. Consider them after core acceptance passes. Corrected transcripts must never increase the automatic recognition score.
