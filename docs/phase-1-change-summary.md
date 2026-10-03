# Developer B — Phase 1 change summary

Repository: `C:\Users\kushagra\OneDrive\Desktop\hj\CalcInk`  
Branch: `b/recognition-foundation`  
Date: 3 October 2026  
Git actions: no staging, commit, push, or branch switch was performed.

This is the historical October 3 implementation report. On October 4, the user
selected MathWriting TrOCR INT8 as the final model; the lab and asset commands now
default to it. Weight-license evidence, browser inference and genuine handwriting
validation remain pending. See `phase-1-model-evaluation.md` for current status.

## What is implemented

A browser model lab now captures actual handwriting, initializes a local ONNX candidate in a module worker, exposes progress/failures/retry, and exports measured development reports. Prepared files are verified against pinned SHA-256 hashes; runtime files come from the installed ONNX package. Unit tests exercise the failure and integration boundaries.

Phase 1's **model-selection decision remains open**. Both writers must capture their 12 development expressions, merge those 24 samples, and run the benchmark. The TrOCR fine-tune has no explicit weight-license evidence in its published metadata, so its download/load gate is blocked. ink-on is a comparison candidate, not a selected accuracy winner.

## Existing files changed

| File | Code or configuration change |
|---|---|
| `package.json` | Added pinned dependencies `ink-on@0.1.0`, `onnxruntime-web@1.22.0`, `@huggingface/transformers@4.3.0`, and development dependency `vite@8.3.2`. Added `dev:lab`, `build:lab`, `preview:lab`, `assets:prepare`, `assets:verify`, and `benchmark:report` commands. Existing unit/check commands remain available. |
| `package-lock.json` | Updated the lockfile to record those exact direct dependencies and their resolved transitive packages. |
| `tsconfig.json` | Added JSON module resolution, TypeScript-extension import support for the report CLI, Vite/Node types, and inclusion of `tools/` and the lab build configuration. |
| `.gitignore` | Added `dist-lab/`. Existing generated `public/models/` and `public/runtime/` exclusions are retained. |
| `src/recognition/protocol.ts` | Extended `AdapterProgress.stage` with `verifying` and `loading`; allowed `fraction: null` for unknown progress; added optional `detail`. Existing request/response identity fields and outcome types were preserved. |
| `README.md` | Added reproducible lab setup, launch/check commands, current model-selection status, and the Phase 1 documentation link. |
| `docs/recognition-foundation.md` | Updated implementation status to include the real trial worker and assets/loading/benchmark tooling; identified the later phases still pending. |

## New implementation files

| File | Main code and responsibility |
|---|---|
| `assets/model-candidates.json` | Two candidate records with immutable revisions, source URLs, byte sizes, SHA-256 hashes, and license evidence. `selectedModelId` stays null. TrOCR uses the INT8 encoder/decoder pair, not mixed quantization variants. |
| `src/recognition/candidates.ts` | Exports `ModelCandidate`, `getCandidate`, and `assertTrialAllowed`; rejects missing license evidence before preparation/loading. |
| `scripts/model-assets.mjs` | Implements prepare/verify commands. Downloads only pinned candidate files, verifies source size/hash, copies local WASM companion files, and generates an ignored complete model/runtime manifest. Prevents file destinations escaping `public/`. |
| `src/recognition/local-assets.ts` | `assetUrl` preserves repository base paths and rejects invalid paths. `verifyLocalAssets` checks fetched file sizes and SHA-256 in the worker initialization path. |
| `src/ink/replay.ts` | Shared quadratic path replay with round caps, single-point dots, and chronological pen/mask compositing. Both capture UI and worker use it. Developer A should coordinate this helper with the final renderer. |
| `src/recognition/rasterize.ts` | Clips row ink to the 136-unit writing band in `OffscreenCanvas`, finds surviving alpha bounds, crops with padding, restores page-space y coordinates, and prepares CoMER's grayscale tensor/padding mask. Tiny dots are retained; original erased strokes are not fed unchanged to inference. |
| `src/recognition/adapters/ink-on.ts` | Implements real local CoMER initialization and recognition using `ink-on/core`. Checks required vocabulary, forces one WASM thread after the upstream import, uses number mode/beam width 3, returns transcript/timings/bounds, and disposes sessions. |
| `src/recognition/adapters/trocr.ts` | Candidate adapter code using local-only Transformers.js, an INT8 pair, white-background input, and bounded generation. License gate prevents initialization; this adapter has not been runtime-verified with the blocked weights. |
| `src/recognition/trial-worker.ts` | Handles the existing `INIT`, `RECOGNIZE`, and `DISPOSE` message types. Serializes jobs, checks candidate/config/revision and same-origin assets, and emits progress, readiness, results, and identity-bearing errors. |
| `src/recognition/trial-client.ts` | Explicit-run client for load/retry/unload, 90-second initialization timeout, 10-second inference timeout, one pending inference, all request-identity checks, and cancellation of loads/results after unload. Reactive debounce remains Phase 3. |
| `src/recognition/loading-state.ts` | Shared `LoadingState` union and reducer for loading, ready, and recoverable initialization failure. Ignores another candidate's progress and supports indeterminate progress. |
| `src/recognition/benchmark.ts` | Normalizes equivalent operator glyphs/spacing, computes Levenshtein CER, exact expression accuracy, nearest-rank p95, and the 22/24 plus 2-second development gate. Rejects duplicate IDs/invalid timings and marks missing samples incomplete. |
| `scripts/benchmark-report.mjs` | Recomputes exported metrics independently. Verifies model revision, development IDs, expected expressions, included ink fixtures, and license gate rather than trusting a stored summary. |

## New lab and verification files

| File | Main code and responsibility |
|---|---|
| `tools/model-lab/index.html` | Evaluation controls: candidate load/retry/unload, writer/split/sample, capture canvas, save/undo/clear, recognize, run benchmark, and export/import. |
| `tools/model-lab/main.ts` | Wires pointer capture, coalesced-event fallback, DPR/resizing, sample storage/import/export, worker loading, stale visible-result suppression, and sequential warmed benchmark execution. Resizing committed ink keeps its accepted transcript; cancelled active gestures invalidate it. |
| `tools/model-lab/style.css` | Responsive lab layout, ruled capture surface, visible focus states, and controls at least 44 CSS pixels tall. |
| `tools/model-lab/cases.ts` | Reference prompts and stable IDs for 24 development samples and 50 separate held-out samples, split equally between writers A/B. |
| `tools/model-lab/fixtures.ts` | Validates fixture schema, known IDs, duplicate IDs, timestamps, row membership, geometry, finite coordinates, width, and point/sample limits before import/storage. |
| `vite.lab.config.ts` | Isolated development/production-preview configuration with a module worker and `CALCINK_BASE_PATH` support. Outputs `dist-lab/`; it does not create the final React app. |
| `tests/unit/phase1.test.ts` | Candidate gates, pinned metadata, benchmark correctness, base paths, asset failures, loading transitions, dot/blank bounds, row offsets, and fixture-plan validation. |
| `tests/unit/trial-client.test.ts` | License rejection before fetch, stale request rejection, pending-request unload, and cancellation during manifest fetch. |
| `docs/phase-1-model-evaluation.md` | Implementation evidence, model review, capture/benchmark instructions, target definitions, Developer A integration, and pending release gates. |
| `docs/licenses/ink-on-Apache-2.0.txt` | Retains the pinned upstream package/repository license for attribution. |
| `docs/phase-1-change-summary.md` | This review/commit guide. |

## Verification actually performed

- `npm run check`: passed.
- `npm run test:unit`: **30 tests passed** across three files, including all six Phase 0 tests.
- `npm run assets:prepare`: downloaded/verified the comparison model and prepared seven model/runtime files.
- `npm run assets:verify`: all seven files passed verification.
- `npm run build:lab`: passed.
- Development browser: real local initialization/inference worked. The disposable automated `1 =` input produced `1 = =`; approximately 60 ms preprocessing and 617 ms inference were observed once. This is not handwriting benchmark evidence.
- Production preview: the bundled worker and local model initialized successfully without browser console errors.
- Report CLI: recomputation accepted a synthetic valid test report and rejected altered ground truth. These synthetic inputs were used only for tool verification.
- TrOCR asset command: rejected unresolved licensing before attempting weight downloads.

No actual 24-sample handwriting accuracy, p95, final model selection, held-out result, offline reload result, or public deployment is claimed.

## Your next steps

```powershell
cd "C:\Users\kushagra\OneDrive\Desktop\hj\CalcInk"
npm run dev:lab
```

Open `http://127.0.0.1:5173/tools/model-lab/`. If a server is already running, reuse its URL rather than launching another instance on the same port.

The tested production preview is also available at `http://127.0.0.1:4173/tools/model-lab/`. Sample storage differs by port; export/import samples when switching between development and preview.

1. Capture/save your 12 **writer B / Development** expressions.
2. Developer A captures the 12 **writer A / Development** expressions and exports them.
3. Import/merge the two sets, then run the 24-sample benchmark and export the report.
4. Capture the held-out samples separately and reserve them for Phase 6.
5. Share the development report to finish the model decision. A below-target report is useful evidence; do not conceal failed transcripts or replace them with manual corrections in the automatic score.

## Review and commit yourself

The source changes are currently unstaged on your existing branch.

```powershell
npm run check
npm run test:unit
npm run assets:verify
npm run build:lab
git diff --check
git status --short

git add .gitignore README.md package.json package-lock.json tsconfig.json vite.lab.config.ts
git add assets scripts src/ink src/recognition tests/unit docs tools/model-lab
git diff --cached --stat
git diff --cached --check
git commit -m "feat(recognition): add local model evaluation lab and asset verification"
```

Review the staged files before committing. Generated model/runtime files and `dist-lab/` should not be staged. Keep real exported handwriting fixtures and reports only when you intentionally add them as evaluation evidence.
