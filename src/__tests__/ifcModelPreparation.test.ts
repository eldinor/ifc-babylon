import { describe, it, expect } from "vitest";
import { prepareIfcModelGeometry } from "../ifcModelPreparation";
import type { RawGeometryPart, RawIfcModel } from "../ifcInit";

function createPart(overrides: Partial<RawGeometryPart> = {}): RawGeometryPart {
  return {
    expressID: 100,
    geometryExpressID: 200,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    flatTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    color: { x: 0.8, y: 0.8, z: 0.8, w: 1 },
    colorId: 1,
    ...overrides,
  };
}

function createModel(parts: RawGeometryPart[]): RawIfcModel {
  return {
    modelID: 1,
    parts,
    rawStats: {
      partCount: parts.length,
      vertexCount: parts.reduce((sum, part) => sum + part.positions.length / 3, 0),
      triangleCount: parts.reduce((sum, part) => sum + part.indices.length / 3, 0),
    },
  };
}

describe("prepareIfcModelGeometry", () => {
  it("should resolve low/medium/high tiers from autoMergeStrategy thresholds", () => {
    const low = prepareIfcModelGeometry(createModel([createPart(), createPart({ expressID: 101 })]), {
      autoMergeStrategy: { lowMaxParts: 2, mediumMaxParts: 4 },
    });
    const medium = prepareIfcModelGeometry(
      createModel([
        createPart(),
        createPart({ expressID: 101 }),
        createPart({ expressID: 102 }),
        createPart({ expressID: 103 }),
      ]),
      { autoMergeStrategy: { lowMaxParts: 2, mediumMaxParts: 4 } },
    );
    const high = prepareIfcModelGeometry(
      createModel([
        createPart(),
        createPart({ expressID: 101 }),
        createPart({ expressID: 102 }),
        createPart({ expressID: 103 }),
        createPart({ expressID: 104 }),
      ]),
      { autoMergeStrategy: { lowMaxParts: 2, mediumMaxParts: 4 } },
    );

    expect(low.telemetry.tier).toBe("low");
    expect(low.mergeMode).toBe("by-express-color");
    expect(medium.telemetry.tier).toBe("medium");
    expect(medium.mergeMode).toBe("by-color");
    expect(high.telemetry.tier).toBe("high");
    expect(high.mergeMode).toBe("two-material");
  });

  it("should use renderOnly profile as two-material tier", () => {
    const model = createModel([
      createPart({ expressID: 100, color: { x: 1, y: 0, z: 0, w: 1 }, colorId: 11 }),
      createPart({ expressID: 101, color: { x: 0, y: 1, z: 0, w: 0.5 }, colorId: 12 }),
    ]);

    const prepared = prepareIfcModelGeometry(model, {
      profile: "renderOnly",
      mergeMode: "none",
    });

    expect(prepared.mergeMode).toBe("two-material");
    expect(prepared.telemetry.tier).toBe("renderOnly");
    expect(prepared.telemetry.transferBytes).toBe(0);
  });

  it("should merge by two-material into opaque and transparent groups", () => {
    const model = createModel([
      createPart({ expressID: 100, color: { x: 1, y: 0, z: 0, w: 1 }, colorId: 10 }),
      createPart({ expressID: 101, color: { x: 0, y: 1, z: 0, w: 1 }, colorId: 11 }),
      createPart({ expressID: 102, color: { x: 0, y: 0, z: 1, w: 0.6 }, colorId: 12 }),
    ]);

    const prepared = prepareIfcModelGeometry(model, { mergeMode: "two-material" });

    expect(prepared.meshes.length).toBe(2);
    expect(prepared.telemetry.opaqueMeshCount).toBe(1);
    expect(prepared.telemetry.transparentMeshCount).toBe(1);
  });

  it("should omit element ranges when includeElementMap is false", () => {
    const model = createModel([createPart(), createPart({ expressID: 101 })]);
    const prepared = prepareIfcModelGeometry(model, {
      mergeMode: "by-color",
      includeElementMap: false,
    });

    expect(prepared.telemetry.includeElementMap).toBe(false);
    expect(prepared.telemetry.elementRangeCount).toBe(0);
    expect(prepared.telemetry.elementMapBytes).toBe(0);
    expect(prepared.meshes.every((mesh) => mesh.elementRanges === undefined)).toBe(true);
  });

  it("should include element ranges and byte accounting when includeElementMap is true", () => {
    const model = createModel([
      createPart({ expressID: 100, colorId: 5 }),
      createPart({ expressID: 101, colorId: 5 }),
    ]);
    const prepared = prepareIfcModelGeometry(model, {
      mergeMode: "by-color",
      includeElementMap: true,
    });

    expect(prepared.meshes).toHaveLength(1);
    expect(prepared.meshes[0].expressID).toBe(-1);
    expect(prepared.meshes[0].elementRanges).toBeDefined();
    expect((prepared.meshes[0].elementRanges ?? []).length).toBe(2);
    expect(prepared.telemetry.elementRangeCount).toBe(2);
    expect(prepared.telemetry.elementMapBytes).toBe(prepared.telemetry.elementRangeCount * 12);
  });
});
