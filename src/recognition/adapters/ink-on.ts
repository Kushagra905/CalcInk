import type { InferenceEngine, Vocab } from "ink-on/core";
import type { RecognitionAdapter } from "../adapter";
import type { AdapterProgress, RecognitionConfig, RecognitionRequest, RecognitionResponse } from "../protocol";
import { assetUrl, verifyLocalAssets } from "../local-assets";
import { prepareComer, rasterizeRow } from "../rasterize";

export class InkOnAdapter implements RecognitionAdapter {
  readonly modelId: string;
  private engine: InferenceEngine | null = null;
  private vocab: Vocab | null = null;
  private disposed = false;

  constructor(private readonly config: RecognitionConfig) { this.modelId = config.modelId; }

  async initialize(report?: (progress: AdapterProgress) => void): Promise<void> {
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    await verifyLocalAssets(this.config.manifest, this.config.baseUrl, report);
    report?.({ stage: "loading", fraction: null, detail: "Creating local CoMER sessions" });
    // Import engine first: upstream sets numThreads on import. Override it afterward.
    const { InferenceEngine } = await import("ink-on/core");
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = assetUrl(this.config.baseUrl, "runtime/ink-on/");
    const find = (name: string) => {
      const file = this.config.manifest.files.find((asset) => asset.path.endsWith(`/${name}`));
      if (!file) throw new Error(`ASSET_NOT_IN_MANIFEST: ${name}`);
      return assetUrl(this.config.baseUrl, file.path);
    };
    const response = await fetch(find("vocab.json"));
    if (!response.ok) throw new Error("VOCAB_LOAD_FAILED");
    this.vocab = await response.json() as Vocab;
    const required = [..."0123456789", "+", "-", ".", "=", "\\times", "\\div"];
    if (required.some((symbol) => this.vocab!.word2idx[symbol] === undefined)) throw new Error("REQUIRED_SYMBOL_MISSING");
    this.engine = new InferenceEngine({
      encoderUrl: find("encoder_int8.onnx"), decoderUrl: find("decoder_int8.onnx"),
      beamWidth: 3, maxDecodeSteps: this.config.maxOutputTokens, executionProvider: "wasm",
    });
    await this.engine.init();
    if (this.disposed) { this.engine.dispose(); throw new Error("ADAPTER_DISPOSED"); }
    report?.({ stage: "ready", fraction: 1, detail: "Local model initialized; offline cache is not yet implemented" });
  }

  async recognize(request: RecognitionRequest): Promise<RecognitionResponse> {
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    if (!this.engine || !this.vocab) throw new Error("ADAPTER_NOT_READY");
    const start = performance.now();
    const raster = rasterizeRow(request.operations, request.rowId);
    const key = { epoch: request.epoch, rowId: request.rowId, rowRevision: request.rowRevision, requestId: request.requestId };
    if (!raster.canvas) return { ...key, modelId: this.modelId, transcript: "", outcome: { kind: "incomplete" }, visibleInkBounds: null, timing: { preprocessMs: performance.now() - start, inferenceMs: 0, evaluateMs: 0 } };
    const input = prepareComer(raster.canvas);
    const preprocessMs = performance.now() - start;
    const inferStart = performance.now();
    const result = await this.engine.recognize(input, this.vocab, "number");
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    return {
      ...key, modelId: this.modelId, transcript: result.latex,
      outcome: { kind: "unrecognized", code: result.tokenIds.length >= this.config.maxOutputTokens ? "OUTPUT_LIMIT" : "EVALUATION_ONLY" },
      visibleInkBounds: raster.visibleInkBounds,
      timing: { preprocessMs, inferenceMs: performance.now() - inferStart, evaluateMs: 0 },
    };
  }

  dispose(): void { this.disposed = true; this.engine?.dispose(); this.engine = null; this.vocab = null; }
}
