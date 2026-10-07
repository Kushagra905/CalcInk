# Model and runtime attribution

## Selected model

| Field | Value |
|---|---|
| Application model ID | `ink-on-comer-int8` |
| Model | Pretrained ink-on CoMER INT8 encoder/decoder |
| Source | [ink-on repository](https://github.com/kimseungdae/ink-on) |
| Immutable revision | `2585994ee11fe2ed98065c555c4aae8ee9096209` |
| Recorded license evidence | [Apache-2.0 at the pinned revision](https://github.com/kimseungdae/ink-on/blob/2585994ee11fe2ed98065c555c4aae8ee9096209/LICENSE) |
| Retained license | [Committed license text](licenses/ink-on-Apache-2.0.txt) |
| Engine package | `ink-on@0.1.0` |
| Runtime | `onnxruntime-web@1.22.0`, local single-threaded WASM in a dedicated worker |
| Decoding | Beam width 3; maximum 64 output tokens |

The catalog records repository-level license evidence and the note to retain attribution/license and review any additional upstream weight conditions. This document records that evidence; it does not claim a new independent upstream legal audit. The production artifact includes `model-license.txt` and `model-attribution.txt`, which are cached for offline access.

## Catalog files

The source of truth is `assets/model-candidates.json`. URLs contain the immutable revision. Asset preparation verifies exact bytes and SHA-256 before the app can build/load.

| File | Bytes | SHA-256 |
|---|---:|---|
| `encoder_int8.onnx` | 3,460,779 | `272f17c7b120db61db6cd8d77e695d0139144044abd57d9b23284435a5d916fa` |
| `decoder_int8.onnx` | 4,118,047 | `658901d81ca3aa4b62b0da262e8fe67ebcfdac19cfb52ca2cfd076bebd481088` |
| `vocab.json` | 3,697 | `1d75cbbea3bed558683d7e9c3b3c72069ef2143a155d5f8c610f85a281af000c` |

These three files total **7,582,523 bytes**. Runtime/shell files are additional; the verified public critical cache was **42,004,089 bytes** for version `65c8f66148592467556514b6`. Those are artifact observations, not future size guarantees. Generated weights/runtime/builds are not committed to source control.

Runtime files are copied from the installed package, checked against `package-lock.json`, and individually hashed in the generated model/offline manifests. The lockfile and generated manifests retain runtime provenance without maintaining a second handwritten hash list here.

## Application processing

The worker replays strokes and pixel masks to obtain surviving ink, crops with a 16-unit margin, preserves aspect ratio and converts alpha to white-on-black floats. CoMER input height is 256, with padded width in multiples of 64 up to 1024 and an accompanying content mask. See `src/recognition/rasterize.ts` and `adapters/ink-on.ts`.

Raw model text is retained. Normalization accepts known multiplication/division/minus typography and spacing, and treats consecutive equals signs (including supported spacing between them) as one equals. It never invents missing equals. Decimal arithmetic uses `decimal.js@10.6.0` with isolated 28-digit precision settings. Model decoding and deterministic arithmetic are separate stages. Historical reports of duplicate-equals rejection describe the earlier normalization policy; their raw measurements remain unchanged.

## Alternatives and measured scope

TrOCR (`trocr-mathwriting-int8`, revision `cdc13b093c439bb894fd11d8bbd8d237ed16a257`) has an implemented adapter but remains blocked by the catalog's unresolved weight-license evidence. It is not packaged as the selected model and is not a runtime fallback. Neither published model benchmark numbers nor synthetic CalcInk fixtures establish comparative accuracy for this app.

Actual engineering observations and device/browser versions are in [performance.md](performance.md). The real runtime completed offline browser checks and repeated inference cycles. No retained genuine handwriting reports are available: exact accuracy and genuine warmed total-update latency are **unverified**. The 50-sample final workflow, targets and failure reporting are in [phase-6-recognition.md](phase-6-recognition.md).
