import type { DocumentStore } from "../document/store";
import type { CoordinatorCallbacks, RecognitionCoordinator } from "./contracts";

// B replaces this entry point when the licensed local model is integrated.
export function connectRecognition(
  _document: DocumentStore,
  callbacks: CoordinatorCallbacks,
): RecognitionCoordinator {
  const unavailable = () => callbacks.onModelState({ kind: "unavailable" });
  unavailable();
  return { retry: unavailable, dispose() {} };
}
