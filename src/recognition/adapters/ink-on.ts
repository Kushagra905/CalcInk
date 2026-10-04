import type { InferenceEngine, Vocab } from "ink-on/core";
import type { RecognitionAdapter } from "../adapter";
import { assetUrl, verifyLocalAssets } from "../local-assets";
import type {
  AdapterProgress,
  RecognitionConfig,
  RecognitionRequest,
  RecognitionResponse,
} from "../protocol";
import { prepareComer, rasterizeRow } from "../rasterize";

export class InkOnAdapter implements RecognitionAdapter {
  readonly modelId: string;
  private engine: InferenceEngine | null = null;
  private vocab: Vocab | null = null;
  private disposed = false;
  private loading: Promise<void> | null = null;
  private recognizing = false;

  constructor(private readonly config: RecognitionConfig) {
    this.modelId = config.modelId;
  }

  async initialize(
    report?: (progress: AdapterProgress) => void,
  ): Promise<void> {
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    if (this.engine) return;
    if (this.loading) return this.loading;
    this.loading = this.load(report);
    try {
      await this.loading;
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      this.loading = null;
    }
  }

  private async load(
    report?: (progress: AdapterProgress) => void,
  ): Promise<void> {
    await verifyLocalAssets(this.config.manifest, this.config.baseUrl, report);
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    report?.({
      stage: "loading",
      fraction: null,
      detail: "Creating local CoMER sessions",
    });
    // Import engine first: upstream sets numThreads on import. Override it afterward.
    const { InferenceEngine } = await import("ink-on/core");
    const ort = await import("onnxruntime-web");
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = assetUrl(this.config.baseUrl, "runtime/ink-on/");
    const find = (name: string) => {
      const file = this.config.manifest.files.find((asset) =>
        asset.path.endsWith(`/${name}`),
      );
      if (!file) throw new Error(`ASSET_NOT_IN_MANIFEST: ${name}`);
      return assetUrl(this.config.baseUrl, file.path);
    };
    const response = await fetch(find("vocab.json"));
    if (!response.ok) throw new Error("VOCAB_LOAD_FAILED");
    const vocab = (await response.json()) as Vocab;
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    const required = [..."0123456789", "+", "-", ".", "=", "\\times", "\\div"];
    if (required.some((symbol) => vocab.word2idx[symbol] === undefined))
      throw new Error("REQUIRED_SYMBOL_MISSING");
    const engine = new InferenceEngine({
      encoderUrl: find("encoder_int8.onnx"),
      decoderUrl: find("decoder_int8.onnx"),
      beamWidth: 3,
      maxDecodeSteps: this.config.maxOutputTokens,
      executionProvider: "wasm",
    });
    try {
      await engine.init();
      if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    } catch (error) {
      try {
        engine.dispose();
      } catch {
        // Keep the load failure; the client also terminates the failed worker.
      }
      throw error;
    }
    this.engine = engine;
    this.vocab = vocab;
    report?.({
      stage: "ready",
      fraction: 1,
      detail: "Local model initialized; offline cache is not yet implemented",
    });
  }

  async recognize(request: RecognitionRequest): Promise<RecognitionResponse> {
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    if (!this.engine || !this.vocab) throw new Error("ADAPTER_NOT_READY");
    if (this.recognizing) throw new Error("ADAPTER_BUSY");
    const engine = this.engine;
    const vocab = this.vocab;
    this.recognizing = true;
    try {
      return await this.infer(request, engine, vocab);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      this.recognizing = false;
      if (this.disposed) {
        try {
          engine.dispose();
        } catch {
          // Keep the inference failure; the client terminates this worker.
        }
      }
    }
  }

  private async infer(
    request: RecognitionRequest,
    engine: InferenceEngine,
    vocab: Vocab,
  ): Promise<RecognitionResponse> {
    const start = performance.now();
    const raster = rasterizeRow(request.operations, request.rowId);
    const key = {
      epoch: request.epoch,
      rowId: request.rowId,
      rowRevision: request.rowRevision,
      requestId: request.requestId,
    };
    if (!raster.canvas)
      return {
        ...key,
        modelId: this.modelId,
        transcript: "",
        outcome: { kind: "incomplete" },
        visibleInkBounds: null,
        timing: {
          preprocessMs: performance.now() - start,
          inferenceMs: 0,
          evaluateMs: 0,
        },
      };
    let input: ReturnType<typeof prepareComer>;
    try {
      input = prepareComer(raster.canvas);
    } finally {
      raster.canvas.width = raster.canvas.height = 0;
    }
    const preprocessMs = performance.now() - start;
    const inferStart = performance.now();
    const result = await engine.recognize(input, vocab, "number");
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    return {
      ...key,
      modelId: this.modelId,
      transcript: result.latex,
      outcome: {
        kind: "unrecognized",
        code:
          result.tokenIds.length >= this.config.maxOutputTokens
            ? "OUTPUT_LIMIT"
            : "EVALUATION_ONLY",
      },
      visibleInkBounds: raster.visibleInkBounds,
      timing: {
        preprocessMs,
        inferenceMs: performance.now() - inferStart,
        evaluateMs: 0,
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.recognizing) this.engine?.dispose();
    this.engine = null;
    this.vocab = null;
  }
}
