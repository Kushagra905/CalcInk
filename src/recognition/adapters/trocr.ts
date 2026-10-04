import type { RecognitionAdapter } from "../adapter";
import { assertTrialAllowed, getCandidate } from "../candidates";
import { assetUrl, verifyLocalAssets } from "../local-assets";
import type {
  AdapterProgress,
  RecognitionConfig,
  RecognitionRequest,
  RecognitionResponse,
} from "../protocol";
import { rasterizeRow } from "../rasterize";

/** Candidate integration only. Factory rejects it while catalog license evidence is missing. */
export class TrocrAdapter implements RecognitionAdapter {
  readonly modelId: string;
  private pipe: Awaited<
    ReturnType<
      typeof import("@huggingface/transformers").pipeline<"image-to-text">
    >
  > | null = null;
  private disposed = false;

  constructor(private readonly config: RecognitionConfig) {
    this.modelId = config.modelId;
  }

  async initialize(
    report?: (progress: AdapterProgress) => void,
  ): Promise<void> {
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    assertTrialAllowed(getCandidate(this.modelId));
    await verifyLocalAssets(this.config.manifest, this.config.baseUrl, report);
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    env.localModelPath = assetUrl(this.config.baseUrl, "models/");
    env.backends.onnx.wasm!.numThreads = 1;
    env.backends.onnx.wasm!.proxy = false;
    env.backends.onnx.wasm!.wasmPaths = assetUrl(
      this.config.baseUrl,
      "runtime/trocr/",
    );
    report?.({
      stage: "loading",
      fraction: null,
      detail: "Creating local INT8 encoder and decoder sessions",
    });
    this.pipe = await pipeline("image-to-text", this.modelId, {
      device: "wasm",
      dtype: "int8",
    });
    if (this.disposed) {
      await this.pipe.dispose();
      this.pipe = null;
      throw new Error("ADAPTER_DISPOSED");
    }
    report?.({ stage: "ready", fraction: 1 });
  }

  async recognize(request: RecognitionRequest): Promise<RecognitionResponse> {
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    if (!this.pipe) throw new Error("ADAPTER_NOT_READY");
    const start = performance.now();
    const { RawImage, TextStreamer } = await import(
      "@huggingface/transformers"
    );
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
    const image = new OffscreenCanvas(
      raster.canvas.width,
      raster.canvas.height,
    );
    const context = image.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(raster.canvas, 0, 0);
    const raw = new RawImage(
      context.getImageData(0, 0, image.width, image.height).data,
      image.width,
      image.height,
      4,
    );
    const preprocessMs = performance.now() - start;
    const inferStart = performance.now();
    let generatedTokens = 0;
    const streamer = new TextStreamer(this.pipe.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: false,
      callback_function: () => {},
      token_callback_function: (tokens) => {
        generatedTokens += tokens.length;
      },
    });
    const result = await this.pipe(raw, {
      max_new_tokens: this.config.maxOutputTokens,
      do_sample: false,
      num_beams: 1,
      streamer,
    });
    if (this.disposed) throw new Error("ADAPTER_DISPOSED");
    const first = result[0];
    const transcript =
      first && !Array.isArray(first) ? first.generated_text : "";
    return {
      ...key,
      modelId: this.modelId,
      transcript,
      outcome: {
        kind: "unrecognized",
        code:
          generatedTokens >= this.config.maxOutputTokens
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
    this.disposed = true;
    void this.pipe?.dispose();
    this.pipe = null;
  }
}
