import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NullEngine, Scene, Vector3, Color3, StandardMaterial, PBRMaterial } from "@babylonjs/core";
import {
  buildIfcModel,
  disposeIfcModel,
  getModelBounds,
  centerModelAtOrigin,
  DEFAULT_IFC_MATERIAL_GRAY,
  DEFAULT_PBR_ROUGHNESS,
} from "../ifcModel";
import type { RawIfcModel, RawGeometryPart } from "../ifcInit";

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a simple mock geometry part
 */
function createMockPart(overrides: Partial<RawGeometryPart> = {}): RawGeometryPart {
  return {
    expressID: 100,
    geometryExpressID: 200,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), // triangle
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    flatTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], // identity
    color: { x: 0.8, y: 0.8, z: 0.8, w: 1 },
    colorId: 1,
    ...overrides,
  };
}

/**
 * Create a mock RawIfcModel
 */
function createMockModel(parts: RawGeometryPart[] = [createMockPart()]): RawIfcModel {
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

// ============================================================================
// TESTS
// ============================================================================

describe("buildIfcModel", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    // Create Babylon.js NullEngine for testing (no WebGL required)
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    // Clean up Babylon.js resources
    scene.dispose();
    engine.dispose();
  });

  // ==========================================================================
  // buildIfcModel Tests
  // ==========================================================================

  describe("buildIfcModel", () => {
    it("should build a scene from raw IFC model data", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result).toBeDefined();
      expect(result.meshes).toBeDefined();
      expect(result.rootNode).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it("should create meshes from raw parts", () => {
      const model = createMockModel([createMockPart(), createMockPart({ expressID: 101 })]);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.meshes.length).toBeGreaterThan(0);
    });

    it("should create a root transform node named 'ifc-root'", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.rootNode.name).toBe("ifc-root");
    });

    it("should apply Z-axis flip for coordinate system conversion", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false });

      // Z-axis flip is applied via scaling
      expect(result.rootNode.scaling.z).toBe(-1);
    });

    it("should return correct build statistics", () => {
      const parts = [
        createMockPart({ expressID: 100, colorId: 1 }),
        createMockPart({ expressID: 100, colorId: 1 }), // Same expressID and colorId - can merge
      ];
      const model = createMockModel(parts);

      const result = buildIfcModel(model, scene, { verbose: false, mergeMeshes: true });

      expect(result.stats.originalPartCount).toBe(2);
      expect(result.stats.finalMeshCount).toBeGreaterThanOrEqual(1);
      expect(result.stats.buildTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should create materials for different colors", () => {
      const parts = [
        createMockPart({ expressID: 100, colorId: 1, color: { x: 1, y: 0, z: 0, w: 1 } }),
        createMockPart({ expressID: 101, colorId: 2, color: { x: 0, y: 1, z: 0, w: 1 } }),
      ];
      const model = createMockModel(parts);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.stats.materialCount).toBe(2);
    });

    it("should reuse materials for same colorId", () => {
      const parts = [
        createMockPart({ expressID: 100, colorId: 1 }),
        createMockPart({ expressID: 101, colorId: 1 }), // Same colorId
      ];
      const model = createMockModel(parts);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.stats.materialCount).toBe(1);
    });

    it("should handle parts without color (use default gray)", () => {
      const part = createMockPart({ color: null, colorId: 0 });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.meshes.length).toBeGreaterThan(0);
      expect(result.meshes[0].material).toBeDefined();
    });

    it("should set metadata on meshes", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.meshes[0].metadata).toBeDefined();
      expect(result.meshes[0].metadata.expressID).toBeDefined();
      expect(result.meshes[0].metadata.modelID).toBe(1);
    });

    it("should set mesh parent to root node", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false });

      result.meshes.forEach((mesh) => {
        expect(mesh.parent).toBe(result.rootNode);
      });
    });
  });

  // ==========================================================================
  // Options Tests
  // ==========================================================================

  describe("buildIfcModel options", () => {
    it("should use default options when none provided", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene);

      expect(result).toBeDefined();
      // Default options: mergeMeshes=true, autoCenter=true, doubleSided=true
    });

    it("should respect mergeMeshes=false option", () => {
      const parts = [createMockPart({ expressID: 100, colorId: 1 }), createMockPart({ expressID: 100, colorId: 1 })];
      const model = createMockModel(parts);

      const result = buildIfcModel(model, scene, { mergeMeshes: false, verbose: false });

      // Without merging, should have 2 separate meshes
      expect(result.meshes.length).toBe(2);
    });

    it("should respect autoCenter=false option", () => {
      const part = createMockPart({
        positions: new Float32Array([100, 100, 100, 101, 100, 100, 100, 101, 100]),
      });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { autoCenter: false, verbose: false });

      // Root node position should not be modified
      expect(result.rootNode.position.x).toBe(0);
      expect(result.rootNode.position.y).toBe(0);
      expect(result.rootNode.position.z).toBe(0);
    });

    it("should respect doubleSided option for materials", () => {
      const model = createMockModel();

      buildIfcModel(model, scene, { doubleSided: true, verbose: false });

      const material = scene.materials[0] as StandardMaterial;
      expect(material).toBeDefined();
      // doubleSided=true means backFaceCulling=false
      expect(material.backFaceCulling).toBe(false);
    });

    it("should set backFaceCulling=true when doubleSided=false", () => {
      const model = createMockModel();

      buildIfcModel(model, scene, { doubleSided: false, verbose: false });

      const material = scene.materials[0] as StandardMaterial;
      expect(material.backFaceCulling).toBe(true);
    });

    it("should respect verbose option for logging", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const model = createMockModel();

      buildIfcModel(model, scene, { verbose: true });

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should suppress logging when verbose=false", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const model = createMockModel();

      buildIfcModel(model, scene, { verbose: false });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should respect freezeAfterBuild option", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { freezeAfterBuild: true, verbose: false });

      // Meshes should be frozen
      result.meshes.forEach((mesh) => {
        expect(mesh.isWorldMatrixFrozen).toBe(true);
      });
    });

    it("should not freeze meshes when freezeAfterBuild=false", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { freezeAfterBuild: false, verbose: false });

      // Meshes should not be frozen
      result.meshes.forEach((mesh) => {
        expect(mesh.isWorldMatrixFrozen).toBe(false);
      });
    });

    it("should release raw parts when releaseRawPartsAfterBuild=true", () => {
      const model = createMockModel([createMockPart(), createMockPart({ expressID: 101 })]);

      const result = buildIfcModel(model, scene, { releaseRawPartsAfterBuild: true, verbose: false });

      expect(result.meshes.length).toBeGreaterThan(0);
      expect(model.parts).toHaveLength(0);
    });

    it("should keep raw parts when releaseRawPartsAfterBuild=false", () => {
      const model = createMockModel([createMockPart(), createMockPart({ expressID: 101 })]);

      buildIfcModel(model, scene, { verbose: false, releaseRawPartsAfterBuild: false });

      expect(model.parts).toHaveLength(2);
    });
  });

  // ==========================================================================
  // getModelBounds Tests
  // ==========================================================================

  describe("getModelBounds", () => {
    it("should return null for empty mesh array", () => {
      const bounds = getModelBounds([]);

      expect(bounds).toBeNull();
    });

    it("should calculate bounds for meshes", () => {
      const model = createMockModel();
      const result = buildIfcModel(model, scene, { verbose: false, autoCenter: false });

      const bounds = getModelBounds(result.meshes);

      expect(bounds).not.toBeNull();
      expect(bounds!.min).toBeInstanceOf(Vector3);
      expect(bounds!.max).toBeInstanceOf(Vector3);
      expect(bounds!.center).toBeInstanceOf(Vector3);
      expect(bounds!.size).toBeInstanceOf(Vector3);
      expect(bounds!.diagonal).toBeGreaterThan(0);
    });

    it("should calculate correct center", () => {
      const part = createMockPart({
        positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0, 2, 2, 0]), // square from (0,0,0) to (2,2,0)
        indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
      });
      const model = createMockModel([part]);
      const result = buildIfcModel(model, scene, { verbose: false, autoCenter: false });

      const bounds = getModelBounds(result.meshes);

      // Center should be approximately (1, 1, 0) after Z-flip
      expect(bounds!.center.x).toBeCloseTo(1, 1);
      expect(bounds!.center.y).toBeCloseTo(1, 1);
    });

    it("should calculate correct size", () => {
      const part = createMockPart({
        positions: new Float32Array([0, 0, 0, 4, 0, 0, 0, 3, 0, 4, 3, 0]), // 4x3 rectangle
        indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
      });
      const model = createMockModel([part]);
      const result = buildIfcModel(model, scene, { verbose: false, autoCenter: false });

      const bounds = getModelBounds(result.meshes);

      expect(bounds!.size.x).toBeCloseTo(4, 1);
      expect(bounds!.size.y).toBeCloseTo(3, 1);
    });

    it("should calculate correct diagonal", () => {
      const part = createMockPart({
        positions: new Float32Array([0, 0, 0, 3, 4, 0, 0, 0, 0]), // triangle with diagonal 5 (3-4-5)
        indices: new Uint32Array([0, 1, 2]),
      });
      const model = createMockModel([part]);
      const result = buildIfcModel(model, scene, { verbose: false, autoCenter: false });

      const bounds = getModelBounds(result.meshes);

      // Diagonal should be sqrt(3^2 + 4^2) = 5
      expect(bounds!.diagonal).toBeCloseTo(5, 1);
    });

    it("should skip invisible meshes", () => {
      const model = createMockModel();
      const result = buildIfcModel(model, scene, { verbose: false });

      // Hide all meshes
      result.meshes.forEach((mesh) => {
        mesh.isVisible = false;
      });

      const bounds = getModelBounds(result.meshes);

      expect(bounds).toBeNull();
    });
  });

  // ==========================================================================
  // centerModelAtOrigin Tests
  // ==========================================================================

  describe("centerModelAtOrigin", () => {
    it("should return zero vector for empty mesh array", () => {
      const offset = centerModelAtOrigin([]);

      expect(offset.x).toBe(0);
      expect(offset.y).toBe(0);
      expect(offset.z).toBe(0);
    });

    it("should center meshes at origin", () => {
      const part = createMockPart({
        positions: new Float32Array([10, 10, 10, 12, 10, 10, 10, 12, 10]),
      });
      const model = createMockModel([part]);
      const result = buildIfcModel(model, scene, { verbose: false, autoCenter: false });

      const offset = centerModelAtOrigin(result.meshes);

      expect(offset.x).toBeCloseTo(11, 1);
      expect(offset.y).toBeCloseTo(11, 1);
    });

    it("should center using root node when provided", () => {
      const part = createMockPart({
        positions: new Float32Array([10, 10, 10, 12, 10, 10, 10, 12, 10]),
      });
      const model = createMockModel([part]);
      const result = buildIfcModel(model, scene, { verbose: false, autoCenter: false });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const offset = centerModelAtOrigin(result.meshes, result.rootNode);
      consoleSpy.mockRestore();

      expect(offset.x).toBeCloseTo(11, 1);
      // Root node position should be negated to center the model
      expect(result.rootNode.position.x).toBeCloseTo(-11, 1);
    });

    it("should log offset when centering", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const model = createMockModel();
      const result = buildIfcModel(model, scene, { verbose: false, autoCenter: false });

      centerModelAtOrigin(result.meshes);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Model centered at origin"));

      consoleSpy.mockRestore();
    });
  });

  // ==========================================================================
  // disposeIfcModel Tests
  // ==========================================================================

  describe("disposeIfcModel", () => {
    it("should dispose IFC materials", () => {
      const model = createMockModel();
      buildIfcModel(model, scene, { verbose: false });

      const materialCount = scene.materials.length;
      expect(materialCount).toBeGreaterThan(0);

      disposeIfcModel(scene);

      // IFC materials should be disposed
      const ifcMaterials = scene.materials.filter((m) => m.name.startsWith("ifc-material-"));
      expect(ifcMaterials.length).toBe(0);
    });

    it("should dispose ifc-root node", () => {
      const model = createMockModel();
      buildIfcModel(model, scene, { verbose: false });

      const rootNode = scene.getTransformNodeByName("ifc-root");
      expect(rootNode).toBeDefined();

      disposeIfcModel(scene);

      const rootNodeAfter = scene.getTransformNodeByName("ifc-root");
      expect(rootNodeAfter).toBeNull();
    });

    it("should handle empty scene gracefully", () => {
      // Should not throw
      expect(() => disposeIfcModel(scene)).not.toThrow();
    });

    it("should log disposal", () => {
      const model = createMockModel();
      buildIfcModel(model, scene, { verbose: false });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      disposeIfcModel(scene);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("ifc-root node"));

      consoleSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Transform Tests
  // ==========================================================================

  describe("transform handling", () => {
    it("should apply flatTransform to mesh vertices", () => {
      // Create a part with a translation transform
      const translatedPart = createMockPart({
        flatTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1], // translate by (10, 20, 30)
      });
      const model = createMockModel([translatedPart]);

      const result = buildIfcModel(model, scene, { verbose: false, autoCenter: false });

      // The transform should be baked into vertices
      expect(result.meshes.length).toBeGreaterThan(0);
    });

    it("should handle identity transform", () => {
      const part = createMockPart({
        flatTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.meshes.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle empty parts array", () => {
      const model = createMockModel([]);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.meshes.length).toBe(0);
      expect(result.stats.originalPartCount).toBe(0);
    });

    it("should handle single part", () => {
      const model = createMockModel([createMockPart()]);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.meshes.length).toBe(1);
    });

    it("should skip invalid parts with out-of-range indices", () => {
      const invalidPart = createMockPart({
        indices: new Uint32Array([0, 1, 99]),
      });
      const model = createMockModel([invalidPart]);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.meshes.length).toBe(0);
    });

    it("should handle parts with zero normals (generateNormals option)", () => {
      const part = createMockPart({
        normals: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false, generateNormals: true });

      expect(result.meshes.length).toBeGreaterThan(0);
    });

    it("should handle large coordinates", () => {
      const part = createMockPart({
        positions: new Float32Array([1000000, 2000000, 3000000, 1000001, 2000000, 3000000, 1000000, 2000001, 3000000]),
      });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false });

      expect(result.meshes.length).toBeGreaterThan(0);
    });

    it("should handle transparent materials (alpha < 1)", () => {
      const part = createMockPart({
        color: { x: 1, y: 0, z: 0, w: 0.5 }, // 50% transparent
        colorId: 100,
      });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false });

      const material = result.meshes[0].material as StandardMaterial;
      expect(material).toBeDefined();
      expect(material.alpha).toBe(0.5);
    });

    it("should handle multiple parts with same expressID but different colors", () => {
      const parts = [
        createMockPart({ expressID: 100, colorId: 1, color: { x: 1, y: 0, z: 0, w: 1 } }),
        createMockPart({ expressID: 100, colorId: 2, color: { x: 0, y: 1, z: 0, w: 1 } }),
      ];
      const model = createMockModel(parts);

      const result = buildIfcModel(model, scene, { verbose: false });

      // Should create separate meshes for different colors
      expect(result.stats.materialCount).toBe(2);
    });
  });

  // ==========================================================================
  // Material Tests
  // ==========================================================================

  describe("material creation", () => {
    it("should create StandardMaterial with correct diffuse color", () => {
      const part = createMockPart({
        color: { x: 0.5, y: 0.6, z: 0.7, w: 1 },
        colorId: 42,
      });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false });

      const material = result.meshes[0].material;
      const standardMaterial = material as StandardMaterial;
      expect(standardMaterial).toBeDefined();
      expect(standardMaterial.diffuseColor).toBeInstanceOf(Color3);
      expect(standardMaterial.diffuseColor.r).toBeCloseTo(0.5, 2);
      expect(standardMaterial.diffuseColor.g).toBeCloseTo(0.6, 2);
      expect(standardMaterial.diffuseColor.b).toBeCloseTo(0.7, 2);
    });

    it("should set z-offset on materials to prevent z-fighting", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false });

      const material = result.meshes[0].material as StandardMaterial;
      expect(material.zOffset).toBeDefined();
    });

    it("should name materials with pattern 'ifc-material-{colorId}'", () => {
      const part = createMockPart({ colorId: 123 });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false });

      const material = result.meshes[0].material;
      expect(material!.name).toBe("ifc-material-123");
    });
  });

  // ==========================================================================
  // PBR Material Tests
  // ==========================================================================

  describe("PBR materials", () => {
    it("should create StandardMaterial by default (usePBRMaterials=false)", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: false });

      const material = result.meshes[0].material;
      expect(material).toBeInstanceOf(StandardMaterial);
    });

    it("should create StandardMaterial by default (option not specified)", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false });

      const material = result.meshes[0].material;
      expect(material).toBeInstanceOf(StandardMaterial);
    });

    it("should create PBRMaterial when usePBRMaterials=true", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true });

      const material = result.meshes[0].material;
      expect(material).toBeInstanceOf(PBRMaterial);
    });

    it("should set albedoColor on PBR material", () => {
      const part = createMockPart({
        color: { x: 0.5, y: 0.6, z: 0.7, w: 1 },
        colorId: 42,
      });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true });

      const material = result.meshes[0].material as PBRMaterial;
      expect(material.albedoColor).toBeInstanceOf(Color3);
      expect(material.albedoColor.r).toBeCloseTo(0.5, 2);
      expect(material.albedoColor.g).toBeCloseTo(0.6, 2);
      expect(material.albedoColor.b).toBeCloseTo(0.7, 2);
    });

    it("should set alpha on PBR material", () => {
      const part = createMockPart({
        color: { x: 1, y: 0, z: 0, w: 0.5 },
        colorId: 100,
      });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true });

      const material = result.meshes[0].material as PBRMaterial;
      expect(material.alpha).toBe(0.5);
    });

    it("should set metallic=0 and roughness=0.7 on PBR material for building materials", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true });

      const material = result.meshes[0].material as PBRMaterial;
      expect(material.metallic).toBe(0);
      expect(material.roughness).toBe(DEFAULT_PBR_ROUGHNESS);
    });

    it("should set backFaceCulling on PBR material based on doubleSided option", () => {
      const model = createMockModel();

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true, doubleSided: true });

      const material = result.meshes[0].material as PBRMaterial;
      expect(material.backFaceCulling).toBe(false);
    });

    it("should not overwrite existing environmentTexture when usePBRMaterials=true", () => {
      const model = createMockModel();

      // Create a mock environment texture (using a simple texture as placeholder)
      scene.createDefaultEnvironment();
      const originalTexture = scene.environmentTexture;
      expect(originalTexture).not.toBeNull();

      buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true });

      // The environment texture should remain the same
      expect(scene.environmentTexture).toBe(originalTexture);
    });

    it("should handle default gray color for PBR material when color is null", () => {
      const part = createMockPart({ color: null, colorId: 0 });
      const model = createMockModel([part]);

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true });

      const material = result.meshes[0].material as PBRMaterial;
      expect(material.albedoColor.r).toBeCloseTo(DEFAULT_IFC_MATERIAL_GRAY, 1);
      expect(material.albedoColor.g).toBeCloseTo(DEFAULT_IFC_MATERIAL_GRAY, 1);
      expect(material.albedoColor.b).toBeCloseTo(DEFAULT_IFC_MATERIAL_GRAY, 1);
    });

    it("should reuse PBR materials for same colorId", () => {
      const parts = [
        createMockPart({ expressID: 100, colorId: 1 }),
        createMockPart({ expressID: 101, colorId: 1 }), // Same colorId
      ];
      const model = createMockModel(parts);

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true });

      expect(result.stats.materialCount).toBe(1);
      expect(result.meshes[0].material).toBe(result.meshes[1].material);
    });

    it("should create multiple PBR materials for different colorIds", () => {
      const parts = [
        createMockPart({ expressID: 100, colorId: 1, color: { x: 1, y: 0, z: 0, w: 1 } }),
        createMockPart({ expressID: 101, colorId: 2, color: { x: 0, y: 1, z: 0, w: 1 } }),
      ];
      const model = createMockModel(parts);

      const result = buildIfcModel(model, scene, { verbose: false, usePBRMaterials: true });

      expect(result.stats.materialCount).toBe(2);
      expect(result.meshes[0].material).not.toBe(result.meshes[1].material);
    });
  });
});
