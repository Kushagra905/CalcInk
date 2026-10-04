import type { Bounds, InkOperation, RowId } from "../document/types";

export interface RevisionKey {
  epoch: number;
  rowId: RowId;
  rowRevision: number;
  requestId: number;
}

export type CalculationOutcome =
  | { kind: "answer"; value: string }
  | { kind: "incomplete" }
  | { kind: "invalid"; code: string }
  | { kind: "undefined"; code: "DIVISION_BY_ZERO" }
  | { kind: "unrecognized"; code: string };

export interface RecognitionResponse extends RevisionKey {
  modelId: string;
  transcript: string;
  normalizedTranscript?: string | null;
  outcome: CalculationOutcome;
  visibleInkBounds: Bounds | null;
  timing: { preprocessMs: number; inferenceMs: number; evaluateMs: number };
}

export interface AssetManifest {
  modelId: string;
  revision: string;
  files: readonly { path: string; sha256: string; size: number }[];
}

export type WorkerRequest =
  | {
      type: "INIT";
      adapter: string;
      manifest: AssetManifest;
      baseUrl: string;
      decoderLimits: { maxTokens: number };
    }
  | ({ type: "RECOGNIZE"; operations: readonly InkOperation[] } & RevisionKey)
  | { type: "DISPOSE" };

export type WorkerReply =
  | { type: "PROGRESS"; progress: number; message: string }
  | { type: "READY"; modelId: string }
  | { type: "RESULT"; result: RecognitionResponse }
  | {
      type: "ERROR";
      code: string;
      recoverable: boolean;
      modelId: string;
      request?: RevisionKey;
    };

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

// B supplies model preprocessing and the concrete runtime adapter after selection.
export interface ModelAdapter {
  initialize(
    options: Extract<WorkerRequest, { type: "INIT" }>,
    onProgress: (progress: number, message: string) => void,
  ): Promise<void>;
  recognize(image: ImageData): Promise<{ text: string; inferenceMs: number }>;
  dispose(): Promise<void>;
}
