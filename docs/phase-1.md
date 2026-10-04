# Phase 1: capture and model-lab integration

The guided notebook collection uses Developer B's expression list and sample IDs from
`tools/model-lab/cases.ts`, merged into main through PR #2 (`9df4cd2`). Each writer supplies
12 development and 25 held-out samples: 24 and 50 captures in total.

## Collection and interchange

- Run `npm run dev:mock` for guided collection. Select writer, dataset, row, actual input
  device and device/browser description, then write and confirm the prompt.
- Reference text and values are labels, not model results. Cramped-spacing prompts,
  natural decimal dots and writer/device metadata remain part of collection.
- Samples use IndexedDB `calcink-handwriting-v2` and IDs such as `dev-A-01` and `held-B-25`.
  The previous database is preserved and never silently relabeled. The user confirmed
  no genuine samples were saved before this plan change.
- Saves wait for transaction completion. Failed writes preserve ink. Reused stroke IDs
  and inconsistent writer labels are rejected. Successful saves clear only the captured
  row; ink changed during saving is retained.
- Export development and held-out separately. Bundles use `schemaVersion: 1`; records use
  B's `sampleId` and retain expected text/value, provenance, writer, spacing and device
  metadata. The completion flag describes actual local records only.
- Exported points and bounds are translated into row-1 coordinates. `captureRowId` records
  the original row. Stored page geometry stays unchanged. Every export is checked by the
  actual lab `parseFixtures` importer.
- Import development JSON in `/tools/model-lab/`. Writers on separate devices export
  partial sets with distinct slots; the lab combines them by sample ID.
- Held-out capture disconnects recognition. Setup changes discard unsaved ink/history,
  preventing Undo from reintroducing earlier prompts or held-out strokes. The lab also
  disables initialization/inference in held-out mode and exports one split at a time.
  Keep held-out files out of model selection and preprocessing adjustments.

Persistence/counts are local to browser profile and origin, including port. Export backups.
Developer capture/mock code is excluded from notebook production. Loading progress, errors
and retry retain drawing input. `?mock=slow-init` is a UI test, not a loading measurement.

## Actual evidence and remaining gate

The pinned ink-on assets were prepared and all seven model/runtime files verified by hash.
A Chromium check initialized the actual local WASM worker, ran inference and returned an
arithmetic outcome without external requests. Automated strokes verify engineering only;
they are not genuine handwriting or accuracy evidence. TrOCR remains blocked by its
unresolved weight license. On October 4, 2026, the user selected MathWriting TrOCR INT8
as the final model (`trocr-mathwriting-int8`). This records the choice; it does not
establish licensing, browser feasibility or handwriting accuracy.

Phase 1 engineering is ready for collection/trial. Completion still requires genuine
samples and measured TrOCR validation: development accuracy, warmed p95 latency,
reference hardware, licensing and asset feasibility. Targets are at least 22/24 exact
transcriptions and p95 at most two seconds. The 50 held-out captures remain reserved for
Phase 6. Phase 3 notebook recognition/result integration is now implemented; the real
TrOCR demonstration remains blocked by weight-license evidence and pending genuine samples.
