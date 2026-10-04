import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getCandidate } from "../../src/recognition/candidates";
import type { RecognitionRequest } from "../../src/recognition/protocol";

const runtime = vi.hoisted(() => ({
  recognize: vi.fn(),
  rasterize: vi.fn(() => ({ canvas: null, visibleInkBounds: null })),
  prepare: vi.fn(),
}));
vi.mock("ink-on/core", () => ({
  InferenceEngine: class {
    init = vi.fn(async () => {});
    recognize = runtime.recognize;
    dispose = vi.fn();
  },
}));
vi.mock("onnxruntime-web", () => ({ env: { wasm: {} } }));
vi.mock("../../src/recognition/local-assets", () => ({
  assetUrl: (base: string, path: string) => new URL(path, base).href,
  verifyLocalAssets: vi.fn(async () => {}),
}));
vi.mock("../../src/recognition/rasterize", () => ({
  rasterizeRow: runtime.rasterize,
  prepareComer: runtime.prepare,
}));

import { InkOnAdapter } from "../../src/recognition/adapters/ink-on";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            word2idx: Object.fromEntries(
              [..."0123456789", "+", "-", ".", "=", "\\times", "\\div"].map(
                (token, index) => [token, index],
              ),
            ),
          }),
        ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
  "returns empty surviving ink without creating tensors or running inference (masked=%s)",
  async (masked) => {
    const candidate = getCandidate("ink-on-comer-int8");
    const adapter = new InkOnAdapter({
      modelId: candidate.modelId,
      adapter: "ink-on",
      baseUrl: "https://example.test/CalcInk/",
      maxOutputTokens: 64,
      manifest: {
        modelId: candidate.modelId,
        revision: candidate.revision,
        files: candidate.files,
      },
    });
    await adapter.initialize();
    const points = [{ x: 20, y: 40, pressure: 0.5, t: 1 }];
    const request: RecognitionRequest = {
      epoch: 2,
      rowId: "row-1",
      rowRevision: 6,
      requestId: 9,
      operations: masked
        ? [
            {
              kind: "stroke",
              stroke: {
                id: "dot",
                rowId: "row-1",
                width: 4,
                points,
                bounds: { x: 18, y: 38, width: 4, height: 4 },
              },
            },
            {
              kind: "pixel-mask",
              mask: { id: "erase", rowId: "row-1", radius: 10, points },
            },
          ]
        : [],
    };
    const response = await adapter.recognize(request);
    expect(runtime.rasterize).toHaveBeenCalledWith(request.operations, "row-1");
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(runtime.recognize).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      epoch: 2,
      rowId: "row-1",
      rowRevision: 6,
      requestId: 9,
      transcript: "",
      visibleInkBounds: null,
      outcome: { kind: "incomplete" },
      timing: { inferenceMs: 0, evaluateMs: 0 },
    });
    adapter.dispose();
  },
);
