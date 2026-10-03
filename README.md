# CalcInk
On-device handwritten math calculator for Inter IIT Software Development Bootcamp

## Developer B — Phase 1 model lab

Requires Node.js 22.12 or newer. The calculator frontend and arithmetic pipeline are later phases.

```powershell
npm ci --ignore-scripts
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
