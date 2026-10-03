import type { RecognitionAdapter } from "../adapter";

import type {
  AdapterProgress,
  RecognitionRequest,
  RecognitionResponse,
} from "../protocol";

export type MockFixture = Pick<
  RecognitionResponse,
  "transcript" | "outcome" | "visibleInkBounds"
>;

export interface MockAdapterOptions {
  readonly fixtureFor: (request: RecognitionRequest) => MockFixture;

  readonly latencyMs?: (request: RecognitionRequest) => number;
}

export class MockRecognitionAdapter implements RecognitionAdapter {
  readonly modelId = "mock-v1";

  private state: "new" | "ready" | "disposed" = "new";
  private readonly options: MockAdapterOptions;

  constructor(options: MockAdapterOptions) {
    this.options = options;
  }

  async initialize(
    onProgress?: (progress: AdapterProgress) => void,
  ): Promise<void> {
    this.assertNotDisposed();

    if (this.state === "ready") {
      return;
    }

    onProgress?.({
      stage: "initializing",
      fraction: 0,
    });

    this.assertNotDisposed();
    this.state = "ready";

    onProgress?.({
      stage: "ready",
      fraction: 1,
    });
  }

  async recognize(request: RecognitionRequest): Promise<RecognitionResponse> {
    this.assertReady();

    const delay = this.options.latencyMs?.(request) ?? 0;

    if (!Number.isFinite(delay) || delay < 0) {
      throw new Error("INVALID_MOCK_DELAY");
    }

    if (delay > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }

    this.assertReady();

    const fixture = this.options.fixtureFor(request);

    return {
      epoch: request.epoch,
      rowId: request.rowId,
      rowRevision: request.rowRevision,
      requestId: request.requestId,
      modelId: this.modelId,
      transcript: fixture.transcript,
      outcome: fixture.outcome,
      visibleInkBounds: fixture.visibleInkBounds,
      timing: {
        preprocessMs: 0,
        inferenceMs: 0,
        evaluateMs: 0,
      },
    };
  }

  dispose(): void {
    this.state = "disposed";
  }

  private assertNotDisposed(): void {
    if (this.state === "disposed") {
      throw new Error("ADAPTER_DISPOSED");
    }
  }

  private assertReady(): void {
    this.assertNotDisposed();

    if (this.state !== "ready") {
      throw new Error("ADAPTER_NOT_READY");
    }
  }
}
