import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RecognitionConfig,
  RecognitionRequest,
} from "../../src/recognition/protocol";

const runtime = vi.hoisted(() => ({
  verify: vi.fn(),
  init: vi.fn(),
  infer: vi.fn(),
  release: vi.fn(),
  createPipe: vi.fn(),
  rasterize: vi.fn(),
  prepare: vi.fn(),
  constructors: vi.fn(),
}));
vi.mock("../../src/recognition/local-assets", () => ({
  assetUrl: (base: string, path: string) => new URL(path, base).href,
  verifyLocalAssets: runtime.verify,
}));
vi.mock("../../src/recognition/candidates", async (original) => ({
  ...(await original<typeof import("../../src/recognition/candidates")>()),
  // Pipeline lifecycle only: no weights load and no license evidence is asserted.
  assertTrialAllowed: vi.fn(),
}));
vi.mock("../../src/recognition/rasterize", () => ({
  rasterizeRow: runtime.rasterize,
  prepareComer: runtime.prepare,
}));
vi.mock("onnxruntime-web", () => ({ env: { wasm: {} } }));
vi.mock("ink-on/core", () => ({
  InferenceEngine: class {
    constructor() {
      runtime.constructors();
    }
    init = runtime.init;
    recognize = runtime.infer;
    dispose = runtime.release;
  },
}));
vi.mock("@huggingface/transformers", () => ({
  env: { backends: { onnx: { wasm: {} } } },
  pipeline: runtime.createPipe,
  RawImage: class {},
  TextStreamer: class {},
}));

import { InkOnAdapter } from "../../src/recognition/adapters/ink-on";
import { TrocrAdapter } from "../../src/recognition/adapters/trocr";
import { getCandidate } from "../../src/recognition/candidates";

const request: RecognitionRequest = {
  epoch: 1,
  rowId: "row-1",
  rowRevision: 3,
  requestId: 5,
  operations: [],
};
let crop: { width: number; height: number };
let images: { width: number; height: number }[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function adapter(kind: "ink-on" | "trocr") {
  const candidate = getCandidate(
    kind === "ink-on" ? "ink-on-comer-int8" : "trocr-mathwriting-int8",
  );
  const config: RecognitionConfig = {
    adapter: kind,
    modelId: candidate.modelId,
    maxOutputTokens: 64,
    baseUrl: "https://example.test/CalcInk/",
    manifest: {
      modelId: candidate.modelId,
      revision: candidate.revision,
      files: candidate.files,
    },
  };
  return kind === "ink-on"
    ? new InkOnAdapter(config)
    : new TrocrAdapter(config);
}
beforeEach(() => {
  vi.resetAllMocks();
  runtime.verify.mockResolvedValue(undefined);
  runtime.init.mockResolvedValue(undefined);
  runtime.release.mockResolvedValue(undefined);
  const pipe = Object.assign(runtime.infer, {
    tokenizer: {},
    dispose: runtime.release,
  });
  runtime.createPipe.mockResolvedValue(pipe);
  runtime.infer.mockImplementation(async () =>
    Object.assign([{ generated_text: "2+2=" }], {
      latex: "2+2=",
      tokenIds: [1, 2],
    }),
  );
  crop = { width: 32, height: 32 };
  runtime.rasterize.mockReturnValue({
    canvas: crop,
    visibleInkBounds: { x: 10, y: 20, width: 20, height: 20 },
  });
  runtime.prepare.mockReturnValue({
    tensor: new Float32Array(4),
    mask: new Uint8Array(4),
    width: 2,
    height: 2,
    maskWidth: 2,
    maskHeight: 2,
  });
  images = [];
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {
        images.push(this);
      }
      getContext() {
        return {
          fillRect() {},
          drawImage() {},
          getImageData() {
            return { data: new Uint8ClampedArray(16) };
          },
        };
      }
    },
  );
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

it("uses expression vocabulary for graphs and preserves number mode for notebooks", async () => {
  const model = adapter("ink-on");
  await model.initialize();
  await model.recognize(request);
  expect(runtime.infer.mock.calls.at(-1)?.[2]).toBe("number");
  crop = { width: 32, height: 32 };
  runtime.rasterize.mockReturnValue({
    canvas: crop,
    visibleInkBounds: { x: 10, y: 20, width: 20, height: 20 },
  });
  await model.recognize({ ...request, requestId: 6, mode: "expression" });
  expect(runtime.infer.mock.calls.at(-1)?.[2]).toBe("expression");
  model.dispose();
});

describe.each(["ink-on", "trocr"] as const)("%s adapter lifecycle", (kind) => {
  it("shares initialization and releases an idempotently disposed session once", async () => {
    const model = adapter(kind);
    await Promise.all([model.initialize(), model.initialize()]);
    expect(
      kind === "ink-on" ? runtime.constructors : runtime.createPipe,
    ).toHaveBeenCalledTimes(1);
    await Promise.all([model.dispose(), model.dispose()]);
    expect(runtime.release).toHaveBeenCalledTimes(1);
    await expect(model.recognize(request)).rejects.toThrow("ADAPTER_DISPOSED");
  });
  it("stops initialization disposed during asset verification", async () => {
    const assets = deferred<void>();
    runtime.verify.mockReturnValue(assets.promise);
    const model = adapter(kind);
    const loading = expect(model.initialize()).rejects.toThrow(
      "ADAPTER_DISPOSED",
    );
    await model.dispose();
    assets.resolve(undefined);
    await loading;
    expect(runtime.constructors).not.toHaveBeenCalled();
    expect(runtime.createPipe).not.toHaveBeenCalled();
  });
  it("releases sessions that finish loading after disposal", async () => {
    const pending = deferred<unknown>();
    if (kind === "ink-on") runtime.init.mockReturnValue(pending.promise);
    else runtime.createPipe.mockReturnValue(pending.promise);
    const model = adapter(kind);
    const loading = expect(model.initialize()).rejects.toThrow(
      "ADAPTER_DISPOSED",
    );
    await vi.waitFor(() =>
      expect(
        kind === "ink-on" ? runtime.init : runtime.createPipe,
      ).toHaveBeenCalledTimes(1),
    );
    await model.dispose();
    pending.resolve(
      kind === "ink-on"
        ? undefined
        : Object.assign(runtime.infer, {
            tokenizer: {},
            dispose: runtime.release,
          }),
    );
    await loading;
    expect(runtime.release).toHaveBeenCalledTimes(1);
  });
  it("does not release active sessions until inference settles and discards their result", async () => {
    const pending = deferred<unknown>();
    runtime.infer.mockReturnValue(pending.promise);
    const model = adapter(kind);
    await model.initialize();
    const result = expect(model.recognize(request)).rejects.toThrow(
      "ADAPTER_DISPOSED",
    );
    await vi.waitFor(() => expect(runtime.infer).toHaveBeenCalledTimes(1));
    const disposed = model.dispose();
    expect(runtime.release).not.toHaveBeenCalled();
    pending.resolve(
      Object.assign([{ generated_text: "2+2=" }], {
        latex: "2+2=",
        tokenIds: [1],
      }),
    );
    await result;
    await disposed;
    expect(runtime.release).toHaveBeenCalledTimes(1);
    expect(crop).toEqual({ width: 0, height: 0 });
    expect(
      images.every((image) => image.width === 0 && image.height === 0),
    ).toBe(true);
  });
  it("rejects concurrent inference while keeping the first request valid", async () => {
    const pending = deferred<unknown>();
    runtime.infer.mockReturnValue(pending.promise);
    const model = adapter(kind);
    await model.initialize();
    const first = model.recognize(request);
    await expect(model.recognize({ ...request, requestId: 6 })).rejects.toThrow(
      "ADAPTER_BUSY",
    );
    pending.resolve(
      Object.assign([{ generated_text: "2+2=" }], {
        latex: "2+2=",
        tokenIds: [1],
      }),
    );
    await expect(first).resolves.toMatchObject({
      requestId: 5,
      transcript: "2+2=",
    });
    await model.dispose();
  });
  it("releases temporary images and sessions after inference failure", async () => {
    runtime.infer.mockRejectedValue(new Error("RUNTIME_FAILED"));
    const model = adapter(kind);
    await model.initialize();
    await expect(model.recognize(request)).rejects.toThrow("RUNTIME_FAILED");
    expect(crop).toEqual({ width: 0, height: 0 });
    expect(
      images.every((image) => image.width === 0 && image.height === 0),
    ).toBe(true);
    expect(runtime.release).toHaveBeenCalledTimes(1);
    await model.dispose();
    expect(runtime.release).toHaveBeenCalledTimes(1);
  });
  it("preserves the inference error if session cleanup also fails", async () => {
    runtime.infer.mockRejectedValue(new Error("RUNTIME_FAILED"));
    if (kind === "ink-on") {
      runtime.release.mockImplementation(() => {
        throw new Error("RELEASE_FAILED");
      });
    } else runtime.release.mockRejectedValue(new Error("RELEASE_FAILED"));
    const model = adapter(kind);
    await model.initialize();
    await expect(model.recognize(request)).rejects.toThrow("RUNTIME_FAILED");
    expect(runtime.release).toHaveBeenCalledTimes(1);
    if (kind === "trocr")
      await expect(model.dispose()).rejects.toThrow("RELEASE_FAILED");
    else await model.dispose();
  });
});

it("releases an ink-on engine whose initialization fails", async () => {
  runtime.init.mockRejectedValue(new Error("SESSION_INIT_FAILED"));
  const model = adapter("ink-on");
  await expect(model.initialize()).rejects.toThrow("SESSION_INIT_FAILED");
  expect(runtime.release).toHaveBeenCalledTimes(1);
  await model.dispose();
  expect(runtime.release).toHaveBeenCalledTimes(1);
});
