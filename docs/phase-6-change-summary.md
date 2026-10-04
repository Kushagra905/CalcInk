# Phase 6: Developer B change summary

## Status

Implemented on `b/recognition-foundation` after the user merged main `515301d`.
Committed as `0ce4c2e`, then merged through PR #11 into main `16efb8a`. GitHub's
build, deployment and public verification checks passed. Final handwriting
acceptance remains open pending review of the user's reported manual evaluation
results. See [the joint release decision](joint-release-decision.md).
The selected model stays ink-on CoMER INT8.

## Changed files and code

| Files | Changes |
|---|---|
| `tools/model-lab/evaluation.ts` | Genuine held-out metadata/geometry validation; strict exact transcription and separate arithmetic scoring; deterministic symbol alignment; timing distributions and report/build validation. |
| `tools/model-lab/final.html`, `final.ts` | Final 50-sample import/run/export page. Uses the real document store/coordinator, records initialization and excluded warm-up, measures commit-to-result-next-frame, aborts invalid runs and disposes the worker. |
| `tools/model-lab/index.html` | Links the development lab to the separate final evaluator. Development held-out recognition remains disabled. |
| `scripts/evaluation-build.mjs` | Verifies the selected model/runtime and hashes the emitted lab artifact with commit/revision/runtime metadata. |
| `scripts/phase6-report.mjs` | Verifies artifact and fixture hashes, recomputes outcomes/metrics, reports failed targets, and exits 2 with `--require-targets` when targets are missed. |
| `vite.lab.config.ts`, `package.json` | Build both lab pages and the frozen manifest; add evaluator, public-offline and report commands. No dependencies changed. |
| `playwright.evaluation.config.ts`, `playwright.public.config.ts` | Separate final-evaluator and public-production test configurations. |
| `playwright.offline.config.ts` | Adds explicit external-preview support; the performance config inherits it. This avoids managed-preview shutdown waits on Windows. |
| `tests/evaluation/final.spec.ts` | Rejects incomplete fixtures, runs 50 explicitly synthetic inputs through real WASM, verifies the report, rejects digest tampering and checks the failing target exit code. Not genuine accuracy evidence. |
| `tests/unit/final-evaluation.test.ts` | Provenance/identity checks, arithmetic versus transcription distinctions, repeated equals, output limits, accuracy/latency thresholds and timing/outcome tampering. |
| `tests/unit/resource-history.test.ts` | 200 draw/edit/clear cycles, 100-command cap, bounded reachable replayable ink, redo invalidation and reset. |
| `tests/performance/worker-memory.ts`, `notebook.spec.ts` | Adds worker-isolate JS/GC/backing-storage measurements, weak observation of WASM memory capacity, post-idle checkpoints and an empty cleared-surface check. |
| `tests/public/offline.spec.ts` | Checks the actual published version, disconnects/reloads and proves input-dependent local inference with two synthetic drawings. |
| `.github/workflows/ci.yml`, `pages.yml` | CI exercises the final evaluator after building the lab; post-publication verification now includes disconnected browser interaction after the HTTP/hash gate. |
| `docs/evidence/phase-6-b-*-runtime.json` | Actual Chromium and Edge production frame/200-cycle/worker/WASM measurements. |
| `docs/evidence/phase-6-public-*-offline.json` | Actual fresh-profile Chromium and Edge checks against the published site. |
| `README.md`, `docs/model-evaluation.md`, `docs/performance.md`, `docs/phase-6.md`, `docs/phase-6-recognition.md`, this summary | Usage, exact scoring/measurement scope, recorded results and remaining acceptance work. |
| `docs/pages-deployment.md`, `docs/phase-5.md` | Replaces the historical failed-publication status with verified live-deployment evidence; genuine offline arithmetic remains pending. |

The production application source is unchanged from the merged main build.
Synthetic fixture reports and generated builds/models stay ignored. The unrelated
untracked file beginning `trict worker arithmetic pipeline` is untouched and must
not be staged with this work.

## Verification

- TypeScript/Biome passed with six existing warnings and no new warnings.
- All 187 unit tests and eight asset checks passed.
- The production-built final-evaluator browser/CLI test passed, including the
  `--require-targets` exit-code regression and fixture-digest rejection.
- Pages and frozen lab builds passed; production mock-exclusion verification passed.
- Actionlint accepted both workflows; Git whitespace validation passed.
- Chromium and Edge each completed 60 seconds of accumulated drawing and 200 real
  inference/edit/clear cycles: one worker, 100 undo commands, no recorded main-thread
  tasks ≥50 ms. Observed WASM capacity stayed 40 MiB; worker JS measurements were
  unchanged at 2/5/10 seconds idle. Detailed limitations are in `performance.md`.
- The live public build `65c8f66148592467556514b6` passed HTTP/hash verification and
  disconnected reload/inference in both browsers. Its synthetic transcripts
  `1 = =` and `4 = =` were correctly rejected, not counted as arithmetic successes.

Browser tests used separately started previews on Windows. The new external-server
flag supports the same approach through the normal npm test commands. The amended
remote workflows subsequently passed for the merged Phase 6 candidate; run links
are recorded in the joint release decision.

## Remaining acceptance

Collect/export the genuine development and 50 held-out samples, then follow
[the final evaluation workflow](phase-6-recognition.md). Measure and record actual
accuracy/latency on the frozen build in both browsers. Physical mouse, touchscreen,
stylus and genuine arithmetic after public offline reload also need user evidence.
No genuine accuracy percentage is claimed by this implementation.

## Original implementation commit commands (already completed)

Inspect `git diff` and `git status`, then stage only these paths:

```powershell
git add -- .github/workflows/ci.yml .github/workflows/pages.yml README.md package.json vite.lab.config.ts playwright.offline.config.ts playwright.evaluation.config.ts playwright.public.config.ts
git add -- scripts/evaluation-build.mjs scripts/phase6-report.mjs tools/model-lab/evaluation.ts tools/model-lab/final.ts tools/model-lab/final.html tools/model-lab/index.html
git add -- tests/evaluation/final.spec.ts tests/public/offline.spec.ts tests/performance/notebook.spec.ts tests/performance/worker-memory.ts tests/unit/final-evaluation.test.ts tests/unit/resource-history.test.ts
git add -- docs/model-evaluation.md docs/pages-deployment.md docs/performance.md docs/phase-5.md docs/phase-6.md docs/phase-6-recognition.md docs/phase-6-change-summary.md docs/evidence/phase-6-b-chromium-runtime.json docs/evidence/phase-6-b-edge-runtime.json docs/evidence/phase-6-public-chromium-offline.json docs/evidence/phase-6-public-edge-offline.json
git diff --cached --check
git diff --cached --stat
git commit -m "test(recognition): add final evaluation and phase 6 runtime evidence"
git push origin b/recognition-foundation
```

This commit delivers the evaluation implementation and engineering evidence;
it does not imply that the pending genuine handwriting targets have passed.
