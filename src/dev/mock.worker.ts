/// <reference lib="webworker" />
import { evaluateTranscript } from "../math/evaluate";
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from "../recognition/protocol";
import { rasterizeRow } from "../recognition/rasterize";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const MODEL_ID = "CALCINK_DEVELOPMENT_MOCK";
const query = new URL(scope.location.href).searchParams;
const behavior = query.get("behavior") ?? "normal";
const encodedTranscript = query.get("transcript64");
const fixtureTranscript = encodedTranscript
  ? new TextDecoder().decode(
      Uint8Array.from(
        atob(encodedTranscript.replaceAll("-", "+").replaceAll("_", "/")),
        (character) => character.charCodeAt(0),
      ),
    )
  : (query.get("transcript") ?? "18+4×3=");
let failedRequest = false;
const send = (message: WorkerToMainMessage) => scope.postMessage(message);

scope.onmessage = ({ data }: MessageEvent<MainToWorkerMessage>) => {
  if (data.type === "DISPOSE") {
    scope.close();
    return;
  }
  if (data.type === "INIT") {
    if (behavior === "init-error") {
      send({
        type: "ERROR",
        modelId: MODEL_ID,
        key: null,
        code: "MOCK_INIT_FAILED",
        message: "MOCK_INIT_FAILED",
        recoverable: true,
      });
      return;
    }
    const finish = () => send({ type: "READY", modelId: MODEL_ID });
    if (behavior === "slow-init") {
      send({
        type: "PROGRESS",
        modelId: MODEL_ID,
        progress: {
          stage: "initializing",
          fraction: 0.25,
          detail: "Simulating slow initialization; no model download.",
        },
      });
      setTimeout(finish, 3000);
    } else finish();
    return;
  }
  const request = data.request;
  if (behavior === "timeout" || behavior === "timeout-once") return;
  const delay =
    behavior === "out-of-order"
      ? request.requestId % 2
        ? 500
        : 20
      : Number(query.get("delay") ?? 180);
  setTimeout(() => {
    if (behavior === "error" && !failedRequest) {
      failedRequest = true;
      send({
        type: "ERROR",
        modelId: MODEL_ID,
        key: request,
        code: "MOCK_RECOGNITION_FAILED",
        message: "MOCK_RECOGNITION_FAILED",
        recoverable: true,
      });
      return;
    }
    const bounds = rasterizeRow(
      request.operations,
      request.rowId,
    ).visibleInkBounds;
    const transcript = bounds ? fixtureTranscript : "";
    const result = evaluateTranscript(transcript);
    send({
      type: "RESULT",
      response: {
        ...request,
        modelId: MODEL_ID,
        ...result,
        transcript,
        visibleInkBounds: bounds,
        timing: { preprocessMs: 0, inferenceMs: 0, evaluateMs: 0 },
      },
    });
  }, delay);
};
