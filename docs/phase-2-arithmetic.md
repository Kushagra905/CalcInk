# Phase 2 — Developer B: strict arithmetic pipeline

## Scope and architecture

Implemented: expression normalization, full grammar validation, decimal evaluation, result formatting, worker postprocessing, and readable model-lab outcomes. Developer A still owns drawing/history. The real model is not yet connected to the notebook; debounce, queue replacement, stale-result scheduling, and inline answers belong to Phase 3.

```text
trial-worker → local adapter → raw transcription
             → normalizeExpression → parseExpression (complete AST)
             → evaluateExpression → formatAnswer → RESULT
```

All expression processing for recognition runs in the trial worker. The UI imports only the status-text helper, which does not load the parser or decimal runtime. Model output is never executed with eval or Function.

## Grammar and normalization

```text
expression = term ((+ | -) term)*
term       = unary ((* | /) unary)*
unary      = (+ | -) unary | primary
primary    = number | '(' expression ')'
number     = digits ('.' digits?)? | '.' digits
```

Binary operators are left associative; multiplication/division bind before addition/subtraction. Unary signs bind before binary operators. Parentheses are supported by arithmetic; reliable handwriting recognition of parentheses is not claimed.

- Maps `×`, `·`, `\times`, `\cdot` to `*`; `÷` and `\div` to `/`; Unicode `−` to `-`.
- Removes whitespace and only these LaTeX spacing commands: `\,`, `\;`, `\:`, `\!`, backslash-space, `\quad`, `\qquad`, `\space`.
- Accepts one outer pair of `$…$`, `$$…$$`, `\(…\)`, or `\[…\]`. `\left`/`\right` are allowed only before the matching opening/closing parenthesis character. The parser still validates balance.
- Requires exactly one terminal `=` before returning an answer. Supported partial text without `=` remains incomplete. A complete expression is fully parsed before arithmetic; malformed `8/0+=` is invalid, not a division-by-zero answer.
- Rejects fractions, powers, variables, scientific/hex notation, unknown commands, implicit multiplication, duplicate equals, and text after equals. No missing digits, operators or equals are inserted. Operator typography maps do not repair recognition mistakes.
- Limits raw text to 4,096 characters before processing; normalized text to 128 characters including `=`; arithmetic operators, including unary signs, to 64. Parser calls also enforce length/operator bounds.

## Arithmetic and result states

`decimal.js` 10.6.0 is pinned in the manifest and lockfile. An independent constructor uses precision 28 and round-half-up without changing the library's global settings. Final values use 28 significant digits and at most 12 decimal places, trim trailing zeros, use fixed notation, and normalize negative zero. Exact zero divisors are detected before division; small nonzero divisors are not treated as zero.

The library supports independent constructors and rounding controls; see the [official decimal.js API](https://mikemcl.github.io/decimal.js/). It uses the MIT license included with the installed package.

| Input/state | Outcome |
| --- | --- |
| `18+4×3=` | answer `30` |
| `8÷4÷2=` | answer `1` |
| `-3×-2=` | answer `6` |
| `.5+1.25=` | answer `1.75` |
| `0.1+0.2=` | answer `0.3` |
| `8÷0=` | undefined `DIVISION_BY_ZERO`, shown as `Undefined` |
| `18+4` | incomplete |
| `12+=`, `1.2.3=` | invalid `INVALID_EXPRESSION` |
| `2==` | invalid `MULTIPLE_EQUALS` |
| `\frac{1}{2}=` | unrecognized `UNSUPPORTED_COMMAND` |
| Decoder reaches its limit | unrecognized `OUTPUT_LIMIT`; not evaluated |
| Surviving ink produces no text | unrecognized `EMPTY_TRANSCRIPT` |

Error codes have presentation strings in `src/math/errors.ts`; `describeOutcome` renders them. Runtime failures still use the worker's existing ERROR/retry path.

## API for Developer A

```ts
import { evaluateTranscript } from '../math/evaluate';
// Pure API for tests/tooling. The notebook must consume worker results instead.
evaluateTranscript('18+4×3=');
// { normalizedTranscript: '18+4*3=', outcome: { kind: 'answer', value: '30' } }
```

Recognition responses retain the original `transcript`, revision key, model ID, visible bounds, and preprocessing/inference times. They add optional `normalizedTranscript: string | null` and measured `timing.evaluateMs`. The optional field preserves existing fixtures and callbacks. The `outcome` discriminated union is unchanged. The raw transcript remains the input to the transcription benchmark; latency now includes preprocessing, inference and evaluation.

The trial worker rejects missing OffscreenCanvas/2D support with explicit compatibility errors instead of moving rasterization to the main thread. Decoder bounds must be safe integers from 1 through 128; the lab uses 64. ink-on's existing cap detection is preserved. The license-blocked TrOCR adapter conservatively marks generation that reaches its cap as OUTPUT_LIMIT using streamed token counts; actual TrOCR inference remains unverified while licensing is unresolved.

## Changed files

| Files | Work |
| --- | --- |
| `src/math/errors.ts`, `status.ts` | Limits, error codes, readable presentation strings. |
| `src/math/lexer.ts`, `parser.ts` | Restricted tokens and full recursive-descent grammar. |
| `src/math/evaluator.ts`, `format.ts`, `evaluate.ts` | Decimal arithmetic, output formatting, pure structured API. |
| `src/recognition/normalize.ts`, `evaluate.ts` | Strict normalizer and worker response postprocessing. |
| `src/recognition/protocol.ts`, `contracts.ts` | Optional normalized transcript, preserving existing contracts. |
| `src/recognition/trial-worker.ts` | Arithmetic integration, explicit canvas compatibility checks, decoder limits. |
| `src/recognition/adapters/trocr.ts` | Conservative token-limit detection; license gate retained. |
| `tools/model-lab/main.ts`, `index.html` | Outcomes/normalized text/timing display, compatibility message, total worker latency. |
| `tests/unit/arithmetic.test.ts`, `arithmetic-worker.test.ts` | Arithmetic, invalid/unsupported cases, bounds, formatting, response preservation, actual worker-module orchestration with a mocked model. |
| `package.json`, `package-lock.json` | Pinned decimal.js dependency. |
| `.github/workflows/ci.yml` | Adds a model-lab build gate alongside the notebook build. |
| `README.md`, `docs/phase-1-model-evaluation.md`, `docs/recognition-foundation.md`, this file | Current phase status and handoff. |

## Verify and review

```powershell
npm run check
npm run test:unit
npm run build
npm run build:lab
npm run verify:production
npm run assets:verify
```

Run the lab with `npm run dev:lab`; prepare assets first if absent. Write an expression ending in `=`, initialize the candidate, and click Recognize. Inspect raw text alongside the normalized text and outcome. A correct calculator cannot compensate for an incorrect transcription. No accuracy, p95, offline-readiness, final selection, or inline notebook-answer claim follows from these checks.

The implementation is left uncommitted. From the clean starting main branch, move these edits onto a feature branch before staging:

```powershell
git switch -c b/arithmetic-pipeline
git add -- .github/workflows/ci.yml package.json package-lock.json README.md src/math src/recognition/normalize.ts src/recognition/evaluate.ts src/recognition/protocol.ts src/recognition/contracts.ts src/recognition/trial-worker.ts src/recognition/adapters/trocr.ts tools/model-lab tests/unit/arithmetic.test.ts tests/unit/arithmetic-worker.test.ts docs/phase-2-arithmetic.md docs/phase-1-model-evaluation.md docs/recognition-foundation.md
git diff --cached --stat
git diff --cached --check
git commit -m "feat(math): implement strict worker arithmetic pipeline"
git push -u origin b/arithmetic-pipeline
```

If the branch already exists, use `git switch b/arithmetic-pipeline` rather than creating it again. Review the staged changes before committing. Generated assets/build outputs stay ignored.

## Local verification record — 4 October 2026

- TypeScript and Biome check: passed (existing nonblocking lint warnings).
- All 120 unit tests across six files passed, including 83 new Phase 2 cases.
- Notebook and model-lab production builds passed.
- All seven model/runtime files verified; production verification passed.
- Real browser worker initialized ink-on and ran inference on disposable, unsaved test ink. Its raw output was `\frac { 1 } { 1 . 1 }`; the evaluator returned `unrecognized / UNSUPPORTED_COMMAND`, normalized text `null`, and a readable unsupported-notation status. Bounds and all three timing fields were present; no browser error logs were recorded. This is integration evidence, not handwriting-accuracy evidence or a real-sample benchmark.
- The existing notebook browser suite was not rerun for this phase: its connector and rendering behavior were unchanged. Worker arithmetic is covered by the unit orchestration tests and the separate real-browser smoke check.
- TrOCR inference remains blocked by the missing weight-license evidence. Neither the model-selection gate nor offline/inline notebook integration is complete.
