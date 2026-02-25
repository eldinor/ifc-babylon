import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine, Scene } from "@babylonjs/core";
import { buildIfcModel } from "../ifcModel";
import type { RawIfcModel, RawGeometryPart } from "../ifcInit";

/**
 * Create a mock geometry part with specific colorId
 */
function createMockPart(colorId: number, expressID: number = 100): RawGeometryPart {
  return {
    expressID,
    geometryExpressID: 200,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    flatTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    color: { x: 0.8, y: 0.8, z: 0.8, w: 1 },
    colorId,
  };
}

/**
 * Create a mock RawIfcModel with multiple parts
 */
function createMockModel(parts: RawGeometryPart[]): RawIfcModel {
  return {
    modelID: 1,
    parts,
    rawStats: {
      partCount: parts.length,
      vertexCount: parts.reduce((sum, p) => sum + p.positions.length / 3, 0),
      triangleCount: parts.reduce((sum, p) => sum + p.indices.length / 3, 0),
    },
  };
}

function getMaterialZOffset(material: unknown): number {
  if (!material || typeof material !== "object" || !("zOffset" in material)) {
    throw new Error("Material does not expose zOffset");
  }
  const value = (material as { zOffset: unknown }).zOffset;
  if (typeof value !== "number") {
    throw new Error("Material zOffset is not a number");
  }
  return value;
}

describe("z-offset cycling", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it("should cycle z-offset values between 0 and 1.0", () => {
    // Create 25 parts with different colorIds to test cycling
    const parts = Array.from({ length: 25 }, (_, i) => createMockPart(i, 100 + i));
    const model = createMockModel(parts);

    const result = buildIfcModel(model, scene, { verbose: false });

    // Get all materials and their z-offset values
    const materials = scene.materials.filter((m) => m.name.startsWith("ifc-material-"));
    const zOffsets = materials.map((m) => getMaterialZOffset(m));

    // All z-offsets should be between 0 and 1.0 (exclusive)
    zOffsets.forEach((zOffset) => {
      expect(zOffset).toBeGreaterThanOrEqual(0);
      expect(zOffset).toBeLessThan(1.0);
    });

    // Should have 25 different materials with different z-offsets
    expect(materials.length).toBe(25);
    expect(new Set(zOffsets).size).toBe(25); // All should be unique
  });

  it("should reset z-offset for each new model build", () => {
    // Build first model
    const parts1 = [createMockPart(1), createMockPart(2)];
    const model1 = createMockModel(parts1);
    const result1 = buildIfcModel(model1, scene, { verbose: false });

    const material1 = scene.materials.find((m) => m.name === "ifc-material-1");
    const material2 = scene.materials.find((m) => m.name === "ifc-material-2");

    expect(material1).toBeDefined();
    expect(material2).toBeDefined();

    const zOffset1 = getMaterialZOffset(material1);
    const zOffset2 = getMaterialZOffset(material2);

    // Build second model - should start from 0 again
    disposeSceneMaterials(scene);

    const parts2 = [createMockPart(3), createMockPart(4)];
    const model2 = createMockModel(parts2);
    const result2 = buildIfcModel(model2, scene, { verbose: false });

    const material3 = scene.materials.find((m) => m.name === "ifc-material-3");
    const material4 = scene.materials.find((m) => m.name === "ifc-material-4");

    expect(material3).toBeDefined();
    expect(material4).toBeDefined();

    const zOffset3 = getMaterialZOffset(material3);
    const zOffset4 = getMaterialZOffset(material4);

    // First material of new model should start near 0
    expect(zOffset3).toBeCloseTo(0, 2);
    // Second material should be 0.05
    expect(zOffset4).toBeCloseTo(0.05, 2);
  });

  it("should use 0.05 increment for z-offset", () => {
    const parts = Array.from({ length: 5 }, (_, i) => createMockPart(i));
    const model = createMockModel(parts);

    const result = buildIfcModel(model, scene, { verbose: false });

    const materials = scene.materials.filter((m) => m.name.startsWith("ifc-material-"));
    const zOffsets = materials.map((m) => getMaterialZOffset(m)).sort((a, b) => a - b);

    // Should be: 0, 0.05, 0.10, 0.15, 0.20
    expect(zOffsets[0]).toBeCloseTo(0, 2);
    expect(zOffsets[1]).toBeCloseTo(0.05, 2);
    expect(zOffsets[2]).toBeCloseTo(0.1, 2);
    expect(zOffsets[3]).toBeCloseTo(0.15, 2);
    expect(zOffsets[4]).toBeCloseTo(0.2, 2);
  });

  it("should cycle back to 0 after reaching 1.0", () => {
    // Create 21 parts to test cycling (20 * 0.05 = 1.0, so 21st should cycle back)
    const parts = Array.from({ length: 21 }, (_, i) => createMockPart(i));
    const model = createMockModel(parts);

    const result = buildIfcModel(model, scene, { verbose: false });

    const materials = scene.materials.filter((m) => m.name.startsWith("ifc-material-"));
    const zOffsets = materials.map((m) => getMaterialZOffset(m));

    // 21st material should cycle back to 0 (since 20 * 0.05 = 1.0, and 1.0 % 1.0 = 0)
    expect(zOffsets[20]).toBeCloseTo(0, 2);
  });
});

/**
 * Helper function to dispose materials for testing
 */
function disposeSceneMaterials(scene: Scene): void {
  scene.materials.forEach((material) => {
    if (material.name.startsWith("ifc-material-")) {
      material.dispose();
    }
  });
}
