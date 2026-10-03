import type {
  AdapterProgress,
  RecognitionRequest,
  RecognitionResponse,
} from "./protocol";

export interface RecognitionAdapter {
  readonly modelId: string;

  initialize(onProgress?: (progress: AdapterProgress) => void): Promise<void>;

  recognize(request: RecognitionRequest): Promise<RecognitionResponse>;

  dispose(): void;
}
