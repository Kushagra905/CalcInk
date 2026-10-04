# CalcInk: Phase 5 Pages deployment handoff

## Current state

The recognition branch contains the deployment implementation and local verification.
The assistant leaves it uncommitted. The expected public URL is
`https://kushagra905.github.io/CalcInk/`, which returned HTTP 404 on October 4, 2026.
Do not present it as a live demo until the Pages workflow and public check pass.

Ink-on CoMER INT8 remains selected. Developer A's verified offline caching is integrated;
Developer B supplies the asset provenance checks and publishing workflow. No model
weights or generated build files need to enter Git.

## 1. Enable Pages once

In `Kushagra905/CalcInk`, open **Settings → Pages → Build and deployment** and set
**Source** to **GitHub Actions**. Keep the `github-pages` environment restricted to
`main`; any configured environment approval must be completed when the deployment waits.
This follows [GitHub's custom-workflow setup](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

The app and tests use the case-sensitive `/CalcInk/` repository prefix. If the repository
is renamed or a custom domain is introduced, update the Pages build base and prefixed
tests before publishing. The current workflow does not require a PAT or cloud model key.

## 2. Review, commit and push Phase 5

```powershell
Set-Location 'C:\Users\kushagra\OneDrive\Desktop\hj\CalcInk'
git branch --show-current
git status --short
git add -- .github/workflows/ci.yml .github/workflows/pages.yml package.json
git add -- scripts/asset-manifest.mjs scripts/model-assets.mjs scripts/offline-build.mjs scripts/verify-deployment.mjs tests/scripts/asset-manifest.test.mjs
git add -- README.md docs/phase-5.md docs/pages-deployment.md
git diff --cached --check
git --no-pager diff --cached --stat
git commit -m "feat(deploy): complete phase 5 verified Pages delivery"
git push origin b/recognition-foundation
```

Confirm the branch is `b/recognition-foundation` before staging. Explicit paths exclude
the unrelated accidental file and generated assets. Review the staged summary; these
changes cover 11 files. Stop if checks report errors. Publishing occurs only after main
receives the workflow; pushing this recognition branch does not deploy.

## 3. Merge and publish

1. Create or update the recognition-to-main pull request. Review the Phase 5 diff and
   wait for **CalcInk checks** to pass, then merge into main.
2. Open **Actions → CalcInk Pages**. Its build job runs the reusable checks and uploads
   the exact tested production artifact. The deploy job publishes that artifact into
   `github-pages`; the read-only public job checks its tested version and asset hashes.
3. After all jobs pass, open the URL shown by the deploy job/environment. An Actions
   failure or an expected URL alone is not evidence of successful publication.
4. If a rerun is needed, use **Run workflow** on `main`. Dispatch on another branch is
   deliberately skipped. If Pages is disabled, fix the source setting before rerunning.

Deployment is serialized; a running publish is not cancelled by a newer push. Only the
publish job has `pages: write` and `id-token: write`. The build includes locked install,
code/asset tests, actual local model inference, prefixed production build, mock exclusion
and offline browser checks. This follows [GitHub's artifact/deploy job requirements](https://github.com/actions/deploy-pages).

## 4. Verify the public files

With locked dependencies installed locally:

```powershell
npm run verify:deployed -- https://kushagra905.github.io/CalcInk/
```

This command checks the app/model manifest, critical asset sizes and hashes, runtime
provenance, HTML build version and service-worker version. The workflow additionally
requires the public version to equal the version produced by its tested build. It retries
up to three times for short propagation delays. If verification fails after publication,
the site can remain deployed; diagnose the failed job and rerun after correcting it.
The verifier performs HTTP integrity checks, not handwriting or browser caching tests.

Local preview verification uses the same command with
`http://127.0.0.1:4183/CalcInk/` after `npm run build:pages` and a preview on port 4183.
Production URLs require HTTPS; plain HTTP is accepted only for localhost previews.

## 5. Finish genuine public offline acceptance

Use a fresh supported browser profile and record the URL, build version, device and
browser. Load online and wait for **Ready offline**, then disconnect:

1. Handwrite `18+4×3=` and verify an inline `30`.
2. Erase `4`, write `5`, verify `33`, then undo/redo back through both values.
3. Exercise both erasers; remove `=` and verify the numeric answer disappears.
4. Clear, write a new negative-decimal expression and division by zero, and verify the
   appropriate result and `Undefined` behavior.
5. Reload while disconnected, wait for readiness and write a fresh equation. Reload
   clears tab ink/history; successful calculation must come from the new handwriting.
6. Check browser requests for external model/runtime origins and record actual failures.

Automated synthetic marks do not replace this acceptance sequence. Genuine transcription
accuracy, warmed p95, physical-device behavior and memory/frame measurements remain
separate evaluation work. Public/offline acceptance is open until the sequence succeeds.

## Reproduce local checks

```powershell
npm ci
npm run test:assets
npm run check
npm run test:unit
npm run assets:prepare
npm run assets:verify
npx playwright install chromium
$env:CALCINK_MODEL_TEST = '1'
npm run test:e2e -- --workers=2
Remove-Item Env:\CALCINK_MODEL_TEST
npm run build:pages
npm run build:lab
npm run verify:production
npm run test:offline
```

An older generated runtime manifest must be regenerated with `assets:prepare` before
verification. Download caches are keyed by catalog, lockfile and asset tooling and are
never accepted without verification. The build rejects artifacts at 900 MB, below
[GitHub Pages' published-site limit](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
