import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixture } from "../../src/dev/fixture";
import {
  connectRecognition,
  MOCK_MODEL_ID,
} from "../../src/dev/mockCoordinator";
import { getRowConfig, PAGE } from "../../src/document/rows";
import { createDocumentStore } from "../../src/document/store";
import type { DocumentEditEvent, InkOperation } from "../../src/document/types";
import { clientToPage, strokeBounds } from "../../src/ink/geometry";
import type {
  CoordinatorCallbacks,
  RecognitionResponse,
  WorkerReply,
  WorkerRequest,
} from "../../src/recognition/contracts";
import type { RecognitionRequest } from "../../src/recognition/protocol";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function stroke(rowId = "row-1"): InkOperation {
  const top = getRowConfig(rowId).top;
  const points = [{ x: 20, y: top + 40, pressure: 0.5, t: 1 }];
  return {
    kind: "stroke",
    stroke: {
      id: `dot-${rowId}`,
      rowId,
      width: 4,
      points,
      bounds: strokeBounds(points, 4, rowId),
    },
  };
}

function mockConnection() {
  const document = createDocumentStore();
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as Worker["onmessage"],
    onerror: null as Worker["onerror"],
  };
  const callbacks = {
    onModelState: vi.fn(),
    onClear: vi.fn(),
    onRecognizing: vi.fn(),
    onResult: vi.fn(),
    onRowError: vi.fn(),
  } satisfies CoordinatorCallbacks;
  const connection = connectRecognition(document, callbacks, { worker });
  const receive = (reply: WorkerReply) =>
    worker.onmessage?.call(
      worker as unknown as Worker,
      { data: reply } as MessageEvent<WorkerReply>,
    );
  const ready = async () => {
    receive({ type: "READY", modelId: MOCK_MODEL_ID });
    await vi.advanceTimersByTimeAsync(0);
  };
  const requests = () =>
    worker.postMessage.mock.calls
      .map(([request]) => request as WorkerRequest)
      .filter((request) => request.type === "RECOGNIZE")
      .map((request) => request.request);
  const response = (
    request: RecognitionRequest,
    transcript = "18+4×3=",
  ): RecognitionResponse => ({
    ...request,
    modelId: MOCK_MODEL_ID,
    transcript,
    outcome: { kind: "incomplete" },
    visibleInkBounds: null,
    timing: { preprocessMs: 0, inferenceMs: 0, evaluateMs: 0 },
  });
  return {
    document,
    worker,
    callbacks,
    connection,
    receive,
    ready,
    requests,
    response,
  };
}

describe("document and geometry contract", () => {
  it("maps an offset, scaled canvas to logical coordinates and retains dot width", () => {
    expect(
      clientToPage(250, 170, { left: 10, top: 50, width: 480, height: 240 }),
    ).toEqual({ x: 480, y: PAGE.height / 2 });
    expect(
      clientToPage(970, 530, { left: 10, top: 50, width: 960, height: 480 }),
    ).toEqual({ x: PAGE.width, y: PAGE.height });
    expect(() =>
      clientToPage(0, 0, { left: 0, top: 0, width: 0, height: 480 }),
    ).toThrow();
    const dot = stroke();
    if (dot.kind !== "stroke") throw new Error("Expected a pen stroke");
    expect(dot.stroke.bounds).toEqual({ x: 18, y: 38, width: 4, height: 4 });
  });

  it("publishes immutable snapshots, increments revisions and cancels without changing ink", () => {
    const document = createDocumentStore();
    const events: DocumentEditEvent[] = [];
    const unsubscribe = document.subscribe((event) => events.push(event));
    const operation = stroke();
    document.begin("row-1");
    document.commit([operation]);
    const saved = document.getRow("row-1");
    expect(
      events.map((event) => [event.phase, event.rows[0].rowRevision]),
    ).toEqual([
      ["begin", 1],
      ["commit", 2],
    ]);
    const savedOperation = saved.operations[0];
    if (operation.kind !== "stroke" || savedOperation.kind !== "stroke")
      throw new Error("Expected pen ink");
    Object.assign(operation.stroke.points[0], { x: 900 });
    expect(savedOperation.stroke.points[0].x).toBe(20);
    expect(() => {
      Object.assign(savedOperation.stroke.points[0], { x: 900 });
    }).toThrow();
    expect(Object.isFrozen(events[1].rows)).toBe(true);
    document.begin("row-1");
    expect(() => document.begin("row-2")).toThrow("already active");
    document.cancel();
    expect(document.getRow("row-1").operations).toBe(saved.operations);
    expect(document.getRow("row-1").rowRevision).toBe(3);
    expect(saved.rowRevision).toBe(2);
    unsubscribe();
    document.clear();
    expect(events).toHaveLength(4);
    expect(document.getEpoch()).toBe(1);
    expect(document.getRow("row-1").operations).toHaveLength(0);
    expect(document.getRow("row-1").rowRevision).toBe(4);
  });

  it("rejects foreign rows, invalid points and duplicate IDs without losing committed ink", () => {
    const document = createDocumentStore();
    expect(() => document.begin("missing")).toThrow("Unknown row");
    document.begin("row-1");
    expect(() => document.commit([stroke("row-2")])).toThrow();
    const invalid = stroke();
    if (invalid.kind === "stroke")
      Object.assign(invalid.stroke.points[0], { x: Number.NaN });
    expect(() => document.commit([invalid])).toThrow("Invalid ink point");
    const malformed = stroke();
    if (malformed.kind === "stroke") {
      Object.assign(malformed.stroke, { bounds: { x: 18, y: 38, height: 4 } });
    }
    expect(() => document.commit([malformed])).toThrow("Invalid stroke bounds");
    document.commit([stroke()]);
    const saved = document.getRow("row-1");
    document.begin("row-1");
    expect(() => document.commit([stroke(), stroke()])).toThrow(
      "Duplicate ink ID",
    );
    document.cancel();
    expect(document.getRow("row-1").operations).toBe(saved.operations);
  });

  it("accepts the synthetic fixture and preserves it when the operation cap is exceeded", () => {
    const document = createDocumentStore();
    document.begin("row-1");
    document.commit(createFixture());
    const saved = document.getRow("row-1").operations;
    document.begin("row-1");
    const overLimit = Array.from({ length: 1001 }, (_, index): InkOperation => {
      const dot = stroke();
      if (dot.kind === "stroke")
        Object.assign(dot.stroke, { id: `dot-${index}` });
      return dot;
    });
    expect(() => document.commit(overLimit)).toThrow("capacity");
    document.cancel();
    expect(document.getRow("row-1").operations).toBe(saved);
  });
});

describe("mock coordinator integration", () => {
  it("bounds pending recognition after 200 mixed edits and routes only the newest row snapshots", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(350);
    const old = mock.requests()[0];
    for (let index = 0; index < 200; index++) {
      const rowId = `row-${(index % 3) + 1}`;
      const reason = index % 2 ? "erase-stroke" : "draw";
      mock.document.begin(rowId, reason);
      mock.document.commit(index % 2 ? [] : [stroke(rowId)]);
      if (index % 10 === 0) {
        mock.document.undo();
        mock.document.redo();
      }
      if (index % 25 === 0) {
        mock.document.clear();
        mock.document.undo();
      }
    }
    for (const rowId of ["row-1", "row-2", "row-3"]) {
      mock.document.begin(rowId);
      mock.document.commit([stroke(rowId)]);
    }
    await vi.advanceTimersByTimeAsync(350);
    expect(mock.requests()).toHaveLength(1);
    mock.receive({ type: "RESULT", response: mock.response(old) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    for (let index = 1; index <= 3; index++) {
      const current = mock.requests()[index];
      expect(current.epoch).toBe(mock.document.getEpoch());
      expect(current.rowRevision).toBe(
        mock.document.getRow(current.rowId).rowRevision,
      );
      expect(current.operations).toBe(
        mock.document.getRow(current.rowId).operations,
      );
      mock.receive({ type: "RESULT", response: mock.response(current) });
      await vi.advanceTimersByTimeAsync(0);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.requests()).toHaveLength(4);
    expect(
      new Set(
        mock
          .requests()
          .slice(1)
          .map((item) => item.rowId),
      ).size,
    ).toBe(3);
    expect(mock.callbacks.onResult).toHaveBeenCalledTimes(3);
    mock.connection.dispose();
  });

  it("recognizes replacement, undo and redo with fresh identities after whole-stroke removal", async () => {
    const mock = mockConnection();
    await mock.ready();
    const original = stroke();
    mock.document.begin("row-1");
    mock.document.commit([original]);
    await vi.advanceTimersByTimeAsync(350);
    const first = mock.requests()[0];
    mock.receive({ type: "RESULT", response: mock.response(first, "18+4×3=") });
    await vi.advanceTimersByTimeAsync(0);
    mock.document.begin("row-1", "erase-stroke");
    mock.document.commit([]);
    mock.document.begin("row-1");
    if (original.kind !== "stroke") throw new Error("Expected stroke");
    const replacement: InkOperation = {
      kind: "stroke",
      stroke: { ...original.stroke, id: "replacement" },
    };
    mock.document.commit([replacement]);
    await vi.advanceTimersByTimeAsync(350);
    const second = mock.requests()[1];
    mock.receive({
      type: "RESULT",
      response: mock.response(second, "18+5×3="),
    });
    await vi.advanceTimersByTimeAsync(0);
    mock.document.undo();
    mock.document.undo();
    await vi.advanceTimersByTimeAsync(350);
    const restored = mock.requests()[2];
    expect(restored.rowRevision).toBeGreaterThan(second.rowRevision);
    expect(restored.operations[0]).toMatchObject({
      stroke: { id: "dot-row-1" },
    });
    mock.receive({
      type: "RESULT",
      response: mock.response(second, "OBSOLETE"),
    });
    mock.receive({
      type: "RESULT",
      response: mock.response(restored, "18+4×3="),
    });
    await vi.advanceTimersByTimeAsync(0);
    mock.document.redo();
    mock.document.redo();
    await vi.advanceTimersByTimeAsync(350);
    const redone = mock.requests()[3];
    expect(redone.rowRevision).toBeGreaterThan(restored.rowRevision);
    expect(redone.operations[0]).toMatchObject({
      stroke: { id: "replacement" },
    });
    mock.receive({
      type: "RESULT",
      response: mock.response(redone, "18+5×3="),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(
      mock.callbacks.onResult.mock.calls.map(([result]) => result.transcript),
    ).toEqual(["18+4×3=", "18+5×3=", "18+4×3=", "18+5×3="]);
    mock.connection.dispose();
  });
  it("dispatches a ready row while a newer row is still debouncing", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(200);
    mock.document.begin("row-2");
    mock.document.commit([stroke("row-2")]);
    await vi.advanceTimersByTimeAsync(150);
    const first = mock.requests()[0];
    expect(first.rowId).toBe("row-1");
    mock.receive({ type: "RESULT", response: mock.response(first) });
    await vi.advanceTimersByTimeAsync(199);
    expect(mock.requests()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mock.requests()[1].rowId).toBe("row-2");
    mock.connection.dispose();
  });

  it("drops an in-flight result after whole-stroke removal and dispatches no empty row", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(350);
    const old = mock.requests()[0];
    mock.document.begin("row-1", "erase-stroke");
    mock.document.commit([]);
    mock.receive({ type: "RESULT", response: mock.response(old) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.requests()).toHaveLength(1);
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    expect(mock.callbacks.onClear).toHaveBeenLastCalledWith("row-1");
    mock.connection.dispose();
  });

  it("rejects replies from a terminated worker after retry and keeps request IDs increasing", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(350);
    const old = mock.requests()[0];
    const obsoleteHandler = mock.worker.onmessage;
    mock.connection.retry();
    await mock.ready();
    await vi.advanceTimersByTimeAsync(350);
    const current = mock.requests()[1];
    expect(current.requestId).toBeGreaterThan(old.requestId);
    obsoleteHandler?.call(
      mock.worker as unknown as Worker,
      {
        data: { type: "RESULT", response: mock.response(old) },
      } as MessageEvent<WorkerReply>,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    mock.receive({ type: "RESULT", response: mock.response(current) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).toHaveBeenCalledTimes(1);
    mock.connection.dispose();
  });

  it("queues masked ink without constructing a recognition canvas on the main thread", async () => {
    const rasterize = vi.fn(() => {
      throw new Error("CANVAS_UNAVAILABLE");
    });
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor() {
          rasterize();
        }
      },
    );
    const mock = mockConnection();
    await mock.ready();
    const ink = stroke();
    mock.document.begin("row-1", "erase-pixel");
    expect(() =>
      mock.document.commit([
        ink,
        {
          kind: "pixel-mask",
          mask: {
            id: "mask",
            rowId: "row-1",
            radius: 1,
            points: [{ x: 20, y: 40, pressure: 0.5, t: 1 }],
          },
        },
      ]),
    ).not.toThrow();
    expect(mock.document.getRow("row-1").operations).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(350);
    expect(rasterize).not.toHaveBeenCalled();
    const request = mock.requests()[0];
    mock.receive({
      type: "ERROR",
      key: request,
      modelId: MOCK_MODEL_ID,
      code: "CANVAS_UNAVAILABLE",
      message: "CANVAS_UNAVAILABLE",
      recoverable: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onRowError).toHaveBeenCalledWith(
      "row-1",
      "CANVAS_UNAVAILABLE",
    );
    mock.connection.dispose();
  });

  it("debounces committed ink and carries it through the shared worker protocol", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit(createFixture());
    await vi.advanceTimersByTimeAsync(349);
    expect(mock.requests()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    const request = mock.requests()[0];
    expect(request).toMatchObject({
      epoch: 0,
      rowId: "row-1",
      rowRevision: 2,
      requestId: 1,
    });
    mock.receive({ type: "RESULT", response: mock.response(request) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "18+4×3=" }),
    );
    mock.connection.dispose();
  });

  it("rejects stale results and errors during an edit, after replacement, and after clear", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(350);
    const old = mock.requests()[0];
    mock.document.begin("row-1");
    mock.receive({ type: "RESULT", response: mock.response(old) });
    mock.receive({
      type: "ERROR",
      code: "OLD_ERROR",
      recoverable: true,
      modelId: MOCK_MODEL_ID,
      key: old,
      message: "OLD_ERROR",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    expect(mock.callbacks.onRowError).not.toHaveBeenCalled();
    mock.document.cancel();
    await vi.advanceTimersByTimeAsync(350);
    const current = mock.requests()[1];
    mock.receive({
      type: "RESULT",
      response: { ...mock.response(current), modelId: "another-model" },
    });
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    mock.receive({
      type: "RESULT",
      response: mock.response(current, "CURRENT"),
    });
    mock.receive({ type: "RESULT", response: mock.response(old, "OBSOLETE") });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).toHaveBeenCalledTimes(1);
    mock.document.clear();
    mock.receive({ type: "RESULT", response: mock.response(current) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).toHaveBeenCalledTimes(1);
    mock.connection.dispose();
  });

  it("waits for an active gesture when readiness arrives and cleans up on dispose", async () => {
    const mock = mockConnection();
    mock.document.begin("row-1");
    await mock.ready();
    expect(mock.requests()).toHaveLength(0);
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(350);
    expect(mock.requests()).toHaveLength(1);
    mock.connection.dispose();
    expect(mock.worker.terminate).toHaveBeenCalledTimes(1);
    expect(mock.worker.onmessage).toBeNull();
    const callCount = mock.worker.postMessage.mock.calls.length;
    mock.document.begin("row-2");
    mock.document.cancel();
    expect(mock.worker.postMessage.mock.calls).toHaveLength(callCount);
    mock.connection.dispose();
    expect(mock.worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("keeps one active job and only the latest pending revision per row", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(350);
    const first = mock.requests()[0];
    for (let i = 0; i < 100; i++) {
      mock.document.begin("row-2");
      mock.document.commit([stroke("row-2")]);
    }
    mock.document.begin("row-1");
    mock.document.cancel();
    mock.document.begin("row-2");
    mock.document.cancel();
    await vi.advanceTimersByTimeAsync(350);
    expect(mock.requests()).toHaveLength(1);
    mock.receive({ type: "RESULT", response: mock.response(first) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    const second = mock.requests()[1];
    expect(second.rowId).toBe("row-2");
    expect(second.rowRevision).toBe(mock.document.getRow("row-2").rowRevision);
    mock.receive({ type: "RESULT", response: mock.response(second) });
    await vi.advanceTimersByTimeAsync(0);
    const third = mock.requests()[2];
    expect(third.rowId).toBe("row-1");
    mock.receive({ type: "RESULT", response: mock.response(third) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.requests()).toHaveLength(3);
    mock.connection.dispose();
  });

  it("rejects pre-clear replies and recognizes undo with a fresh epoch", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(350);
    const old = mock.requests()[0];
    mock.document.clear();
    mock.document.undo();
    await vi.advanceTimersByTimeAsync(350);
    mock.receive({ type: "RESULT", response: mock.response(old) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    const restored = mock.requests()[1];
    expect(restored.epoch).toBeGreaterThan(old.epoch);
    expect(restored.rowRevision).toBeGreaterThan(old.rowRevision);
    mock.receive({ type: "RESULT", response: mock.response(restored) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.callbacks.onResult).toHaveBeenCalledTimes(1);
    mock.connection.dispose();
  });

  it("restarts once after ten seconds and leaves repeated timeout retryable", async () => {
    const mock = mockConnection();
    await mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    await vi.advanceTimersByTimeAsync(350 + 10000);
    expect(mock.worker.terminate).toHaveBeenCalledTimes(1);
    await mock.ready();
    await vi.advanceTimersByTimeAsync(350 + 10000);
    expect(mock.worker.terminate).toHaveBeenCalledTimes(2);
    expect(
      mock.worker.postMessage.mock.calls.filter(
        ([message]) => message.type === "INIT",
      ),
    ).toHaveLength(2);
    expect(mock.callbacks.onModelState).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "error", code: "INFERENCE_TIMEOUT" }),
    );
    mock.connection.retry();
    await mock.ready();
    await vi.advanceTimersByTimeAsync(350);
    expect(mock.requests()).toHaveLength(3);
    mock.connection.dispose();
  });
});
