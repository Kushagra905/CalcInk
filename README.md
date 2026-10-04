# CalcInk

On-device handwritten math calculator for the Inter IIT Software Development Bootcamp.

## Notebook foundation (Developer A)

The foundation includes a React/TypeScript/Vite notebook, three aligned Canvas 2D layers,
basic pen capture, immutable document snapshots/edit events, and shared recognition contracts.
The notebook currently uses the development mock. Real recognition and deterministic arithmetic are available separately in the model lab below; history, erasers, inline notebook answers, and offline caching remain pending.

Use Node.js 22.12+ (tested here with Node.js 24). Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run dev:mock
```

Open the local URL printed by Vite. **Load sample fixture** sends synthetic ink through
document events, the development coordinator, and an actual module worker, then displays
the supplied `18+4×3=` transcript on row 1. It does not recognize handwriting or calculate an answer.

To capture handwriting, reset the fixtures, draw on a row, enter the writer and expected text/value,
select development or held-out data, and export JSON. Synthetic or mixed ink is labeled accordingly
and must never count toward handwriting accuracy. Reloading or resetting clears the ink in this tab.

Mock failure cases: `/?mock=init-error`, `/?mock=error`, and `/?mock=out-of-order`.
Initialization and recognition failures offer **Retry recognition** while retaining ink.

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

The CI workflow runs the foundation checks and both notebook/model-lab builds on pushes and pull requests; it does not deploy.
Production verification attempts a mock-mode build and checks the actual output for mock-worker/fixture leakage.

## Integration with Developer B

See [the Phase 0 contract](docs/phase-0.md). The document store owns epoch/row revisions;
the coordinator owns request IDs and accepted results. Review these interfaces together before merging.
Neither the mock tests nor the synthetic fixture establish model accuracy, latency, or offline readiness.

## Developer B — Phase 1 model lab

Requires Node.js 22.12 or newer. Phase 2 adds worker-side arithmetic to recognized model-lab expressions. Connecting the real model to the notebook is Phase 3.

```powershell
npm ci
npm run assets:prepare
npm run assets:verify
npm run dev:lab
```

Open `http://127.0.0.1:5173/tools/model-lab/` to initialize the local comparison model, capture handwriting samples, and export measured development reports.

The TrOCR fine-tune remains blocked because its weight license is unresolved. ink-on is a comparison candidate; no final model or handwriting accuracy is claimed yet.

Read [Phase 1 model evaluation](docs/phase-1-model-evaluation.md) for sample capture, benchmark targets, loading integration, asset provenance, and review commands.

```powershell
npm run check
npm run test:unit
npm run build:lab
```

## Shared integration status

The readonly document types include row snapshots and edit reasons used by both implementations. The Phase 0 notebook worker contract and Phase 1 trial worker protocol remain separate; their unification and shared notebook/worker replay are part of the planned recognition integration, not this merge.

## Developer B — Phase 2 arithmetic

The lab now reports raw text, normalized text, calculation outcome, and separate preprocessing/inference/evaluation times. A recognized expression needs exactly one terminal equals sign. Unsupported notation and malformed expressions are rejected; division by zero returns `Undefined`. Evaluation uses 28 significant digits and displays at most 12 decimal places.

See [Phase 2 arithmetic](docs/phase-2-arithmetic.md) for the grammar, limits, API, changed files, verification, and commit instructions. Recognition accuracy and final model selection still require the real handwriting benchmark.
