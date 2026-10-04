# Phase 1 — Model evaluation and loading integration

## Implementation status

Phase 1 tooling is implemented. Final model selection is pending the team's real handwriting samples. `assets/model-candidates.json` intentionally keeps `selectedModelId` null. No development accuracy percentage or p95 has been measured on the required 24-sample set.

Verified on 3 October 2026:

- Phase 0's six tests still pass; the combined suite covers candidate gates, loading, identity matching, cancellation, fixture validation, and benchmark scoring.
- Real ink-on initialization and recognition run in a module worker, with locally served ONNX and WASM files and one WASM thread.
- A disposable automated `1 =` drawing returned raw transcript `1 = =`. The integration works, but this smoke test does not establish recognition accuracy. It was not saved as a development or held-out sample.
- The first observed smoke request used approximately 60 ms preprocessing and 617 ms inference in the in-app browser. This is one observation, not a p95 or representative handwriting benchmark.
- Downloaded ink-on model assets total 7,582,523 bytes. Prepared model plus runtime files total 40,730,526 bytes. Generated assets are ignored by Git.

Phase 2 now postprocesses real adapter output in the trial worker: it retains raw text and adds normalized text, a calculation outcome, and evaluation timing. The adapters' internal `EVALUATION_ONLY` status is consumed by this pipeline; decoder-limit failures are preserved. See [Phase 2 arithmetic](phase-2-arithmetic.md). Debounce and reactive document scheduling are Phase 3. Complete offline cache/reload readiness is Phase 5; `Local model ready` does not imply `Ready offline`.

## Candidate review

| Candidate | Evidence and decision |
|---|---|
| MathWriting TrOCR INT8 | Initial accuracy candidate. Export revision `cdc13b093c439bb894fd11d8bbd8d237ed16a257`. Both encoder and decoder use the INT8 variant; their weights are approximately 388 MB together, and the full chosen model/config set is 392,880,983 bytes. File presence does not prove browser compatibility. The export and fine-tune metadata provide no explicit license field or LICENSE file; preparation/loading remains blocked. The integration code is not runtime-verified for this candidate. |
| ink-on CoMER INT8 | Comparison candidate using repository revision `2585994ee11fe2ed98065c555c4aae8ee9096209`, with the root Apache-2.0 license and model files in the same repository. Retain the license and attribution and review additional upstream weight conditions before final release. Local WASM initialization/inference is verified. Selection still requires the same handwriting benchmark. |

TrOCR's upstream card reports 14.9% character error rate; ink-on reports 36.41% expression accuracy on CROHME2014. These are different metrics/data and cannot establish which model performs better on CalcInk. We do not convert CER into expression accuracy.

The pinned ink-on repository vocabulary has **113** entries and includes digits, plus, minus, decimal, equals, `\times`, and `\div`. Its JSON serialization differs from the release asset: the catalog uses the actual pinned repository file's size/hash. The encoder and decoder match their published release checksums.

## Start the lab

From the repository root:

```powershell
npm ci --ignore-scripts
npm run assets:prepare
npm run assets:verify
npm run dev:lab
```

Open `http://127.0.0.1:5173/tools/model-lab/`.

`--ignore-scripts` is sufficient for this browser lab: Node-native ONNX inference and image processing are not used. npm's packaged platform-specific Vite dependencies are used for the build.

1. Choose ink-on, then **Load / retry**. Missing assets, digest mismatches, unsupported worker rasterization, and initialization errors are surfaced in status.
2. Select writer **A** or **B**, keeping **Development** selected.
3. Handwrite the displayed expression, including its final equals sign. Save the sample. Capture all 12 expressions for each writer.
4. Use **Export samples** to exchange files. **Import samples** merges by sample ID, so both writers can capture separately. Duplicate IDs replace the same sample; unknown IDs and invalid coordinates are rejected.
5. Capture the 25 held-out expressions per writer separately. Do not use them to tune preprocessing or choose the initial model. They are reserved for Phase 6.
6. After merging all 24 development samples, choose **Run 24 samples**. It performs one unmeasured warm-up and then sequential real inferences.
7. Export the report and verify it independently:

```powershell
npm run benchmark:report -- "C:\path\to\calcink-ink-on-comer-int8-development-report.json"
```

The script recalculates metrics rather than trusting the exported summary; it checks candidate revision, all 24 IDs, ground truth, and included ink fixtures. Synthetic automated test fixtures are never evidence of handwriting accuracy.

Sample ink is kept in browser local storage after **Save sample**. Unsaved ink is temporary. Export samples before clearing browser data; quota errors preserve the previous saved set and are shown in capture status.

Storage is tied to the browser origin, including the port. Development (`5173`) and production preview (`4173`) have separate sample storage. Use one consistently or export/import when switching.

## Benchmark definition

- Development set: 24 samples, 12 from each writer, covering every required digit/operator, decimals, negatives, multi-digit numbers, and equals.
- Held-out set: 50 separate samples, 25 from each writer; not used by the Phase 1 benchmark.
- Exact expression comparison normalizes whitespace and explicitly equivalent operator glyphs/commands. Decimal points, minus signs, order, and terminal equals remain significant.
- Fractions, powers, duplicate equals, and unsupported LaTeX structures are not silently rewritten into a passing arithmetic expression.
- Character error rate uses Levenshtein edits divided by reference character count. It is reported separately from exact expression accuracy and may exceed 100%.
- p95 uses the nearest-rank method over all 24 timed entries. Successful timings include worker preprocessing plus inference; cold model loading and the initial warm-up are excluded. Failures remain in accuracy and invalidate the gate.
- Internal development targets: at least 22/24 exact matches, p95 at most 2,000 ms, and no runtime failures. These are engineering targets, not official guarantees.
- Passing this development gate still requires offline reload, deployment size, attribution, and later held-out evaluation. Missing samples produce `incomplete`, never a passing score.

## Developer A integration

`src/recognition/loading-state.ts` exports `LoadingState` and `reduceLoading`. Loading progress may be indeterminate (`fraction: null`); display an indeterminate progress bar rather than inventing a percentage. Initialization errors carry `key: null`; request errors carry their revision identity.

`TrialClient` is an explicit-run lab client with load/retry/unload and one request at a time. It preserves identities and rejects obsolete replies, unloads, and timeouts. It is not the final edit coordinator. In Phase 3, replace its explicit-run scheduling with document-event debounce and a bounded per-row queue.

`src/ink/replay.ts` supplies shared quadratic curve replay, round dots, and chronological `source-over`/`destination-out` compositing. Use or coordinate this helper in the final ink renderer so model input and visible erasure agree. The worker clips to the 136-unit writing area and translates bounds to logical page coordinates.

The lab is isolated in `tools/model-lab/` and uses `vite.lab.config.ts`; it does not define the final React interface. Developer A can add the application shell separately.

## Verification and review

```powershell
npm run check
npm run test:unit
npm run assets:verify
npm run build:lab
git diff --check
git status --short
```

Review the Phase 1 source and docs before making a commit. No commit, staging, push, or branch switch is performed by the implementation workflow.

Suggested commit message: `feat(recognition): add local model evaluation lab and asset verification`.

## Sources and notices

- [TrOCR ONNX export](https://huggingface.co/onnx-community/latex_finetuned-ONNX), [original fine-tune](https://huggingface.co/tjoab/latex_finetuned).
- [ink-on source](https://github.com/kimseungdae/ink-on), [pinned license](https://github.com/kimseungdae/ink-on/blob/2585994ee11fe2ed98065c555c4aae8ee9096209/LICENSE), [release checksums](https://github.com/kimseungdae/ink-on/releases/tag/v0.1.0).
- [Transformers.js local loading](https://huggingface.co/docs/transformers.js/custom_usage). The installed SDK is pinned at 4.3.0; runtime files must come from its resolved ONNX dependency rather than another version's CDN.

The project retains ink-on's Apache-2.0 license in `docs/licenses/ink-on-Apache-2.0.txt`. No upstream source file was copied verbatim. CoMER preprocessing conventions are described above and implemented against the already-composited alpha image.
