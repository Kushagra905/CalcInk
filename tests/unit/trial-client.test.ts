import { afterEach, describe, expect, it, vi } from "vitest";
import { getCandidate } from "../../src/recognition/candidates";
import type { LoadingState } from "../../src/recognition/loading-state";
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from "../../src/recognition/protocol";
import { TrialClient } from "../../src/recognition/trial-client";

class FakeWorker {
  static current: FakeWorker | null = null;
  onmessage: ((event: { data: WorkerToMainMessage }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  messages: MainToWorkerMessage[] = [];
  terminate = vi.fn();
  constructor() {
    FakeWorker.current = this;
  }
  postMessage(message: MainToWorkerMessage) {
    this.messages.push(message);
  }
  emit(message: WorkerToMainMessage) {
    this.onmessage?.({ data: message });
  }
}
const candidate = getCandidate("ink-on-comer-int8");
const manifest = {
  modelId: candidate.modelId,
  revision: candidate.revision,
  files: candidate.files,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeWorker.current = null;
});

async function ready(client: TrialClient) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(manifest))),
  );
  vi.stubGlobal("Worker", FakeWorker);
  const loading = client.load(candidate, "https://example.test/CalcInk/");
  await vi.waitFor(() => expect(FakeWorker.current).not.toBeNull());
  FakeWorker.current!.emit({ type: "READY", modelId: candidate.modelId });
  await loading;
  return FakeWorker.current!;
}

describe("trial client", () => {
  it("does not let a foreign initialization error terminate the chosen model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(manifest))),
    );
    vi.stubGlobal("Worker", FakeWorker);
    const client = new TrialClient(() => {});
    const loading = client.load(candidate, "https://example.test/");
    await vi.waitFor(() => expect(FakeWorker.current).not.toBeNull());
    const worker = FakeWorker.current;
    if (!worker) throw new Error("Missing worker");
    worker.emit({
      type: "ERROR",
      modelId: "foreign",
      key: null,
      code: "FOREIGN",
      message: "FOREIGN",
      recoverable: true,
    });
    worker.emit({ type: "READY", modelId: candidate.modelId });
    await loading;
    expect(worker.terminate).not.toHaveBeenCalled();
    client.unload();
  });

  it("rejects a manifest whose weight hashes differ from the pinned catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...manifest,
              files: manifest.files.map((file, index) =>
                index === 0 ? { ...file, sha256: "0".repeat(64) } : file,
              ),
            }),
          ),
      ),
    );
    vi.stubGlobal("Worker", FakeWorker);
    const client = new TrialClient(() => {});
    await expect(
      client.load(candidate, "https://example.test/"),
    ).rejects.toThrow("MODEL_MANIFEST_MISMATCH");
    expect(FakeWorker.current).toBeNull();
    client.unload();
  });

  it("blocks unlicensed candidates before requesting files", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const client = new TrialClient(() => {});
    await expect(
      client.load(
        getCandidate("trocr-mathwriting-int8"),
        "https://example.test/",
      ),
    ).rejects.toThrow("MODEL_LICENSE_UNRESOLVED");
    expect(fetch).not.toHaveBeenCalled();
    client.unload();
  });
  it.each([
    { epoch: 0 },
    { rowId: "row-2" },
    { rowRevision: 0 },
    { requestId: 999 },
    { modelId: "foreign" },
  ])(
    "ignores results and request errors with mismatched identity %j",
    async (foreign) => {
      const client = new TrialClient(() => {});
      const worker = await ready(client);
      const pending = client.recognize({
        epoch: 1,
        rowId: "row-1",
        rowRevision: 2,
        operations: [],
      });
      const request = worker.messages.find(
        (item) => item.type === "RECOGNIZE",
      )!;
      if (request.type !== "RECOGNIZE") throw new Error("Missing request");
      const response = {
        ...request.request,
        modelId: candidate.modelId,
        transcript: "1=",
        outcome: { kind: "incomplete" as const },
        visibleInkBounds: null,
        timing: { preprocessMs: 0, inferenceMs: 1, evaluateMs: 0 },
      };
      let accepted = false;
      void pending.then(() => {
        accepted = true;
      });
      const wrong = { ...response, ...foreign };
      worker.emit({ type: "RESULT", response: wrong });
      worker.emit({
        type: "ERROR",
        key: wrong,
        modelId: wrong.modelId,
        code: "FOREIGN",
        message: "FOREIGN",
        recoverable: true,
      });
      await Promise.resolve();
      expect(accepted).toBe(false);
      worker.emit({ type: "RESULT", response });
      await expect(pending).resolves.toMatchObject({ rowRevision: 2 });
      client.unload();
    },
  );
  it("rejects in-flight work when unloaded", async () => {
    const client = new TrialClient(() => {});
    const worker = await ready(client);
    const assertion = expect(
      client.recognize({
        epoch: 0,
        rowId: "row-1",
        rowRevision: 1,
        operations: [],
      }),
    ).rejects.toThrow("MODEL_UNLOADED");
    client.unload();
    await assertion;
    expect(worker.terminate).toHaveBeenCalled();
  });
  it("does not create a worker after unloading during manifest fetch", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    vi.stubGlobal("Worker", FakeWorker);
    const states: LoadingState[] = [];
    const client = new TrialClient((state) => states.push(state));
    const assertion = expect(
      client.load(candidate, "https://example.test/"),
    ).rejects.toThrow("MODEL_UNLOADED");
    client.unload();
    finish(new Response(JSON.stringify(manifest)));
    await assertion;
    expect(FakeWorker.current).toBeNull();
    expect(states.at(-1)).toEqual({ kind: "idle" });
  });

  it("aborts the manifest request on unload without replacing idle with an error", async () => {
    let signal: AbortSignal | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: RequestInit) => {
        const current = options.signal;
        if (!current) throw new Error("Missing cancellation signal");
        signal = current;
        return new Promise<Response>((_resolve, reject) => {
          current.addEventListener("abort", () => reject(current.reason), {
            once: true,
          });
        });
      }),
    );
    const states: LoadingState[] = [];
    const client = new TrialClient((state) => states.push(state));
    const loading = expect(
      client.load(candidate, "https://example.test/"),
    ).rejects.toThrow("MODEL_UNLOADED");
    client.unload();
    await loading;
    expect(signal).toMatchObject({ aborted: true });
    expect(states.at(-1)).toEqual({ kind: "idle" });
  });

  it("cancels an old download without interrupting the replacement load", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: RequestInit) => {
        const signal = options.signal;
        if (!signal) throw new Error("Missing cancellation signal");
        signals.push(signal);
        if (signals.length === 2)
          return Promise.resolve(new Response(JSON.stringify(manifest)));
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }),
    );
    vi.stubGlobal("Worker", FakeWorker);
    const states: LoadingState[] = [];
    const client = new TrialClient((state) => states.push(state));
    const obsolete = expect(
      client.load(candidate, "https://example.test/"),
    ).rejects.toThrow("MODEL_UNLOADED");
    const replacement = client.load(candidate, "https://example.test/");
    await obsolete;
    await vi.waitFor(() => expect(FakeWorker.current).not.toBeNull());
    const worker = FakeWorker.current;
    if (!worker) throw new Error("Missing replacement worker");
    worker.emit({ type: "READY", modelId: candidate.modelId });
    await replacement;
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(states.at(-1)).toEqual({
      kind: "ready",
      modelId: candidate.modelId,
    });
    expect(worker.terminate).not.toHaveBeenCalled();
    client.unload();
  });
});
