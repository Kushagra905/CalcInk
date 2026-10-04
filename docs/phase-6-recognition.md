# Developer B: Phase 6 evaluation workflow

## What is implemented

- A separate final-evaluation page in the production-built model lab. The ordinary
  development lab continues to keep held-out recognition disabled.
- Import of one complete guided-capture export or two writer exports: exactly 50
  held-out samples, 25 for each distinct writer. The shared prompt list supplies
  ground truth. Writer/device metadata, duplicate ink IDs, repeated geometry and
  changed labels are checked; bare lab fixtures are rejected.
- The notebook's real document store and recognition coordinator run the frozen
  ink-on WASM model. No alternative evaluator, transcript correction or mock worker
  enters the final measurement path. The page retires its worker after the batch.
- Exact canonical transcription, arithmetic correctness, character edits and
  per-symbol substitutions/deletions/insertions are separate metrics. Raw text,
  invalid/unsupported outcomes and failed sample IDs are preserved.
- Median, nearest-rank p95 and maximum for preprocessing, inference, arithmetic,
  worker processing and total update. Initialization is recorded separately and
  one warm-up is excluded. Total update includes the real 350 ms debounce and
  ends at the next rAF after displaying an accepted result. This is a result
  display-readiness proxy, not physical pen-to-pixel latency; the batch has no
  competing row workload. Hidden tabs or fatal runtime failures abort the batch.
- A frozen lab manifest hashes the emitted files and pins commit, source diff,
  model revision and runtime version. The CLI validates that artifact and fixture
  digest, recomputes outcomes and metrics, and can fail on missed targets.
- The existing 200-cycle production test now records recognition-worker JS heap,
  observed WASM linear-memory capacity and 2/5/10-second idle readings. A history
  regression also checks the reachable recent ink and redo/reset release behavior.
- A public-production browser test prepares caches, disconnects, reloads and runs
  two different synthetic inputs through real inference. Pages public verification
  now includes this browser check after HTTP/hash verification.

## Run the genuine final evaluation

First use the 24 development samples for any model/preprocessing changes. Freeze
the code before inspecting held-out results. The 50 held-out prompts are already
defined in `tools/model-lab/cases.ts`.

1. Start `npm run dev:mock`. In the notebook's guided handwriting capture panel,
   choose **Held out**, writer A/B and the actual input/device. Write each displayed
   prompt yourself; confirm provenance, save, reset and move to the next prompt.
   Held-out mode suppresses recognition. Collect 25 samples per writer and export.
2. Commit the evaluation implementation, then prepare the frozen artifact:

   ```powershell
   npm run assets:prepare
   npm run build:lab
   npm run preview:lab
   ```

3. Open `http://127.0.0.1:4173/tools/model-lab/final.html`. Import the combined
   50-sample export, or both writer exports together. Enter the measurement laptop
   and OS, confirm genuine capture/no tuning/no corrections, and evaluate all 50.
   Keep the tab visible. Close heavy background workloads before measuring.
4. Export the report and verify it against the same frozen `dist-lab`:

   ```powershell
   npm run phase6:report -- 'C:\path\calcink-held-out-final-report.json'
   npm run phase6:report -- 'C:\path\calcink-held-out-final-report.json' --require-targets
   ```

   Verification exits 0 for a valid report even when targets are missed; the
   `--require-targets` form exits 2 when a measured target is missed. Invalid
   provenance, artifact, entries or digests fail either form. Archive the original
   frozen artifact if rebuilding: pass its directory as the optional second argument.
5. Repeat on the available secondary browser with the same samples/artifact.
   Record its device/browser metadata separately. Save actual failures; never
   replace them with manually corrected transcripts. If tuning is necessary after
   examining these results, create a new held-out collection for the next final run.

The initialization number includes local verification, fetching/cache reuse and
runtime initialization. Cache state is not controlled by the page; it is not a
cold-download benchmark. Writer confirmation and checksums establish declared
provenance and consistency, not independent proof that input was handwritten.

## Acceptance criteria and remaining evidence

The project's engineering target is at least **45/50 exact canonical transcripts**
and **p95 total update ≤2,000 ms**, with all required symbols represented and no
manual corrections. These are project targets, not a claimed competition rule.
Arithmetic correctness is reported separately, including exact division by zero.
Unsupported outputs fail; repeated/misplaced equals are never silently repaired.
Symbol alignment is diagnostic: known typography is normalized for edit alignment,
while exact transcription uses the application's stricter acceptance rules.

No genuine 24-development or 50-held-out export has been provided to Developer B
in this session. The browser/CLI regression uses explicitly synthetic test inputs
and is not an accuracy report. Final handwriting accuracy, its warmed latency,
physical mouse/touch/stylus QA and genuine arithmetic after public offline reload
remain pending. See [model acceptance](model-evaluation.md) and
[measured runtime evidence](performance.md).

## Reproduce engineering checks

```powershell
npm run check
npm run test:unit
npm run build:lab
npm run test:evaluation
npm run build:pages
npm run test:performance
npm run verify:deployed
npm run test:public
```

Set `CALCINK_BROWSER_CHANNEL=msedge` for installed Edge and remove it afterwards.
Chromium and Edge share the Chromium engine; these checks do not establish Firefox,
Safari, iOS or Android support. A browser must support worker OffscreenCanvas 2D
and the pinned WASM runtime. Unmeasured devices remain unverified.

On Windows, previews can be run separately to avoid managed-server shutdown waits.
For performance, start `npm run preview -- --port 4183 --strictPort --base /CalcInk/`
in one terminal. In another, set `$env:CALCINK_EXTERNAL_SERVER='1'`, run
`npm run test:performance`, then `Remove-Item Env:CALCINK_EXTERNAL_SERVER`.
For evaluator tests, use `npm run preview:lab -- --port 4193 --strictPort` in the
first terminal and `npm run test:evaluation` with the same environment flag in
the second. Stop each preview with Ctrl+C after testing. Public tests need no preview.
