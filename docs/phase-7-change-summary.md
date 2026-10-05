# Phase 7 batch: changes and verification

## Files

| File | Change |
|---|---|
| `docs/release-checklist.md` | One owner/status/evidence checklist for A, B and joint work, including explicit unresolved gates. |
| `docs/architecture.md` | Current browser/thread/document/worker/math/offline architecture and actual module paths. |
| `docs/model-attribution.md` | Selected model and runtime, pinned catalog files/bytes/hashes, preprocessing, license evidence and measured scope. |
| `docs/manual-acceptance.md` | Ready-to-fill physical input, genuine offline and evaluation/sign-off record; all unavailable results remain Pending. |
| `docs/demo.md` | Genuine live-demo preparation and step-by-step recording script. |
| `docs/phase-7.md` | Fresh setup evidence, reproducible Windows commands, browser checks and submission package. |
| `docs/evidence/phase-7-clean-setup.json` | Actual fresh clone/install/code/assets/build observations and locked source identity. |
| `docs/evidence/phase-7-browser-checks.json` | Actual development/evaluator/offline/public browser results with scope limitations. |
| `docs/screenshots/desktop.png`, `mobile.png`, `capture.json`, `README.md` | Inspected real production empty-notebook screenshots with browser/build/viewport provenance. |
| `README.md` | Product usage, screenshots, release status and links to the consolidated documentation. |
| `docs/joint-release-decision.md` | Dated follow-up reflecting unavailable manual results and Phase 7 work. |

No product/runtime source, model choice, dependency, service worker or deployment workflow changed.
Generated models, builds and synthetic evaluation exports remain ignored. The accidental
untracked file in the original checkout is excluded.

## Execution

The original OneDrive checkout's `.git/FETCH_HEAD` stayed read-only even after a
Git metadata permission grant. Phase 7 clean setup was therefore performed in a
separate normal HTTPS clone on the same `b/recognition-foundation` branch under
the writable Codex workspace. Implementation, validation and the authorized
commit/push use that clone. After the push, the original unchanged checkout can
receive the branch update with `git pull --ff-only origin b/recognition-foundation`.

Validation results and limits are in [Phase 7](phase-7.md). This batch closes the
automatable documentation/reproducibility work. It does not supply missing genuine
handwriting, physical-device approval, an actual live demo recording, developer
sign-off, a release tag or submission on the team's behalf.
