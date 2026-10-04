# Phase 6 model acceptance

The current model is **ink-on CoMER INT8**, pinned to revision
`2585994ee11fe2ed98065c555c4aae8ee9096209`, using local single-threaded WASM.
TrOCR remains an optional candidate with its existing license gate.

No genuine development or held-out benchmark has been supplied in this session.
There is no measured handwriting accuracy or genuine-sample p95 to report.
Synthetic drawing and repeated inference in [performance.md](performance.md)
verify engineering behavior; they do not establish recognition accuracy.

Developer B owns the final model evaluation using the existing lab/report tooling:

1. Collect 24 development samples, 12 per writer, using the agreed shared list.
   Use these for model/preprocessing/debugging work.
2. Keep the 50 held-out samples, 25 per writer, separate until final evaluation.
   No synthetic inputs or manual transcript corrections count toward accuracy.
3. Report exact normalized transcription, final arithmetic correctness and
   per-symbol failures separately. Preserve raw model text and failed outcomes.
4. After an unmeasured warm-up, report median/p95 preprocessing, inference and
   total update latency; measure download/initialization separately.
5. Inspect worker/WASM/process memory after repeated cycles and idle. The A-side
   test measures only the main-thread JS heap and cannot certify runtime memory.
6. Run the production WASM baseline in Chromium and an available secondary
   browser, then repeat genuine arithmetic after a disconnected public reload.

The project targets are at least 90% exact normalized transcription on all 50
held-out samples and warmed p95 total update latency at most 2 seconds. Record
actual results if either target is missed. Do not silently repair duplicate
equals or call invalid decoding a successful calculation.

The existing [Phase 1 evaluation instructions](phase-1-model-evaluation.md)
describe capture, report export and independent metric verification. Final
evidence must include the tested commit/build, model/runtime version, device,
OS/browser, genuine sample count, failures and exported benchmark report.
