import { describe, it, expect } from "vitest";
import { NullEngine, Scene } from "@babylonjs/core";
import { buildIfcModel } from "../ifcModel";
import type { RawGeometryPart, RawIfcModel } from "../ifcInit";

function createSyntheticPart(index: number): RawGeometryPart {
  const x = index * 2;
  return {
    expressID: index + 1,
    geometryExpressID: index + 10_000,
    // Two triangles (quad), translated by index to avoid degenerate overlap.
    positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x, 1, 0, x + 1, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    flatTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    color: { x: 0.8, y: 0.8, z: 0.8, w: 1 },
    colorId: 1,
  };
}

function createSyntheticModel(partCount: number): RawIfcModel {
  const parts: RawGeometryPart[] = Array.from({ length: partCount }, (_, i) => createSyntheticPart(i));
  return {
    modelID: 1,
    parts,
    rawStats: {
      partCount,
      vertexCount: partCount * 4,
      triangleCount: partCount * 2,
    },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureBuildMs(engine: NullEngine, partCount: number, runs = 3): number {
  const timings: number[] = [];
  for (let i = 0; i < runs; i++) {
    const scene = new Scene(engine);
    const model = createSyntheticModel(partCount);
    const start = performance.now();
    buildIfcModel(model, scene, {
      verbose: false,
      mergeMeshes: false,
      autoCenter: false,
      freezeAfterBuild: false,
      releaseRawPartsAfterBuild: true,
    });
    timings.push(performance.now() - start);
    scene.dispose();
  }
  return median(timings);
}

describe("buildIfcModel perf regressions", () => {
  it("should scale near-linearly when part count doubles", () => {
    const engine = new NullEngine();
    try {
      // Warm up JIT / Babylon internals before timing.
      measureBuildMs(engine, 200, 2);

      const tSmall = measureBuildMs(engine, 800, 3);
      const tLarge = measureBuildMs(engine, 1600, 3);
      const ratio = tLarge / tSmall;

      // Guard against severe nonlinear regressions (upper bound only to avoid timing noise).
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(3.0);
    } finally {
      engine.dispose();
    }
  });

  it("should keep repeated build timings reasonably stable", () => {
    const engine = new NullEngine();
    try {
      measureBuildMs(engine, 200, 2);

      const runA = measureBuildMs(engine, 1200, 1);
      const runB = measureBuildMs(engine, 1200, 1);
      const runC = measureBuildMs(engine, 1200, 1);
      const min = Math.min(runA, runB, runC);
      const max = Math.max(runA, runB, runC);

      // Catch major regressions/jitter from accidental heavy work in the hot path.
      expect(max / min).toBeLessThan(2.5);
    } finally {
      engine.dispose();
    }
  });
});
