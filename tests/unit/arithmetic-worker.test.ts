import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCandidate } from "../../src/recognition/candidates";
import type {
  MainToWorkerMessage,
  RecognitionResponse,
  WorkerToMainMessage,
} from "../../src/recognition/protocol";

const runtime = vi.hoisted(() => ({
  initialize: vi.fn(),
  recognize: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../../src/recognition/adapters/ink-on", () => ({
  InkOnAdapter: class {
    initialize = runtime.initialize;
    recognize = runtime.recognize;
    dispose = runtime.dispose;
  },
}));

let scope: {
  location: { origin: string };
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent<MainToWorkerMessage>) => void) | null;
};
const candidate = getCandidate("ink-on-comer-int8");
const init: MainToWorkerMessage = {
  type: "INIT",
  config: {
    adapter: "ink-on",
    modelId: candidate.modelId,
    manifest: {
      modelId: candidate.modelId,
      revision: candidate.revision,
      files: [],
    },
    baseUrl: "https://example.test/CalcInk/",
    maxOutputTokens: 64,
  },
};
const request = {
  epoch: 1,
  rowId: "row-1",
  rowRevision: 2,
  requestId: 3,
  operations: [],
};

function send(message: MainToWorkerMessage) {
  scope.onmessage?.({ data: message } as MessageEvent<MainToWorkerMessage>);
}
function replies(): WorkerToMainMessage[] {
  return scope.postMessage.mock.calls.map(([message]) => message);
}
async function ready() {
  send(init);
  await vi.waitFor(() =>
    expect(replies().some((message) => message.type === "READY")).toBe(true),
  );
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  runtime.initialize.mockResolvedValue(undefined);
  scope = {
    location: { origin: "https://example.test" },
    postMessage: vi.fn(),
    onmessage: null,
  };
  vi.stubGlobal("self", scope);
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return {};
      }
    },
  );
  await import("../../src/recognition/trial-worker");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trial worker arithmetic integration", () => {
  it("runs a raw model result through arithmetic before replying", async () => {
    await ready();
    const recognized: RecognitionResponse = {
      ...request,
      modelId: candidate.modelId,
      transcript: "18+4×3=",
      outcome: { kind: "unrecognized", code: "EVALUATION_ONLY" },
      visibleInkBounds: { x: 10, y: 20, width: 100, height: 30 },
      timing: { preprocessMs: 2, inferenceMs: 8, evaluateMs: 0 },
    };
    runtime.recognize.mockResolvedValue(recognized);
    send({ type: "RECOGNIZE", request });
    await vi.waitFor(() =>
      expect(replies()).toContainEqual({
        type: "RESULT",
        response: expect.objectContaining({
          epoch: 1,
          rowId: "row-1",
          rowRevision: 2,
          requestId: 3,
          normalizedTranscript: "18+4*3=",
          outcome: { kind: "answer", value: "30" },
        }),
      }),
    );
    expect(runtime.recognize).toHaveBeenCalledTimes(1);
  });
  it("retains decoder-limit errors instead of calculating a plausible prefix", async () => {
    await ready();
    runtime.recognize.mockResolvedValue({
      ...request,
      modelId: candidate.modelId,
      transcript: "2+2=",
      outcome: { kind: "unrecognized", code: "OUTPUT_LIMIT" },
      visibleInkBounds: null,
      timing: { preprocessMs: 0, inferenceMs: 1, evaluateMs: 0 },
    });
    send({ type: "RECOGNIZE", request });
    await vi.waitFor(() =>
      expect(replies()).toContainEqual({
        type: "RESULT",
        response: expect.objectContaining({
          outcome: { kind: "unrecognized", code: "OUTPUT_LIMIT" },
        }),
      }),
    );
  });
  it("reports unsupported worker rasterization explicitly before model loading", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    send(init);
    await vi.waitFor(() =>
      expect(replies()).toContainEqual(
        expect.objectContaining({
          type: "ERROR",
          code: "OFFSCREEN_CANVAS_UNAVAILABLE",
          modelId: candidate.modelId,
          key: null,
        }),
      ),
    );
    expect(runtime.initialize).not.toHaveBeenCalled();
  });
  it("reports an unavailable canvas context explicitly", async () => {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return null;
        }
      },
    );
    send(init);
    await vi.waitFor(() =>
      expect(replies()).toContainEqual(
        expect.objectContaining({
          type: "ERROR",
          code: "CANVAS_2D_UNAVAILABLE",
        }),
      ),
    );
  });
  it("rejects unbounded decoder configuration", async () => {
    if (init.type !== "INIT") throw new Error("Expected initialization");
    send({
      type: "INIT",
      config: { ...init.config, maxOutputTokens: 1000000 },
    });
    await vi.waitFor(() =>
      expect(replies()).toContainEqual(
        expect.objectContaining({
          type: "ERROR",
          code: "MODEL_CONFIG_MISMATCH",
        }),
      ),
    );
    expect(runtime.initialize).not.toHaveBeenCalled();
  });
});
