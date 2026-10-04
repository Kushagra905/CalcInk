import { evaluateTranscript } from "../math/evaluate";
import type { RecognitionResponse } from "./protocol";

/** Worker-side postprocessing. Raw text is retained for transcription benchmarks. */
export function evaluateRecognition(
  response: RecognitionResponse,
): RecognitionResponse {
  if (
    response.outcome.kind !== "unrecognized" ||
    response.outcome.code !== "EVALUATION_ONLY"
  )
    return response;
  const start = performance.now();
  const result =
    response.transcript.trim() === "" && response.visibleInkBounds
      ? {
          normalizedTranscript: null,
          outcome: { kind: "unrecognized" as const, code: "EMPTY_TRANSCRIPT" },
        }
      : evaluateTranscript(response.transcript);
  return {
    ...response,
    ...result,
    timing: { ...response.timing, evaluateMs: performance.now() - start },
  };
}
