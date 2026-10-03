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
  it("requires every result identity field to match", async () => {
    const client = new TrialClient(() => {});
    const worker = await ready(client);
    const pending = client.recognize({
      epoch: 1,
      rowId: "row-1",
      rowRevision: 2,
      operations: [],
    });
    const request = worker.messages.find((item) => item.type === "RECOGNIZE")!;
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
    worker.emit({ type: "RESULT", response: { ...response, rowRevision: 0 } });
    await Promise.resolve();
    expect(accepted).toBe(false);
    worker.emit({ type: "RESULT", response });
    await expect(pending).resolves.toMatchObject({ rowRevision: 2 });
    client.unload();
  });
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
});
