import type {
  Bounds,
  InkOperation,
  RowId,
} from "../document/types";

export interface RevisionKey {
  readonly epoch: number;
  readonly rowId: RowId;
  readonly rowRevision: number;
  readonly requestId: number;
}

export type CalculationOutcome =
  | {
      readonly kind: "answer";
      readonly value: string;
    }
  | {
      readonly kind: "incomplete";
    }
  | {
      readonly kind: "invalid";
      readonly code: string;
    }
  | {
      readonly kind: "undefined";
      readonly code: "DIVISION_BY_ZERO";
    }
  | {
      readonly kind: "unrecognized";
      readonly code: string;
    };

export interface RecognitionRequest extends RevisionKey {
  readonly operations: readonly InkOperation[];
}

export interface RecognitionResponse extends RevisionKey {
  readonly modelId: string;
  readonly transcript: string;
  readonly outcome: CalculationOutcome;
  readonly visibleInkBounds: Bounds | null;

  readonly timing: {
    readonly preprocessMs: number;
    readonly inferenceMs: number;
    readonly evaluateMs: number;
  };
}

export interface ModelAsset {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ModelManifest {
  readonly modelId: string;
  readonly revision: string;
  readonly files: readonly ModelAsset[];
}

export interface RecognitionConfig {
  readonly adapter: "mock" | "trocr" | "ink-on";
  readonly modelId: string;
  readonly manifest: ModelManifest;
  readonly baseUrl: string;
  readonly maxOutputTokens: number;
}

export interface AdapterProgress {
  readonly stage: "initializing" | "ready";
  readonly fraction: number;
}

export type MainToWorkerMessage =
  | {
      readonly type: "INIT";
      readonly config: RecognitionConfig;
    }
  | {
      readonly type: "RECOGNIZE";
      readonly request: RecognitionRequest;
    }
  | {
      readonly type: "DISPOSE";
    };

export type WorkerToMainMessage =
  | {
      readonly type: "PROGRESS";
      readonly modelId: string;
      readonly progress: AdapterProgress;
    }
  | {
      readonly type: "READY";
      readonly modelId: string;
    }
  | {
      readonly type: "RESULT";
      readonly response: RecognitionResponse;
    }
  | {
      readonly type: "ERROR";
      readonly modelId: string;
      readonly key: RevisionKey | null;
      readonly code: string;
      readonly message: string;
      readonly recoverable: boolean;
    };