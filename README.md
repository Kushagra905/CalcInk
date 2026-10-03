# CalcInk

On-device handwritten math calculator for the Inter IIT Software Development Bootcamp.

## Notebook foundation (Developer A)

The foundation includes a React/TypeScript/Vite notebook, three aligned Canvas 2D layers,
smooth pen capture, immutable document snapshots/edit events, global undo/redo, undoable clear,
and shared recognition contracts. Real recognition and deterministic arithmetic are available
in the model lab. Reactive notebook recognition/inline answers, erasers and offline caching
remain pending.

Use Node.js 22.12+ (tested here with Node.js 24). Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run dev:mock
```

Open the local URL printed by Vite. **Load sample fixture** sends synthetic ink through
document events, the development coordinator, and an actual module worker, then displays
the supplied `18+4×3=` transcript on row 1. It does not recognize handwriting or calculate an answer.

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

Share **only the development export** with B for model selection. Recognition is disconnected
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

`npm run dev` runs the notebook without a recognizer. The recognition entry point explicitly reports
that no local model is connected. Mock code is selected only by the development server's `mock` mode;
production builds exclude it and reject `--mode mock`.

## Checks

```sh
npm run check
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run build
npm run verify:production
npm run preview
```

`check` runs TypeScript plus Biome formatting/linting. `npm run format` applies formatting.
Playwright starts the mock server automatically and tests the real browser-worker path.
Unit tests need no model files. The model lab provides `assets:prepare`/`assets:verify` for local model assets. Final release/offline checks remain pending.

The initial CI workflow runs these foundation checks on pushes and pull requests; it does not deploy.
Production verification attempts a mock-mode build and checks the actual output for mock-worker/fixture leakage.

## Integration with Developer B

See [the Phase 0 contract](docs/phase-0.md). The document store owns epoch/row revisions;
the coordinator owns request IDs and accepted results. Review these interfaces together before merging.
Neither the mock tests nor the synthetic fixture establish model accuracy, latency, or offline readiness.

## Developer B — Phase 1 model lab

Requires Node.js 22.12 or newer. The lab includes worker arithmetic; connecting the real model
and displaying answers in the notebook remain Phase 3.

```powershell
npm ci
npm run assets:prepare
npm run assets:verify
npm run dev:lab
```

Open `http://127.0.0.1:5173/tools/model-lab/` to initialize the local comparison model, import
the notebook's development captures, and export measured development reports. The lab uses
port 5173, so stop an existing notebook server before starting `dev:lab`. The same lab URL is
also available while `dev:mock` runs. Keep held-out exports separate until Phase 6.

The TrOCR fine-tune remains blocked because its weight license is unresolved. ink-on is a comparison candidate; no final model or handwriting accuracy is claimed yet.

Read [Phase 1 model evaluation](docs/phase-1-model-evaluation.md) for sample capture, benchmark targets, loading integration, asset provenance, and review commands.

```powershell
npm run check
npm run test:unit
npm run build:lab
```

After preparing assets, enable the optional real-model browser check in PowerShell:

```powershell
$env:CALCINK_MODEL_TEST = '1'
npm run test:e2e -- --workers=4
Remove-Item Env:\CALCINK_MODEL_TEST
```

Ordinary CI skips this asset-dependent check. Automated marks never count as genuine
handwriting or measured development accuracy.

## Shared integration status

The readonly document types, shared sample plan/import format and quadratic replay now serve
both implementations. The notebook callback API and trial worker transport remain separate;
their reactive integration belongs to Phase 3. The store owns revisions/epoch, and history
never rolls them back. Genuine Phase 1 trial evidence is still pending.
