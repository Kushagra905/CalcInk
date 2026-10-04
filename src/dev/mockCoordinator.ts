import type { DocumentStore } from "../document/store";
import type { ModelCandidate } from "../recognition/candidates";
import type {
  CoordinatorCallbacks,
  RecognitionCoordinator,
} from "../recognition/contracts";
import { createCoordinator } from "../recognition/coordinator";
import type { WorkerPort } from "../recognition/trial-client";

export const MOCK_MODEL_ID = "CALCINK_DEVELOPMENT_MOCK";

export function connectRecognition(
  document: DocumentStore,
  callbacks: CoordinatorCallbacks,
  options: { worker?: WorkerPort; behavior?: string; delayMs?: number } = {},
): RecognitionCoordinator {
  const query = new URLSearchParams(globalThis.location?.search);
  const behavior = options.behavior ?? query.get("mock") ?? "normal";
  const candidate: ModelCandidate = {
    modelId: MOCK_MODEL_ID,
    adapter: "ink-on",
    name: "Development fixture",
    revision: "fixture-v1",
    source: "",
    license: {
      status: "repository",
      id: null,
      evidence: "",
      note: "Synthetic fixtures; no model weights.",
    },
    files: [],
  };
  let starts = 0;
  return createCoordinator(document, callbacks, {
    candidate,
    baseUrl: "http://localhost/",
    manifest: {
      modelId: MOCK_MODEL_ID,
      revision: candidate.revision,
      files: [],
    },
    createWorker() {
      if (options.worker) return options.worker;
      const url = new URL("./mock.worker.ts", import.meta.url);
      const runBehavior =
        starts++ > 0 &&
        ["error", "init-error", "timeout-once"].includes(behavior)
          ? "normal"
          : behavior;
      url.searchParams.set("behavior", runBehavior);
      url.searchParams.set(
        "delay",
        String(options.delayMs ?? query.get("delay") ?? 180),
      );
      // Keep backslashes/slashes out of the module query: Windows path
      // normalization in the dev server can otherwise break relative imports.
      const bytes = new TextEncoder().encode(
        query.get("transcript") ?? "18+4×3=",
      );
      url.searchParams.set(
        "transcript64",
        btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
          .replaceAll("+", "-")
          .replaceAll("/", "_"),
      );
      return new Worker(url, { type: "module" });
    },
  });
}
