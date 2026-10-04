# CalcInk

On-device handwritten math calculator for the Inter IIT Software Development Bootcamp.

## Notebook foundation (Developer A)

The foundation includes a React/TypeScript/Vite notebook, three aligned Canvas 2D layers,
smooth pen capture, immutable document snapshots/edit events, global undo/redo, undoable clear,
both erasers, reactive recognition scheduling and accepted inline answers. The notebook
connects to the selected local ink-on CoMER INT8 model. Versioned offline preparation is
implemented; genuine handwriting evaluation and public deployment verification remain pending.

Use Node.js 22.12+ (tested here with Node.js 24). Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run assets:prepare
npm run dev
```

Open the local URL printed by Vite for real ink-on recognition. To collect handwriting or
exercise fixed development fixtures, run `npm run dev:mock` separately. **Load sample fixture** sends synthetic ink through
document events, the development coordinator, and an actual module worker, then displays
the supplied `18+4×3=` transcript and calculated `30` on row 1. This is a fixed development
fixture, not recognition of the ink you draw. The same coordinator/worker protocol handles
debounce, result acceptance and arithmetic in the real path.

For one-off contract tests, reset the fixtures, draw on a row, enter the writer and expected text/value,
and export JSON. These files are labeled `contract` and stay out of handwriting evaluation.
Synthetic or mixed ink is identified explicitly. Use the Phase 1 guided collection for genuine samples.
Reloading or resetting clears unsaved ink in this tab.

Mock failure cases: `/?mock=init-error`, `/?mock=error`, and `/?mock=out-of-order`.
Initialization and recognition failures offer **Retry recognition** while retaining ink.
`/?mock=slow-init` simulates initialization progress while drawing stays available.

## Phase 1 collection

Below the one-off fixture controls, **Phase 1 handwriting collection** guides each of
two writers through 12 development expressions and 25 separate held-out expressions.
It uses B's shared expression list and exports files that his model lab imports directly.
These are reference prompts; no genuine samples or model accuracy are generated automatically.

Select the writer, dataset, row, and actual input device; enter a device/browser description.
The selected expression is repeated above the canvas, with links between paper and sample controls.
Write the displayed expression yourself, confirm it, and save. A successful save advances
to the next missing expression and clears only its row. Other rows and ink drawn during an
in-progress save are preserved. Synthetic/mixed ink and reuse of the same ink for another
sample are rejected. Selecting a saved prompt explicitly replaces that record.

Saved strokes persist in IndexedDB on this browser profile and origin (including the port).
Unsaved canvas ink still disappears on reload. Export each set regularly as a JSON backup;
clearing browser data deletes its saved records. Each export contains one dataset, actual
records, its target count, and an explicit completion flag. Partial exports are supported.
Use consistent writer slots across devices; totals shown are for this browser, not a global count.
The new plan uses `calcink-handwriting-v2`; the earlier database is left intact. Exported
strokes use row-1 coordinates for the lab and retain their original row and capture metadata.

Share **only the development export** with B for ink-on validation. Recognition is disconnected
during held-out capture; returning to development clears unsaved ink before reconnecting.
Keep held-out exports separate until the final evaluation. See [Phase 1 status and handoff](docs/phase-1.md).

## Phase 2 drawing and arithmetic

Pen width applies to future gestures. Undo/Redo follows edit order across all rows, and Clear
can be undone. Use Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y outside text fields. Geometry survives
resize/DPR changes; the notebook and worker use the same smooth curves and visible dots.
Capture setup resets discard history to prevent reuse across prompts or dataset splits.

The real model-lab worker evaluates supported arithmetic with precedence, decimals and unary
signs using decimal.js. Missing equals stays incomplete; malformed text is rejected; exact
division by zero returns Undefined. See [Phase 2 implementation](docs/phase-2.md).

`npm run dev` connects the notebook to the selected local model. Model licensing, missing
assets and initialization failures are shown while ink remains editable. Mock code is selected only by the development server's `mock` mode;
production builds exclude it and reject `--mode mock`.

## Phases 3 and 4

Recognition waits for 350 ms after a completed edit. One inference runs at a time, with
only the latest pending snapshot per row. Editing clears that row's answer immediately;
old replies cannot restore it after drawing, erasing, cancellation, history or clear.
Masked ink is composited in the worker; fully erased rows skip model inference. Unloading
or replacing a model cancels its pending manifest download. Supported transcripts display
as normalized arithmetic while raw model text stays available for benchmarking.
Answers start 12 logical units after surviving ink at the row baseline. They shrink from
32 to 16 logical units; when space is insufficient, status says **Leave room after =**.

Choose **Stroke eraser** to remove whole visible strokes or **Pixel eraser** to remove a
partial brush-width region. Eraser size is the brush diameter in logical page units.
The pixel mask only affects earlier ink; drawing afterward stays visible. Eraser previews
are provisional, cancellation restores committed ink, and each completed erase is one
undoable gesture. At page capacity, stroke erasing, Clear and Undo remain available.
Phase 4 also checks immutable edit snapshots and bounded recognition queues during
repeated edits. Adapter initialization/disposal is coordinated, temporary preprocessing
canvases are cleared, and a failed model runtime is terminated before retry creates a
new worker. Ink and history remain available during recovery.
See [Phase 3 integration](docs/phase-3.md) and [Phase 4 editing](docs/phase-4.md).

## Checks

```sh
npm run check
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run assets:prepare
npm run build
npm run verify:production
npm run preview
```

`check` runs TypeScript plus Biome formatting/linting. `npm run format` applies formatting.
Playwright starts the mock server automatically and tests the real browser-worker path.
Unit and mock browser tests need no model files. Production builds require prepared,
verified model assets. Public offline acceptance and genuine handwriting evaluation remain pending.

CI also prepares the selected assets, builds under `/CalcInk/`, and runs actual production
offline checks. It does not deploy.
Production verification attempts a mock-mode build and checks the actual output for mock-worker/fixture leakage.

## Integration with Developer B

See [the Phase 0 contract](docs/phase-0.md). The document store owns epoch/row revisions;
the coordinator owns request IDs and accepted results. Review these interfaces together before merging.
Neither the mock tests nor the synthetic fixture establish model accuracy, latency, or offline readiness.

## Developer B — Phase 1 model lab

Requires Node.js 22.12 or newer. The lab includes worker arithmetic and benchmarking;
the notebook now uses the same client/protocol through its reactive coordinator.

```powershell
npm ci
npm run assets:prepare
npm run assets:verify
npm run dev:lab
```

Open `http://127.0.0.1:5173/tools/model-lab/` to initialize a local model, import
the notebook's development captures, and export measured development reports. The lab uses
port 5173, so stop an existing notebook server before starting `dev:lab`. The same lab URL is
also available while `dev:mock` runs. Keep held-out exports separate until Phase 6.

**ink-on CoMER INT8 is the current user-selected model** (`ink-on-comer-int8`), replacing
the earlier TrOCR decision. Notebook, lab and asset commands share this default. Real
browser/WASM inference is verified; genuine handwriting accuracy and warmed p95 remain
unmeasured. TrOCR remains an optional candidate with its existing weight-license gate.

Read [Phase 1 model evaluation](docs/phase-1-model-evaluation.md) for sample capture, benchmark targets, loading integration, asset provenance, and review commands.

```powershell
npm run check
npm run test:unit
npm run build:lab
```

The optional development-server real-model check exercises ink-on and also verifies
that explicitly selecting unresolved TrOCR remains blocked:

```powershell
npm run assets:prepare -- ink-on-comer-int8
npm run assets:verify -- ink-on-comer-int8
$env:CALCINK_MODEL_TEST = '1'
npm run test:e2e -- --workers=4
Remove-Item Env:\CALCINK_MODEL_TEST
```

Ordinary CI skips that optional development check, but its production offline suite
runs real ink-on with prepared assets. Automated marks never count as genuine handwriting
or measured development accuracy.

## Phase 5 offline preparation

```sh
npm run assets:prepare
npm run build:pages
npm run preview -- --base /CalcInk/ --port 5174
```

Open `http://127.0.0.1:5174/CalcInk/`. This is the production notebook with real ink-on,
not the fixed mock fixture. **Ready offline** requires both hash-verified critical caches
and successful model initialization. Cached files alone cannot claim readiness.
Initial preparation needs connectivity; errors offer retry without discarding ink.
Missing/corrupted entries and storage quota failures revoke cache readiness. Reconnection
retries preparation. Model attribution and Apache-2.0 license are included in the deployment.

Updates wait for explicit activation. Reload is disabled while a gesture or committed ink
is present, and other CalcInk tabs must close before applying an update. Reload still clears
tab ink/history; save any wanted captures first. Old caches retire after activation.

After `build:pages`, run `npm run test:offline` for fresh-profile production checks under
the repository base path. See [Phase 5 implementation and acceptance](docs/phase-5.md).
The public Pages deployment and genuine offline arithmetic demonstration remain pending.

## Shared integration status

The readonly document types, shared sample plan/import format and quadratic replay now serve
both implementations. Notebook and lab share the nested worker protocol and TrialClient.
The notebook's coordinator supplies reactive scheduling and accepted callbacks. The store
owns revisions/epoch, and history never rolls them back. Genuine ink-on trial evidence is
still pending; selection alone does not demonstrate recognition accuracy.

## Developer B — Phase 2 strict arithmetic

Notebook and lab share the strict worker arithmetic pipeline. Responses retain raw model
text for transcription benchmarks and expose normalized text separately. Exactly one
terminal equals is required; unsupported notation is unrecognized, malformed arithmetic
is invalid, and exact division by zero returns Undefined. The whole expression is parsed
before evaluation. Limits and decimal formatting are documented in
[Phase 2 arithmetic](docs/phase-2-arithmetic.md).

The lab displays raw/normalized text, readable outcomes and all three timing fields.
Held-out mode disables recognition and benchmarking and exports its samples separately.
Ink-on CoMER INT8 is selected; genuine handwriting validation remains pending.
TrOCR remains optional and blocked by its unresolved weight-license evidence.
