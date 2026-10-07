# Notebook redesign

Implemented in the existing CalcInk checkout, 7 October 2026. Changes are left
uncommitted for review. Screenshots show the actual local production build, not a
mock answer or a deployed update.

## Design and working controls

- Georgia Italic 400 for the wordmark, page titles and headings; local Inter 400
  for controls and status. Answers use Comic Sans MS / Comic Sans when installed,
  falling back to bundled Inter. Numeric answers retain equal digit advances.
  Their visible glyph height follows the expression's ink height, centered beside
  its right edge with a 12-unit gap. Fonts range from 16 to 128 units and shrink
  only when required to fit the available page width. PNG exports use the same layout.
- Cream background, soft white paper, charcoal outlines, butter-yellow selected
  tools, lavender focus controls and deep-sage answers. Rounded paper and small
  offset shadows give the interface a light comic character.
- One continuous writing page with thin 40-unit ruling, coral margin, editable title,
  page number and soft active-line highlight. Decorations stay outside the ink
  layers sent to the model.
- Collapsible page navigation, up to twelve pages, independent session histories,
  Focus mode, 100/125/150% zoom and Move mode. Narrow screens wrap the tools and
  scroll the paper horizontally instead of changing stored stroke coordinates.
- Pen, both erasers, width, undo, redo, undoable clear and retry keep their existing
  behavior. Reading, unreadable, incomplete, invalid and undefined feedback retain
  the underlying arithmetic outcomes beside their writing line.
- More exports the active page as PNG, downloads a complete JSON notebook backup,
  and restores validated backups. Invalid imports preserve the current notebook;
  replacing existing ink asks for confirmation after validation.

## Geometry and recognition

The logical page is 960 × 1280. Strokes can cross the entire page, including the
old section edges and 24-unit gaps. Row numbers and section backgrounds are gone;
only decorative notebook ruling and a thin active-line highlight remain. Pointer
input and canvas sizing use `src/document/rows.ts`. DPR changes and zoom replay the
same immutable operations. Rules and the margin are CSS decoration.

Nearby writing is associated with one of 32 internal expression identities. These
identities have no clipping boundaries. Vertical proximity is a grouping heuristic;
the calculator still expects a single horizontal arithmetic expression per group,
not arbitrary notes, diagrams or simultaneous side-by-side calculations. Existing
eight-row JSON backups still restore at their original page coordinates. Development
capture anchors retain their old positions without showing divided sections.

Whole-stroke and pixel erasers sweep all groups, with one atomic history command
per gesture. Each group's masks composite independently so later ink in another
group survives. A small reusable bitmap around actual ink avoids full-page bitmap
allocation on every pen lift. Recognition crops and answer positions follow ink
bounds, so crossing a former row edge preserves both visible and model input ink.

The collection exposes one stable document interface to the coordinator. Changing
pages advances its global epoch, cancels provisional ink and invalidates replies
from the previous page. Page changes reuse the worker. Restoring a notebook
revalidates its rows and operations and schedules fresh recognition; cached
answers and old revision identities are not trusted.

The selected ink-on CoMER INT8 model, model preprocessing, strict decimal
arithmetic and offline delivery remain in place. This redesign does not establish
new handwriting accuracy or add TrOCR as a fallback.

## Saving and recovery

Completed edits and titles save to `calcink-notebooks` IndexedDB after 500 ms. Wait
for **Saved on this device** before leaving. Saved pages and ink restore on reload;
undo history starts fresh. Each page retains up to 100 history commands in a
session, with existing limits of 1,000 operations and 200,000 points per page.

A Web Lock allows one saving tab per origin. Other tabs, browsers without locking,
and failed storage reads stay session-only and can export a backup. Write failures
preserve ink and expose Retry save. Browser/profile data removal also removes local
notebooks; downloads provide a portable backup. There is no cloud synchronization.

Held-out capture pauses ordinary saving, notebook export and page management;
the existing dedicated capture export remains available. Model recognition stays
disabled for held-out capture. Offline updates check for ink on all pages.

JSON restoration accepts this version's geometry and at most twelve pages, with
validated row identities, coordinates, operation types and capacity. Imports above
256 MiB are rejected before reading. PNG export snapshots the current page and
accepted results, waits for Inter, then composites paper and actual ink.

## Changed files

| Files | Change |
| --- | --- |
| `src/app/App.tsx`, `Notebook.tsx`, `styles.css` | Notebook layout, navigation, controls, responsive paper, active line, saving/import states and font readiness |
| `src/app/Icon.tsx`, `export.ts` | Consistent outline icons and composited PNG/download helpers |
| `src/app/fonts/inter-latin-400-normal.woff2` | Locally bundled Inter Regular |
| `src/document/rows.ts` | Shared continuous-page geometry, ruling and internal identities |
| `src/document/store.ts` | Validated immutable document hydration |
| `src/document/notebooks.ts`, `persistence.ts` | Page collection, stale-reply isolation, local saving and exclusive writer lifecycle |
| `src/ink/replay.ts`, `geometry.ts`, `eraser.ts`, `groups.ts`, `src/rendering/replay.ts`, `results.ts` | Full-page bounds, spatial grouping, page-wide erasing, isolated mask replay and Comic Sans/sage answers |
| `src/recognition/rasterize.ts`, `coordinator.ts` | Actual ink crops and scheduling of all expression identities |
| `tests/unit/notebooks.test.ts`, `foundation.test.ts`, `results-eraser.test.ts`, `free-page.test.ts` | Page/history/restore safety, free-page geometry, atomic multi-group edits and equal digit spacing |
| `tests/e2e/notebook-design.spec.ts` | Pages, recovery, zoom, Move, export/import, font loading and multi-tab protection |
| `tests/e2e/capture.spec.ts`, `history.spec.ts`, `release.spec.ts`, `results-erasers.spec.ts` | Geometry, focus order and autosave-aware interaction regression checks |
| `tests/production/offline.spec.ts`, `tests/public/offline.spec.ts`, `tests/performance/notebook.spec.ts` | Shared geometry for real-model checks, including active-row measurement |
| `playwright.offline.config.ts` | Separate offline output directory so concurrent checks preserve sibling test downloads and reports |
| `docs/licenses/inter-OFL.txt`, `public/inter-OFL.txt` | Font license, also shipped in the offline artifact |
| `README.md`, `docs/architecture.md`, `docs/screenshots/*`, `docs/notebook-performance.json`, this file | Current behavior, actual production UI capture and measured performance |

## Font provenance

Inter Latin Regular is pinned to `@fontsource/inter@5.2.8`, bundled directly without
adding a runtime network dependency. License: SIL Open Font License 1.1.

- Font source: `https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.8/files/inter-latin-400-normal.woff2`
- Font SHA-256: `8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc`
- License source: `https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.8/LICENSE`
- License SHA-256: `3b0a5fca3d17942cde889069889dedbbbd075e9b599968c82a95f4d944e9b345`

Georgia uses the installed system font, with a serif fallback when unavailable.

## Review and verification

```powershell
npm run dev
```

Use the printed URL for the actual model. `npm run dev:mock` exposes clearly labeled
synthetic fixtures for development only. For the offline production build:

```powershell
npm run build:pages
npm run preview -- --base /CalcInk/ --port 4183
```

Automated verification: typecheck/Biome passed (six existing non-null assertion
warnings), 196 unit tests, eight asset tests, and 32 development browser tests.
The optional development real-model test was skipped; the production offline suite
uses actual WASM inference separately. Production verification rejects fixture UI
and mock workers. Desktop and 320/390px layout checks cover overflow, touch target
sizes, contrast and focus; synthetic mouse/pen/touch and DPR checks cover alignment.

The complete continuous-page interaction suite passed 32 tests. After optimizing
group compositing, the affected history/eraser/notebook suite was checked again.
The real-model performance test passed on build `66b990cae75101193a29e4a0` and its
raw report is retained in `docs/notebook-performance.json`. It measured 60.98 seconds
of held-pointer drawing and 200 edit/clear cycles on an i5-12450H, headless Chromium
153, 1280 × 720, DPR 2: drawing frame p95 16.8 ms, observed rAF 59.11/s,
input-to-next-rAF p95 19.3 ms, zero observed long tasks during drawing, and one
recognition worker. These are synthetic timing proxies, not physical pen latency
or handwriting accuracy. Production offline checks exercise actual local WASM,
cache verification, recovery and safe updates; all five passed on this build.

Screenshots use production build `66b990cae75101193a29e4a0` with actual model/offline
readiness and an empty notebook. Review their exact metadata in
`docs/screenshots/capture.json`. Physical stylus/touch acceptance and the genuine
handwriting release gate still require recorded human samples and device results.
Earlier release/performance reports describe their recorded builds, not this UI's
final acceptance.
