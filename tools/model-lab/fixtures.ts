import type { InkOperation } from "../../src/document/types";
import { sampleCases } from "./cases.ts";

export interface CapturedSample {
  readonly sampleId: string;
  readonly capturedAt: string;
  readonly operations: readonly InkOperation[];
}
export interface FixtureBundle { readonly schemaVersion: 1; readonly samples: readonly CapturedSample[]; }

export function parseFixtures(value: unknown): FixtureBundle {
  if (!value || typeof value !== "object") throw new Error("INVALID_FIXTURE_FILE");
  const bundle = value as FixtureBundle;
  if (bundle.schemaVersion !== 1 || !Array.isArray(bundle.samples) || bundle.samples.length > 74) throw new Error("INVALID_FIXTURE_FILE");
  const ids = new Set<string>();
  let pointCount = 0;
  for (const sample of bundle.samples) {
    if (!sample || !sampleCases.some((item) => item.id === sample.sampleId) || ids.has(sample.sampleId) || !Number.isFinite(Date.parse(sample.capturedAt)) || !Array.isArray(sample.operations) || !sample.operations.length || sample.operations.length > 1000) throw new Error("INVALID_SAMPLE");
    ids.add(sample.sampleId);
    for (const operation of sample.operations) {
      if (!operation || !["stroke", "pixel-mask"].includes(operation.kind)) throw new Error("INVALID_OPERATION");
      const geometry = operation.kind === "stroke" ? operation.stroke : operation.mask;
      if (!geometry || typeof geometry.id !== "string" || geometry.rowId !== "row-1" || !Array.isArray(geometry.points) || !geometry.points.length) throw new Error("INVALID_GEOMETRY");
      const width = operation.kind === "stroke" ? operation.stroke.width : operation.mask.radius;
      if (!Number.isFinite(width) || width <= 0 || width > 50) throw new Error("INVALID_WIDTH");
      for (const point of geometry.points) {
        pointCount++;
        if (pointCount > 200_000 || ![point.x, point.y, point.pressure, point.t].every(Number.isFinite) || point.x < 0 || point.x > 960 || point.y < 0 || point.y > 136 || point.pressure < 0 || point.pressure > 1) throw new Error("INVALID_POINT");
      }
    }
  }
  return bundle;
}
