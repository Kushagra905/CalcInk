import type { DocumentStore } from "../document/store";
import { getCandidate, selectedModelId } from "./candidates";
import type { CoordinatorCallbacks, RecognitionCoordinator } from "./contracts";
import { createCoordinator } from "./coordinator";

export function connectRecognition(
  document: DocumentStore,
  callbacks: CoordinatorCallbacks,
  options: { mode?: "number" | "expression" } = {},
): RecognitionCoordinator {
  return createCoordinator(document, callbacks, {
    candidate: getCandidate(selectedModelId),
    baseUrl: new URL(import.meta.env.BASE_URL, window.location.href).href,
    mode: options.mode,
  });
}
