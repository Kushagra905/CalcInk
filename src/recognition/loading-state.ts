import type { AdapterProgress, WorkerToMainMessage } from "./protocol";

export type LoadingState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly modelId: string; readonly progress: AdapterProgress | null }
  | { readonly kind: "ready"; readonly modelId: string }
  | { readonly kind: "error"; readonly modelId: string; readonly message: string };

export function reduceLoading(state: LoadingState, message: WorkerToMainMessage): LoadingState {
  if (message.type === "RESULT") return state;
  if (state.kind !== "loading" || message.modelId !== state.modelId) return state;
  if (message.type === "PROGRESS") return { ...state, progress: message.progress };
  if (message.type === "READY") return { kind: "ready", modelId: message.modelId };
  if (message.type === "ERROR" && message.key === null) return { kind: "error", modelId: message.modelId, message: message.message };
  return state;
}
