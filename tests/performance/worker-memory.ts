import type { Browser, CDPSession, Worker } from "@playwright/test";

export async function trackWasmAllocations(worker: Worker) {
  // Installed on worker creation, before asset verification finishes. WeakRefs
  // record constructor-created memories without retaining dead runtime instances.
  await worker.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      calcinkWasmRefs: WeakRef<WebAssembly.Memory>[];
    };
    scope.calcinkWasmRefs = [];
    const NativeMemory = WebAssembly.Memory;
    WebAssembly.Memory = class extends NativeMemory {
      constructor(descriptor: WebAssembly.MemoryDescriptor) {
        super(descriptor);
        scope.calcinkWasmRefs.push(new WeakRef(this));
      }
    };
  });
}

export interface WorkerMemory {
  usedSize: number;
  totalSize: number;
  embedderHeapUsedSize: number;
  backingStorageSize: number;
}

/** CDP diagnostic for Chromium-family browsers; never exposed in the product. */
export async function observeRecognitionMemory(browser: Browser) {
  const session = await browser.newBrowserCDPSession();
  const { targetInfos } = await session.send("Target.getTargets");
  const workers = targetInfos.filter(
    (target) => target.type === "worker" && /trial-worker-/.test(target.url),
  );
  if (workers.length !== 1) {
    await session.detach();
    throw new Error(`Expected one recognition worker, found ${workers.length}`);
  }
  const target = await session.send("Target.attachToTarget", {
    targetId: workers[0].targetId,
    flatten: false,
  });
  let sequence = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  session.on("Target.receivedMessageFromTarget", (event) => {
    if (event.sessionId !== target.sessionId) return;
    const reply = JSON.parse(event.message);
    const job = pending.get(reply.id);
    if (!job) return;
    clearTimeout(job.timer);
    pending.delete(reply.id);
    if (reply.error) job.reject(new Error(reply.error.message));
    else job.resolve(reply.result);
  });
  async function send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = ++sequence;
    const promise = new Promise<T>((resolve, reject) => {
      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer: setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Worker CDP timeout: ${method}`));
        }, 10_000),
      });
    });
    try {
      await session.send("Target.sendMessageToTarget", {
        sessionId: target.sessionId,
        message: JSON.stringify({ id, method, params }),
      });
    } catch (error) {
      const job = pending.get(id);
      if (job) {
        clearTimeout(job.timer);
        pending.delete(id);
        job.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return promise;
  }
  return {
    async sample() {
      await send("HeapProfiler.collectGarbage");
      const heap = await send<WorkerMemory>("Runtime.getHeapUsage");
      const memories = await send<{
        result: { value: { count: number; linearMemoryBytes: number[] } };
      }>("Runtime.evaluate", {
        expression:
          "(()=>{const memories=(globalThis.calcinkWasmRefs??[]).map(ref=>ref.deref()).filter(Boolean);return {count:memories.length,linearMemoryBytes:memories.map(memory=>memory.buffer.byteLength)}})()",
        returnByValue: true,
      });
      if (!memories.result.value?.count)
        throw new Error(
          "No tracked WASM allocation: the observer must be installed before runtime initialization",
        );
      return { ...heap, wasm: memories.result.value };
    },
    async dispose() {
      for (const job of pending.values()) {
        clearTimeout(job.timer);
        job.reject(new Error("Memory observer closed"));
      }
      pending.clear();
      await session.send("Target.detachFromTarget", {
        sessionId: target.sessionId,
      });
      await session.detach();
    },
  };
}

export async function pageMemory(session: CDPSession) {
  await session.send("HeapProfiler.collectGarbage");
  return session.send("Runtime.getHeapUsage");
}
