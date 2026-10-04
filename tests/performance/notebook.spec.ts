import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import { expect, type Page, test } from "@playwright/test";
import type { RecognitionResponse } from "../../src/recognition/protocol";
import {
  observeRecognitionMemory,
  pageMemory,
  trackWasmAllocations,
} from "./worker-memory";

declare global {
  interface Window {
    calcinkPhase6: {
      phase: "off" | "idle" | "drawing" | "cycles";
      frames: { idle: number[]; drawing: number[] };
      lastFrame: number;
      pointerId: number;
      activeRow: string | null;
      downAt: number;
      heldMs: number;
      lastInput: number | null;
      inputCount: number;
      latency: number[];
      mutations: number;
      created: number;
      activeWorkers: number;
      maxWorkers: number;
      results: {
        phase: string;
        overlapping: boolean;
        response: RecognitionResponse;
      }[];
      errors: string[];
      tasks: {
        phase: string;
        startTime: number;
        duration: number;
        name: string;
      }[];
    };
  }
}

async function position(page: Page, x: number, y: number) {
  const box = await page.locator('[data-layer="live"]').boundingBox();
  if (!box) throw new Error("Missing notebook canvas");
  return {
    x: box.x + (x / 960) * box.width,
    y: box.y + (y / 480) * box.height,
  };
}
async function dot(page: Page, x = 130, y = 70) {
  const point = await position(page, x, y);
  await page.mouse.click(point.x, point.y);
}
async function one(page: Page) {
  const start = await position(page, 120, 45);
  const end = await position(page, 120, 110);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  await page.mouse.up();
}
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    medianMs: sorted[Math.ceil(sorted.length / 2) - 1] ?? null,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null,
    maxMs: sorted.at(-1) ?? null,
  };
}

test("measure 60 seconds of drawing during real inference and 200 edit/clear cycles", async ({
  page,
  browser,
}) => {
  let wasmTracking: Promise<void> | null = null;
  page.on("worker", (worker) => {
    wasmTracking = trackWasmAllocations(worker);
  });
  await page.addInitScript(() => {
    const qa: Window["calcinkPhase6"] = {
      phase: "off",
      frames: { idle: [], drawing: [] },
      lastFrame: 0,
      pointerId: 0,
      activeRow: null,
      downAt: 0,
      heldMs: 0,
      lastInput: null,
      inputCount: 0,
      latency: [],
      mutations: 0,
      created: 0,
      activeWorkers: 0,
      maxWorkers: 0,
      results: [],
      errors: [],
      tasks: [],
    };
    window.calcinkPhase6 = qa;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private stopped = false;
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        qa.created++;
        qa.maxWorkers = Math.max(qa.maxWorkers, ++qa.activeWorkers);
        this.addEventListener("message", ({ data }) => {
          if (data.type === "RESULT")
            qa.results.push({
              phase: qa.phase,
              overlapping:
                qa.phase === "drawing" &&
                !!qa.activeRow &&
                qa.activeRow !== data.response.rowId,
              response: data.response,
            });
          if (data.type === "ERROR") qa.errors.push(data.message);
        });
      }
      terminate() {
        if (!this.stopped) qa.activeWorkers--;
        this.stopped = true;
        super.terminate();
      }
    };
    const input = (event: PointerEvent) =>
      event.target instanceof HTMLCanvasElement &&
      event.target.dataset.layer === "live";
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (!input(event)) return;
        const box = (event.target as HTMLCanvasElement).getBoundingClientRect();
        qa.pointerId = event.pointerId;
        qa.activeRow = `row-${Math.floor(((event.clientY - box.y) / box.height) * 3) + 1}`;
        qa.downAt = performance.now();
      },
      true,
    );
    window.addEventListener(
      "pointerup",
      (event) => {
        if (!input(event)) return;
        if (qa.phase === "drawing") qa.heldMs += performance.now() - qa.downAt;
        qa.activeRow = null;
      },
      true,
    );
    window.addEventListener(
      "pointermove",
      (event) => {
        if (qa.phase !== "drawing" || !qa.activeRow || !input(event)) return;
        qa.inputCount++;
        qa.lastInput = performance.now();
      },
      true,
    );
    function frame(now: number) {
      if (qa.phase === "idle" || qa.phase === "drawing") {
        if (qa.lastFrame) qa.frames[qa.phase].push(now - qa.lastFrame);
        if (qa.phase === "drawing" && qa.lastInput !== null) {
          qa.latency.push(performance.now() - qa.lastInput);
          qa.lastInput = null;
        }
      }
      qa.lastFrame = now;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    if (PerformanceObserver.supportedEntryTypes.includes("longtask"))
      new PerformanceObserver((list) => {
        if (qa.phase !== "drawing") return;
        for (const entry of list.getEntries())
          qa.tasks.push({
            phase: qa.phase,
            startTime: entry.startTime,
            duration: entry.duration,
            name: entry.name,
          });
      }).observe({ type: "longtask" });
    new MutationObserver((list) => {
      if (qa.phase === "drawing") qa.mutations += list.length;
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("./");
  await expect(page.getByTestId("offline-status")).toHaveText("Ready offline", {
    timeout: 90_000,
  });
  await expect(page.locator(".mock-notice")).toHaveCount(0);
  await one(page);
  await expect(page.locator('[data-row="row-1"]')).toHaveClass(/ready/);
  await page.evaluate(() => {
    window.calcinkPhase6.phase = "idle";
    window.calcinkPhase6.lastFrame = 0;
  });
  await page.waitForTimeout(2000);
  const started = await page.evaluate(() => {
    window.calcinkPhase6.phase = "drawing";
    window.calcinkPhase6.lastFrame = 0;
    return performance.now();
  });
  console.log("Starting 60-second real-model drawing measurement.");
  while ((await page.evaluate(() => window.calcinkPhase6.heldMs)) < 60_000) {
    await dot(page);
    const start = await position(page, 140, 235);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            '[data-layer="live"]',
          );
          if (!canvas) throw new Error("Missing canvas");
          const box = canvas.getBoundingClientRect();
          const started = performance.now();
          function move(now: number) {
            const elapsed = now - started;
            canvas?.dispatchEvent(
              new PointerEvent("pointermove", {
                pointerId: window.calcinkPhase6.pointerId,
                isPrimary: true,
                buttons: 1,
                pressure: 0.5,
                clientX:
                  box.x +
                  ((140 + 50 * Math.sin(elapsed / 180)) / 960) * box.width,
                clientY:
                  box.y +
                  ((235 + 25 * Math.sin(elapsed / 120)) / 480) * box.height,
              }),
            );
            if (elapsed >= 2000) resolve();
            else requestAnimationFrame(move);
          }
          requestAnimationFrame(move);
        }),
    );
    await page.mouse.up();
  }
  const elapsedMs = await page.evaluate((started) => {
    window.calcinkPhase6.phase = "off";
    return performance.now() - started;
  }, started);
  const drawing = await page.evaluate(() => window.calcinkPhase6);
  const frameBudget = distribution(drawing.frames.idle).medianMs ?? 1000 / 60;
  const missedSlots = drawing.frames.drawing.reduce(
    (count, ms) => count + Math.max(0, Math.round(ms / frameBudget) - 1),
    0,
  );
  const cdp = await page.context().newCDPSession(page);
  if (!wasmTracking) throw new Error("Recognition worker was not observed");
  await wasmTracking;
  const runtimeMemory = await observeRecognitionMemory(browser);
  const workerHeap = [{ cycle: 0, ...(await runtimeMemory.sample()) }];
  const heap: { cycle: number; usedSize: number; totalSize: number }[] = [];
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.evaluate(() => {
    window.calcinkPhase6.phase = "cycles";
  });
  for (let cycle = 1; cycle <= 200; cycle++) {
    const before = await page.evaluate(
      () =>
        window.calcinkPhase6.results.filter(
          ({ response }) => response.rowId === "row-1",
        ).length,
    );
    await one(page);
    await dot(page);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              window.calcinkPhase6.results.filter(
                ({ response }) => response.rowId === "row-1",
              ).length,
          ),
        {
          intervals: [50, 100],
          timeout: 15_000,
        },
      )
      .toBeGreaterThan(before);
    await expect(page.locator('[data-row="row-1"]')).toHaveClass(/ready/);
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    if ([20, 50, 100, 150, 200].includes(cycle)) {
      await cdp.send("HeapProfiler.collectGarbage");
      const { usedSize, totalSize } = await cdp.send("Runtime.getHeapUsage");
      heap.push({ cycle, usedSize, totalSize });
      workerHeap.push({ cycle, ...(await runtimeMemory.sample()) });
      console.log(
        `Completed ${cycle}/200 real-model edit/clear cycles; main-thread JS heap ${usedSize} bytes.`,
      );
    }
  }
  await page.evaluate(() => {
    window.calcinkPhase6.phase = "off";
  });
  // Sample only after Clear and before undo reintroduces old ink/inference.
  const afterIdle = [];
  for (let seconds = 1; seconds <= 10; seconds++) {
    await page.waitForTimeout(1000);
    if ([2, 5, 10].includes(seconds))
      afterIdle.push({
        seconds,
        worker: await runtimeMemory.sample(),
        page: await pageMemory(cdp),
        activeWorkers: page.workers().length,
      });
  }
  await runtimeMemory.dispose();
  const clearSurfaceEmpty = await page
    .locator('[data-layer="ink"]')
    .evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext("2d")
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!pixels) throw new Error("Missing ink surface");
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return false;
      return true;
    });
  for (let i = 0; i < 100; i++)
    await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  const final = await page.evaluate(() => window.calcinkPhase6);
  const cycles = final.results.filter(
    (result) => result.phase === "cycles" && result.response.rowId === "row-1",
  );
  const report = {
    baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    applicationDiffSha256: createHash("sha256")
      .update(execFileSync("git", ["diff", "HEAD", "--", "src"]))
      .digest("hex"),
    buildVersion: await page
      .locator('meta[name="calcink-build"]')
      .getAttribute("content"),
    environment: {
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      platform: os.platform(),
      osRelease: os.release(),
      arch: os.arch(),
      browser: browser.version(),
      headless: true,
      viewport: page.viewportSize(),
      dpr: await page.evaluate(() => devicePixelRatio),
    },
    methodology:
      "Synthetic pointer moves on an actual captured mouse pointer; 2-second strokes and short lifts for repeated other-row recognition. rAF cadence and input-to-next-rAF are proxies, not physical display/pen latency. Post-GC heap covers the main-thread JS isolate, not worker/WASM/GPU/process memory. No genuine samples or accuracy claims.",
    elapsedMs,
    heldPointerMs: drawing.heldMs,
    pointerMoves: drawing.inputCount,
    idleFrames: distribution(drawing.frames.idle),
    drawingFrames: distribution(drawing.frames.drawing),
    observedRafPerSecond: (drawing.frames.drawing.length * 1000) / elapsedMs,
    referenceFrameBudgetMs: frameBudget,
    estimatedMissedSlots: missedSlots,
    estimatedMissedSlotPercent:
      (missedSlots * 100) / (missedSlots + drawing.frames.drawing.length),
    inputToNextRaf: distribution(drawing.latency),
    longTaskObserverSupported: await page.evaluate(() =>
      PerformanceObserver.supportedEntryTypes.includes("longtask"),
    ),
    longTasks: drawing.tasks,
    domMutations: drawing.mutations,
    overlappingRealResults: drawing.results.filter(
      (result) => result.overlapping,
    ).length,
    cycles: {
      requested: 200,
      responses: cycles.length,
      syntheticWorkerTimings: distribution(
        cycles.map(({ response }) =>
          Object.values(response.timing).reduce((a, b) => a + b, 0),
        ),
      ),
      postGcMainThreadJsHeap: heap,
      postGcRecognitionWorker: workerHeap,
      afterIdle,
      memoryScope:
        "CDP per-isolate JS heap, embedder GC heap and backing storage. A test-only WebAssembly.Memory constructor wrapper installed at worker creation records WeakRefs; each surviving buffer.byteLength is reserved WASM linear memory, not allocator live bytes or process RSS. No strong memory references persist. Forced GC is diagnostic and is excluded from frame/latency measurements.",
      undoCommandsRetained: 100,
      clearSurfaceEmpty,
    },
    workers: {
      created: final.created,
      peak: final.maxWorkers,
      active: page.workers().length,
    },
    browserErrors,
    workerErrors: final.errors,
  };
  await writeFile(
    test.info().outputPath("performance.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await test.info().attach("performance", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify(report, null, 2));
  expect(elapsedMs).toBeGreaterThanOrEqual(60_000);
  expect(drawing.heldMs).toBeGreaterThanOrEqual(60_000);
  expect(report.longTaskObserverSupported).toBe(true);
  expect(report.overlappingRealResults).toBeGreaterThan(0);
  expect(cycles.length).toBeGreaterThanOrEqual(200);
  expect(clearSurfaceEmpty).toBe(true);
  expect(final.maxWorkers).toBe(1);
  expect(page.workers()).toHaveLength(1);
  expect(final.errors).toEqual([]);
  expect(browserErrors).toEqual([]);
  // Timing is evidence to inspect on the named device, not a flaky universal FPS gate.
  expect(drawing.frames.drawing.length).toBeGreaterThan(0);
});
