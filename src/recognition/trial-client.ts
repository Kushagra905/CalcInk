import type { ModelCandidate } from "./candidates";
import { assertTrialAllowed } from "./candidates";
import type { LoadingState } from "./loading-state";
import { reduceLoading } from "./loading-state";
import { assetUrl } from "./local-assets";
import type {
  MainToWorkerMessage,
  ModelManifest,
  RecognitionRequest,
  RecognitionResponse,
  WorkerToMainMessage,
} from "./protocol";

export type WorkerPort = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror"
>;

/** One worker and one active request; document scheduling belongs to the coordinator. */
export class TrialClient {
  private worker: WorkerPort | null = null;
  private state: LoadingState = { kind: "idle" };
  private sequence = 0;
  private generation = 0;
  private manifestAbort: AbortController | null = null;
  private init: {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private pending = new Map<
    number,
    {
      request: RecognitionRequest;
      resolve: (result: RecognitionResponse) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    private readonly onState: (state: LoadingState) => void,
    private readonly createWorker: () => WorkerPort = () =>
      new Worker(new URL("./trial-worker.ts", import.meta.url), {
        type: "module",
      }),
  ) {}

  async load(
    candidate: ModelCandidate,
    baseUrl: string,
    suppliedManifest?: ModelManifest,
  ): Promise<void> {
    this.unload();
    const generation = this.generation;
    this.setState({
      kind: "loading",
      modelId: candidate.modelId,
      progress: null,
    });
    try {
      assertTrialAllowed(candidate);
      let manifest = suppliedManifest;
      if (!manifest) {
        const controller = new AbortController();
        this.manifestAbort = controller;
        try {
          const response = await fetch(
            assetUrl(baseUrl, `models/${candidate.modelId}/manifest.json`),
            {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(90_000),
              ]),
            },
          );
          if (generation !== this.generation) throw new Error("MODEL_UNLOADED");
          if (!response.ok)
            throw new Error("ASSETS_NOT_PREPARED: run npm run assets:prepare");
          manifest = (await response.json()) as ModelManifest;
        } finally {
          if (this.manifestAbort === controller) this.manifestAbort = null;
        }
      }
      if (generation !== this.generation) throw new Error("MODEL_UNLOADED");
      if (
        manifest.modelId !== candidate.modelId ||
        manifest.revision !== candidate.revision ||
        !Array.isArray(manifest.files) ||
        candidate.files.some(
          (file) =>
            !manifest.files.some(
              (declared) =>
                declared.path === file.path &&
                declared.bytes === file.bytes &&
                declared.sha256 === file.sha256,
            ),
        )
      )
        throw new Error("MODEL_MANIFEST_MISMATCH");
      const worker = this.createWorker();
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
        if (this.worker !== worker) return;
        this.receive(event.data);
      };
      worker.onerror = (event) => {
        if (this.worker === worker)
          this.fail(new Error(event.message || "WORKER_FAILED"));
      };
      await new Promise<void>((resolve, reject) => {
        this.init = {
          resolve,
          reject,
          timer: setTimeout(
            () => this.fail(new Error("MODEL_INIT_TIMEOUT")),
            90_000,
          ),
        };
        this.send({
          type: "INIT",
          config: {
            adapter: candidate.adapter,
            modelId: candidate.modelId,
            manifest,
            baseUrl,
            maxOutputTokens: 64,
          },
        });
      });
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (generation === this.generation) this.fail(failure, candidate.modelId);
      throw failure;
    }
  }

  recognize(
    input: Omit<RecognitionRequest, "requestId">,
  ): Promise<RecognitionResponse> {
    if (this.state.kind !== "ready")
      return Promise.reject(new Error("ADAPTER_NOT_READY"));
    if (this.pending.size) return Promise.reject(new Error("TRIAL_BUSY"));
    const request = { ...input, requestId: ++this.sequence };
    return new Promise((resolve, reject) => {
      this.pending.set(request.requestId, {
        request,
        resolve,
        reject,
        timer: setTimeout(
          () => this.fail(new Error("INFERENCE_TIMEOUT")),
          10_000,
        ),
      });
      this.send({ type: "RECOGNIZE", request });
    });
  }

  unload(): void {
    this.generation++;
    this.manifestAbort?.abort(new Error("MODEL_UNLOADED"));
    this.manifestAbort = null;
    this.terminateWorker();
    this.rejectPending(new Error("MODEL_UNLOADED"));
    this.setState({ kind: "idle" });
  }

  private send(message: MainToWorkerMessage): void {
    try {
      if (!this.worker) throw new Error("WORKER_NOT_AVAILABLE");
      this.worker.postMessage(message);
    } catch (error) {
      this.fail(
        error instanceof Error ? error : new Error("WORKER_SEND_FAILED"),
      );
    }
  }
  private terminateWorker(): void {
    if (!this.worker) return;
    this.worker.onmessage = this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }
  private setState(state: LoadingState): void {
    this.state = state;
    this.onState(state);
  }
  private rejectPending(error: Error): void {
    if (this.init) {
      clearTimeout(this.init.timer);
      this.init.reject(error);
      this.init = null;
    }
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }
  private fail(
    error: Error,
    modelId = this.state.kind === "idle" ? "uninitialized" : this.state.modelId,
  ): void {
    this.terminateWorker();
    this.rejectPending(error);
    this.setState({ kind: "error", modelId, message: error.message });
  }
  private receive(message: WorkerToMainMessage): void {
    this.setState(reduceLoading(this.state, message));
    if (
      message.type === "READY" &&
      this.state.kind === "ready" &&
      message.modelId === this.state.modelId &&
      this.init
    ) {
      clearTimeout(this.init.timer);
      this.init.resolve();
      this.init = null;
    }
    if (
      message.type === "ERROR" &&
      message.key === null &&
      this.state.kind !== "idle" &&
      message.modelId === this.state.modelId
    ) {
      this.fail(new Error(message.message), message.modelId);
      return;
    }
    const key =
      message.type === "RESULT"
        ? message.response
        : message.type === "ERROR"
          ? message.key
          : null;
    if (!key || this.state.kind !== "ready") return;
    const item = this.pending.get(key.requestId);
    if (!item) return;
    const request = item.request;
    const modelId =
      message.type === "RESULT"
        ? message.response.modelId
        : message.type === "ERROR"
          ? message.modelId
          : "";
    if (
      modelId !== this.state.modelId ||
      key.epoch !== request.epoch ||
      key.rowId !== request.rowId ||
      key.rowRevision !== request.rowRevision
    )
      return;
    if (message.type === "ERROR" && !message.recoverable) {
      this.fail(new Error(message.message), message.modelId);
      return;
    }
    clearTimeout(item.timer);
    this.pending.delete(key.requestId);
    if (message.type === "RESULT") item.resolve(message.response);
    else if (message.type === "ERROR") item.reject(new Error(message.message));
  }
}
