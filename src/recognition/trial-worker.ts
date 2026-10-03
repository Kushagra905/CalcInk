/// <reference lib="webworker" />

import { evaluateTranscript } from "../math/evaluate";
import type { RecognitionAdapter } from "./adapter";
import { assertTrialAllowed, getCandidate } from "./candidates";
import type {
  MainToWorkerMessage,
  RevisionKey,
  WorkerToMainMessage,
} from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let adapter: RecognitionAdapter | null = null;
let modelId = "uninitialized";
let queue = Promise.resolve();
function send(message: WorkerToMainMessage): void {
  scope.postMessage(message);
}

async function handle(message: MainToWorkerMessage): Promise<void> {
  let key: RevisionKey | null = null;
  try {
    if (message.type === "DISPOSE") {
      adapter?.dispose();
      adapter = null;
      return;
    }
    if (message.type === "INIT") {
      adapter?.dispose();
      adapter = null;
      const candidate = getCandidate(message.config.modelId);
      modelId = candidate.modelId;
      assertTrialAllowed(candidate);
      if (new URL(message.config.baseUrl).origin !== scope.location.origin)
        throw new Error("CROSS_ORIGIN_MODEL_ASSETS");
      if (
        candidate.adapter !== message.config.adapter ||
        candidate.revision !== message.config.manifest.revision ||
        candidate.modelId !== message.config.manifest.modelId
      )
        throw new Error("MODEL_CONFIG_MISMATCH");
      const Constructor =
        candidate.adapter === "ink-on"
          ? (await import("./adapters/ink-on")).InkOnAdapter
          : (await import("./adapters/trocr")).TrocrAdapter;
      adapter = new Constructor(message.config);
      await adapter.initialize((progress) =>
        send({ type: "PROGRESS", modelId, progress }),
      );
      send({ type: "READY", modelId });
      return;
    }
    const { epoch, rowId, rowRevision, requestId } = message.request;
    key = { epoch, rowId, rowRevision, requestId };
    if (!adapter) throw new Error("ADAPTER_NOT_READY");
    const response = await adapter.recognize(message.request);
    const start = performance.now();
    const calculated =
      response.outcome.kind === "unrecognized" &&
      response.outcome.code === "EVALUATION_ONLY"
        ? evaluateTranscript(response.transcript)
        : { transcript: response.transcript, outcome: response.outcome };
    send({
      type: "RESULT",
      response: {
        ...response,
        ...calculated,
        timing: { ...response.timing, evaluateMs: performance.now() - start },
      },
    });
  } catch (error) {
    send({
      type: "ERROR",
      modelId,
      key,
      code: error instanceof Error ? error.message : "UNKNOWN_FAILURE",
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    });
  }
}

scope.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  // The coordinator dispatches one inference at a time; also serialize initialization/disposal.
  queue = queue.then(() => handle(event.data));
};
