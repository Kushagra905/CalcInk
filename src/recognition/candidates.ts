import catalog from "../../assets/model-candidates.json";
import type { ModelAsset } from "./protocol";

export interface CandidateAsset extends ModelAsset {
  readonly url: string;
}

export interface ModelCandidate {
  readonly modelId: string;
  readonly adapter: "trocr" | "ink-on";
  readonly name: string;
  readonly revision: string;
  readonly source: string;
  readonly license: {
    readonly status: "missing" | "repository";
    readonly id: string | null;
    readonly evidence: string;
    readonly note: string;
  };
  readonly files: readonly CandidateAsset[];
}

export const candidates = catalog.candidates as readonly ModelCandidate[];
export const selectedModelId = catalog.selectedModelId;

export function getCandidate(modelId: string): ModelCandidate {
  const candidate = candidates.find((item) => item.modelId === modelId);
  if (!candidate) throw new Error("UNKNOWN_MODEL");
  return candidate;
}

export function assertTrialAllowed(candidate: ModelCandidate): void {
  if (candidate.license.status === "missing") {
    throw new Error("MODEL_LICENSE_UNRESOLVED");
  }
}
