import type { RowId } from "../document/types";
import type { RecognitionResponse } from "./protocol";

export type {
  CalculationOutcome,
  MainToWorkerMessage as WorkerRequest,
  RecognitionResponse,
  RevisionKey,
  WorkerToMainMessage as WorkerReply,
} from "./protocol";

export type ModelState =
  | { kind: "unavailable" }
  | { kind: "loading"; progress: number; message: string }
  | { kind: "ready"; modelId: string }
  | { kind: "error"; code: string };

export interface CoordinatorCallbacks {
  onModelState(state: ModelState): void;
  onClear(rowId: RowId): void;
  onRecognizing(rowId: RowId): void;
  onResult(result: RecognitionResponse): void;
  onRowError(rowId: RowId, code: string): void;
}

export interface RecognitionCoordinator {
  retry(): void;
  dispose(): void;
}
