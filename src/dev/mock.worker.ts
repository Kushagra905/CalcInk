import type { WorkerReply, WorkerRequest } from "../recognition/contracts";

const MODEL_ID = "CALCINK_DEVELOPMENT_MOCK";
let failedInit = false;
let failedRequest = false;
type MockRequest = WorkerRequest & {
  fixture?: { behavior: string; delayMs?: number; transcript?: string };
};

function reply(message: WorkerReply) {
  self.postMessage(message);
}

self.onmessage = ({ data }: MessageEvent<MockRequest>) => {
  if (data.type === "DISPOSE") {
    self.close();
    return;
  }
  if (data.type === "INIT") {
    if (data.fixture?.behavior === "init-error" && !failedInit) {
      failedInit = true;
      reply({
        type: "ERROR",
        code: "MOCK_INIT_FAILED",
        recoverable: true,
        modelId: MODEL_ID,
      });
      return;
    }
    const finish = () => {
      reply({
        type: "PROGRESS",
        progress: 1,
        message: "Development fixture loaded; no model download",
      });
      reply({ type: "READY", modelId: MODEL_ID });
    };
    if (data.fixture?.behavior === "slow-init") {
      reply({
        type: "PROGRESS",
        progress: 0.25,
        message: "Simulating slow initialization; no model download.",
      });
      setTimeout(finish, 3000);
    } else finish();
    return;
  }
  const request = {
    epoch: data.epoch,
    rowId: data.rowId,
    rowRevision: data.rowRevision,
    requestId: data.requestId,
  };
  const delay =
    data.fixture?.behavior === "out-of-order"
      ? data.requestId % 2
        ? 500
        : 20
      : (data.fixture?.delayMs ?? 180);
  setTimeout(() => {
    if (data.fixture?.behavior === "error" && !failedRequest) {
      failedRequest = true;
      reply({
        type: "ERROR",
        code: "MOCK_RECOGNITION_FAILED",
        recoverable: true,
        modelId: MODEL_ID,
        request,
      });
      return;
    }
    reply({
      type: "RESULT",
      result: {
        ...request,
        modelId: MODEL_ID,
        transcript: data.fixture?.transcript ?? "",
        outcome: { kind: "incomplete" },
        visibleInkBounds: null,
        timing: { preprocessMs: 0, inferenceMs: 0, evaluateMs: 0 },
      },
    });
  }, delay);
};
