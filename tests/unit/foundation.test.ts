import { describe, expect, it, vi } from "vitest";
import { createFixture } from "../../src/dev/fixture";
import {
  connectRecognition,
  MOCK_MODEL_ID,
} from "../../src/dev/mockCoordinator";
import { createDocumentStore } from "../../src/document/store";
import type { DocumentEditEvent, InkOperation } from "../../src/document/types";
import { clientToPage, strokeBounds } from "../../src/ink/geometry";
import type {
  CoordinatorCallbacks,
  RecognitionResponse,
  WorkerReply,
  WorkerRequest,
} from "../../src/recognition/contracts";

function stroke(rowId = "row-1"): InkOperation {
  const top = rowId === "row-2" ? 160 : 0;
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
  const ready = () => receive({ type: "READY", modelId: MOCK_MODEL_ID });
  const requests = () =>
    worker.postMessage.mock.calls
      .map(([request]) => request as WorkerRequest)
      .filter((request) => request.type === "RECOGNIZE");
  const response = (
    request: Extract<WorkerRequest, { type: "RECOGNIZE" }>,
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
    ).toEqual({ x: 480, y: 240 });
    expect(
      clientToPage(970, 530, { left: 10, top: 50, width: 960, height: 480 }),
    ).toEqual({ x: 960, y: 480 });
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
    operation.stroke.points[0].x = 900;
    expect(savedOperation.stroke.points[0].x).toBe(20);
    expect(() => {
      savedOperation.stroke.points[0].x = 900;
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
    if (invalid.kind === "stroke") invalid.stroke.points[0].x = Number.NaN;
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
      if (dot.kind === "stroke") dot.stroke.id = `dot-${index}`;
      return dot;
    });
    expect(() => document.commit(overLimit)).toThrow("capacity");
    document.cancel();
    expect(document.getRow("row-1").operations).toBe(saved);
  });
});

describe("mock coordinator integration", () => {
  it("carries a committed fixture through the worker protocol to accepted callbacks", () => {
    const mock = mockConnection();
    mock.ready();
    mock.document.begin("row-1");
    mock.document.commit(createFixture());
    const request = mock.requests()[0];
    expect(request).toMatchObject({
      type: "RECOGNIZE",
      epoch: 0,
      rowId: "row-1",
      rowRevision: 2,
      requestId: 1,
    });
    mock.receive({ type: "RESULT", result: mock.response(request) });
    expect(mock.callbacks.onResult).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "18+4×3=" }),
    );
    mock.connection.dispose();
  });

  it("rejects stale results and errors during an edit, after replacement, and after clear", () => {
    const mock = mockConnection();
    mock.ready();
    mock.document.begin("row-1");
    mock.document.commit([stroke()]);
    const old = mock.requests()[0];
    mock.document.begin("row-1");
    mock.receive({ type: "RESULT", result: mock.response(old) });
    mock.receive({
      type: "ERROR",
      code: "OLD_ERROR",
      recoverable: true,
      modelId: MOCK_MODEL_ID,
      request: old,
    });
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    expect(mock.callbacks.onRowError).not.toHaveBeenCalled();
    mock.document.cancel();
    const current = mock.requests()[1];
    mock.receive({
      type: "RESULT",
      result: { ...mock.response(current), modelId: "another-model" },
    });
    expect(mock.callbacks.onResult).not.toHaveBeenCalled();
    mock.receive({ type: "RESULT", result: mock.response(current, "CURRENT") });
    mock.receive({ type: "RESULT", result: mock.response(old, "OBSOLETE") });
    expect(mock.callbacks.onResult).toHaveBeenCalledTimes(1);
    mock.document.clear();
    mock.receive({ type: "RESULT", result: mock.response(current) });
    expect(mock.callbacks.onResult).toHaveBeenCalledTimes(1);
    mock.connection.dispose();
  });

  it("waits for an active gesture when readiness arrives and cleans up on dispose", () => {
    const mock = mockConnection();
    mock.document.begin("row-1");
    mock.ready();
    expect(mock.requests()).toHaveLength(0);
    mock.document.commit([stroke()]);
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
});
