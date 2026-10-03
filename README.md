# CalcInk

On-device handwritten math calculator for the Inter IIT Software Development Bootcamp.

## Phase 0

The foundation includes a React/TypeScript/Vite notebook, three aligned Canvas 2D layers,
basic pen capture, immutable document snapshots/edit events, and shared recognition contracts.
Real recognition, arithmetic, history, erasers, inline answers, and offline caching are not implemented yet.

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
Unit tests need no model files. `assets:prepare`/`assets:verify` and release/offline checks belong to
the later model/asset integration; no placeholder scripts claim to verify unavailable assets.

The initial CI workflow runs these foundation checks on pushes and pull requests; it does not deploy.
Production verification attempts a mock-mode build and checks the actual output for mock-worker/fixture leakage.

## Integration with Developer B

See [the Phase 0 contract](docs/phase-0.md). The document store owns epoch/row revisions;
the coordinator owns request IDs and accepted results. Review these interfaces together before merging.
Neither the mock tests nor the synthetic fixture establish model accuracy, latency, or offline readiness.
