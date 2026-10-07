# Power recognition and arithmetic fix

## Cause and implementation

The pinned ink-on decoder's number vocabulary already allows `^`, `{`, and `}`.
The application normalizer rejected these tokens, and its parser supported only
addition, subtraction, multiplication and division. Collapsing duplicate equals
alone could not make a recognized exponent calculable.

The normalizer now accepts `4^2`, `4^{2}`, and Unicode `4²`; it preserves exponent
grouping and still collapses consecutive equals. The parser implements rightward
power association and conventional sign precedence. Decimal arithmetic evaluates
positive, negative and fractional exponents, classifies undefined real arithmetic,
and bounds exponent magnitude and fixed output size. A nearby raised stroke above
the right edge of its base remains in the same expression crop.

## Reproduced offline case

On 7 October 2026, a Playwright production test drew a synthetic `4²` and one equals
sign with the browser disconnected. Actual ink-on WASM inference returned
`4 ^ { 2 } = =`. The worker retained that raw text, normalized it to `4^(2)=`,
and returned `{ kind: "answer", value: "16" }`. Production build:
`a76d1b2aa4e17483cd17307b`.

This is an automated engineering regression fixture, not genuine handwriting
accuracy evidence. Arbitrary handwriting can still be mistranscribed; a raw `42`
is evaluated as forty-two rather than guessed to be a power. Existing saved reports
are historical and are not rewritten as new measurements.

Regression coverage includes operator precedence, nested exponents, negative
exponents, fractional exponents, duplicate equals, malformed notation, incomplete
input, worker processing, stroke grouping, inline answers and output/work limits.

Verification: 259 unit tests passed. Twenty notebook/results browser tests and
six production offline tests passed before the final delimiter-validation refinement;
unit tests and the real offline power regression passed again on the final build.
Type checking, production compilation, and production bundle verification passed.
