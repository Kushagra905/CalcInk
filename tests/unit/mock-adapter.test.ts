import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  MockRecognitionAdapter,
} from "../../src/recognition/adapters/mock";

import type {
  MockFixture,
} from "../../src/recognition/adapters/mock";

import type {
  RecognitionRequest,
} from "../../src/recognition/protocol";

const fixture: MockFixture = {
  transcript: "18 + 4 × 3 =",
  outcome: {
    kind: "answer",
    value: "30",
  },
  visibleInkBounds: {
    x: 20,
    y: 30,
    width: 240,
    height: 60,
  },
};

function request(requestId = 1): RecognitionRequest {
  return {
    epoch: 2,
    rowId: "row-1",
    rowRevision: 7,
    requestId,
    operations: [],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MockRecognitionAdapter", () => {
  it("rejects recognition before initialization", async () => {
    const adapter = new MockRecognitionAdapter({
      fixtureFor: () => fixture,
    });

    await expect(
      adapter.recognize(request()),
    ).rejects.toThrow("ADAPTER_NOT_READY");
  });

  it("preserves request identity and returns the fixture", async () => {
    const adapter = new MockRecognitionAdapter({
      fixtureFor: () => fixture,
    });

    await adapter.initialize();

    const result = await adapter.recognize(request(42));

    expect(result).toEqual({
      epoch: 2,
      rowId: "row-1",
      rowRevision: 7,
      requestId: 42,
      modelId: "mock-v1",
      ...fixture,
      timing: {
        preprocessMs: 0,
        inferenceMs: 0,
        evaluateMs: 0,
      },
    });
  });

  it("can simulate replies arriving out of order", async () => {
    vi.useFakeTimers();

    const adapter = new MockRecognitionAdapter({
      fixtureFor: () => fixture,
      latencyMs: (input) =>
        input.requestId === 1 ? 100 : 10,
    });

    await adapter.initialize();

    const completed: number[] = [];

    const first = adapter.recognize(request(1)).then((result) => {
      completed.push(result.requestId);
    });

    const second = adapter.recognize(request(2)).then((result) => {
      completed.push(result.requestId);
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(completed).toEqual([2]);

    await vi.advanceTimersByTimeAsync(90);
    await Promise.all([first, second]);

    expect(completed).toEqual([2, 1]);
  });

  it("supports a failure followed by a successful request", async () => {
    const adapter = new MockRecognitionAdapter({
      fixtureFor: (input) => {
        if (input.requestId === 1) {
          throw new Error("MOCK_INFERENCE_FAILURE");
        }

        return fixture;
      },
    });

    await adapter.initialize();

    await expect(
      adapter.recognize(request(1)),
    ).rejects.toThrow("MOCK_INFERENCE_FAILURE");

    await expect(
      adapter.recognize(request(2)),
    ).resolves.toMatchObject({
      requestId: 2,
      outcome: {
        kind: "answer",
        value: "30",
      },
    });
  });

  it("rejects use after disposal", async () => {
    const adapter = new MockRecognitionAdapter({
      fixtureFor: () => fixture,
    });

    await adapter.initialize();
    adapter.dispose();

    await expect(
      adapter.recognize(request()),
    ).rejects.toThrow("ADAPTER_DISPOSED");

    await expect(
      adapter.initialize(),
    ).rejects.toThrow("ADAPTER_DISPOSED");
  });

  it("rejects a pending request if disposed while waiting", async () => {
    vi.useFakeTimers();

    const adapter = new MockRecognitionAdapter({
      fixtureFor: () => fixture,
      latencyMs: () => 100,
    });

    await adapter.initialize();

    const pending = adapter.recognize(request());

    const assertion = expect(pending).rejects.toThrow(
      "ADAPTER_DISPOSED",
    );

    adapter.dispose();

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});