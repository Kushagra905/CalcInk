# CalcInk live demonstration

**Owner: Developer A; recognition/offline verification: Developer B.** Target 2-3 minutes after genuine acceptance passes. This is a prepared script, not a claim that a recorded demo already exists.

## Before recording

- Use the accepted public production build in a supported browser. Record commit, build version and device/browser. Wait for **Model ready** and **Ready offline** while online.
- Use genuine handwriting and leave space after `=`. Do not use development mock mode or injected transcripts. Rehearse with actual input; record any failure rather than presenting a corrected transcript as automatic recognition.
- Keep a clean source setup available for technical questions, plus the genuine evaluation and measured performance reports. Save any wanted captures before reload clears tab ink.

## Sequence

| Time | Action | Behavior to show |
|---|---|---|
| 0:00-0:20 | Explain the three-row notebook and write `18+4×3=` | Handwriting becomes an inline `30`; precedence is preserved. |
| 0:20-0:45 | Use stroke eraser on `4`, then write `5` | Old result clears while editing; fresh result is `33`. |
| 0:45-1:05 | Undo replacement and erase, then redo | Geometry and calculations return through the appropriate `30`/`33` states. |
| 1:05-1:25 | Pixel-erase part of ink and remove `=` | Partial-width removal is visible; obsolete numeric answer disappears. |
| 1:25-1:45 | Clear, write `-2.5+4=` and `8÷0=` | Decimal/unary arithmetic gives `1.5`; zero division gives `Undefined`. |
| 1:45-2:20 | Disconnect, reload, write a fresh equation | Cached app/model become ready and produce a correct new offline answer. |
| 2:20-2:45 | Show the architecture and genuine evaluation summary | Local worker/WASM, strict arithmetic, measured accuracy/latency and explicit browser/device scope. |

## Recording and submission

Capture readable ink, results and readiness indicators at a useful screen size. Include the public URL and actual tested version in the description. Keep the recording consistent with the evidence and disclose any unsuccessful or untested behavior. A genuine correct offline result after reload is required before presenting that part as passed.

Submit the repository, hosted app, demo and evaluation evidence in the organizer's required format. Do not assume this script determines the official submission length or deadline.
