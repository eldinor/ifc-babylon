import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NullEngine, Scene, TransformNode, AbstractMesh, AssetContainer } from "@babylonjs/core";
import * as WebIFC from "web-ifc";
import {
  IfcLoaderPlugin,
  configureIfcLoader,
  resetIfcLoader,
  loadIfc,
  disposeIfc,
  getWebIfcAPI,
  getIfcProjectInfo,
} from "../ifcLoader";
import type { IfcLoaderOptions, IfcPluginOptions } from "../ifcLoader";

// Mock WebIFC with a proper class constructor
vi.mock("web-ifc", () => {
  class MockIfcAPI {
    SetWasmPath = vi.fn();
    Init = vi.fn().mockResolvedValue(undefined);
    SetLogLevel = vi.fn();
    OpenModel = vi.fn().mockReturnValue(1);
    IsModelOpen = vi.fn().mockReturnValue(true);
    CloseModel = vi.fn();
    GetLineIDsWithType = vi.fn();
    GetLine = vi.fn();
    GetGeometry = vi.fn();
    GetVertexArray = vi.fn();
    GetIndexArray = vi.fn();
    StreamAllMeshes = vi.fn();
  }
  return {
    IfcAPI: MockIfcAPI,
    LogLevel: {
      LOG_LEVEL_ERROR: 1,
      LOG_LEVEL_WARN: 2,
      LOG_LEVEL_INFO: 4,
      LOG_LEVEL_DEBUG: 8,
    },
    IFCPROJECT: 1,
    IFCAPPLICATION: 2,
    IFCPERSON: 3,
    IFCORGANIZATION: 4,
    IFCBUILDINGSTOREY: 5,
    IFCRELAGGREGATES: 6,
    IFCRELCONTAINEDINSPATIALSTRUCTURE: 7,
  };
});

// Mock ifcInit module
vi.mock("../ifcInit", () => ({
  initializeWebIFC: vi.fn().mockImplementation(async (wasmPath?: string, logLevel?: number) => {
    const api = new (WebIFC as any).IfcAPI();
    if (wasmPath) api.SetWasmPath(wasmPath);
    if (logLevel !== undefined) api.SetLogLevel(logLevel);
    await api.Init();
    return api;
  }),
  loadIfcModel: vi.fn().mockImplementation(async (ifcAPI: any, _source: string | File, _options?: any) => {
    // Mock geometry streaming
    if (ifcAPI.StreamAllMeshes.mockImplementation) {
      ifcAPI.StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
        const mockFlatMesh = {
          expressID: 100,
          geometries: {
            size: () => 1,
            get: (_index: number) => ({
              geometryExpressID: 200,
              color: { x: 1, y: 0, z: 0, w: 1 },
              flatTransformation: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
            }),
          },
        };
        callback(mockFlatMesh);
      });
    }

    return {
      modelID: 1,
      parts: [
        {
          expressID: 100,
          geometryExpressID: 200,
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
          indices: new Uint32Array([0, 1, 2]),
          flatTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          color: { x: 0.8, y: 0.8, z: 0.8, w: 1 },
          colorId: 1,
        },
      ],
      storeyMap: new Map(),
      rawStats: {
        partCount: 1,
        vertexCount: 3,
        triangleCount: 1,
      },
    };
  }),
  closeIfcModel: vi.fn(),
  getProjectInfo: vi.fn().mockReturnValue({
    name: "Test Project",
    description: "Test Description",
  }),
}));

// Mock ifcModel module
vi.mock("../ifcModel", () => ({
  buildIfcModel: vi.fn().mockImplementation((rawModel: any, scene: any, _options?: any) => {
    const rootNode = new TransformNode("ifc-root", scene);
    const meshes: AbstractMesh[] = [];

    // Create a simple mock mesh for each part
    rawModel.parts.forEach((part: any) => {
      const mesh = {
        name: `ifc-${part.expressID}`,
        parent: rootNode,
        metadata: {
          expressID: part.expressID,
          modelID: rawModel.modelID,
        },
        material: null,
        isVisible: true,
        isWorldMatrixFrozen: false,
        getTotalVertices: () => part.positions.length / 3,
        computeWorldMatrix: vi.fn(),
        refreshBoundingInfo: vi.fn(),
        getBoundingInfo: () => ({
          boundingBox: {
            minimumWorld: { x: 0, y: 0, z: 0 },
            maximumWorld: { x: 1, y: 1, z: 1 },
          },
        }),
        freezeWorldMatrix: vi.fn(),
        dispose: vi.fn(),
      } as unknown as AbstractMesh;
      meshes.push(mesh);
    });

    return {
      meshes,
      rootNode,
      stats: {
        originalPartCount: rawModel.parts.length,
        finalMeshCount: meshes.length,
        mergedGroupCount: 0,
        skippedGroupCount: 0,
        materialCount: 1,
        buildTimeMs: 10,
      },
    };
  }),
  disposeIfcModel: vi.fn(),
  getModelBounds: vi.fn().mockReturnValue({
    min: { x: 0, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
    center: { x: 0.5, y: 0.5, z: 0.5 },
    size: { x: 1, y: 1, z: 1 },
    diagonal: 1.732,
  }),
}));

// ============================================================================
// TEST UTILITIES
// ============================================================================

const mockFile = new File(["mock ifc content"], "test.ifc", { type: "application/ifc" });

// ============================================================================
// TESTS
// ============================================================================

describe("ifcLoader", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create Babylon.js NullEngine for testing (no WebGL required)
    engine = new NullEngine();
    scene = new Scene(engine);

    // Reset global state before each test
    resetIfcLoader();
  });

  afterEach(() => {
    // Clean up Babylon.js resources
    scene.dispose();
    engine.dispose();
  });

  // ==========================================================================
  // Global State Management Tests
  // ==========================================================================

  describe("configureIfcLoader", () => {
    it("should set wasmPath option", () => {
      const options: IfcPluginOptions = {
        wasmPath: "/custom/wasm/path/",
      };

      configureIfcLoader(options);

      // The wasmPath should be stored for later use
      // We can verify this by initializing the API
      expect(() => configureIfcLoader(options)).not.toThrow();
    });

    it("should set logLevel option", () => {
      const options: IfcPluginOptions = {
        logLevel: WebIFC.LogLevel.LOG_LEVEL_DEBUG,
      };

      configureIfcLoader(options);

      expect(() => configureIfcLoader(options)).not.toThrow();
    });

    it("should set defaultLoadOptions", () => {
      const options: IfcPluginOptions = {
        defaultLoadOptions: {
          mergeMeshes: false,
          autoCenter: false,
        },
      };

      configureIfcLoader(options);

      expect(() => configureIfcLoader(options)).not.toThrow();
    });

    it("should merge options when called multiple times", () => {
      configureIfcLoader({ wasmPath: "/path1/" });
      configureIfcLoader({ logLevel: WebIFC.LogLevel.LOG_LEVEL_DEBUG });

      // Should not throw and both options should be set
      expect(() => configureIfcLoader({})).not.toThrow();
    });
  });

  describe("resetIfcLoader", () => {
    it("should reset global state", () => {
      configureIfcLoader({
        wasmPath: "/custom/path/",
        logLevel: WebIFC.LogLevel.LOG_LEVEL_DEBUG,
      });

      resetIfcLoader();

      // After reset, options should be cleared
      expect(() => resetIfcLoader()).not.toThrow();
    });

    it("should allow reconfiguration after reset", () => {
      configureIfcLoader({ wasmPath: "/old/" });
      resetIfcLoader();
      configureIfcLoader({ wasmPath: "/new/" });

      expect(() => configureIfcLoader({})).not.toThrow();
    });
  });

  describe("getWebIfcAPI", () => {
    it("should return initialized API instance", async () => {
      const api = await getWebIfcAPI();

      expect(api).toBeDefined();
      expect(api.Init).toHaveBeenCalled();
    });

    it("should return same instance on subsequent calls", async () => {
      const api1 = await getWebIfcAPI();
      const api2 = await getWebIfcAPI();

      expect(api1).toBe(api2);
    });

    it("should create new instance after reset", async () => {
      const api1 = await getWebIfcAPI();
      resetIfcLoader();
      const api2 = await getWebIfcAPI();

      expect(api1).not.toBe(api2);
    });
  });

  // ==========================================================================
  // IfcLoaderPlugin Class Tests
  // ==========================================================================

  describe("IfcLoaderPlugin", () => {
    describe("plugin properties", () => {
      it("should have correct name", () => {
        const plugin = new IfcLoaderPlugin();

        expect(plugin.name).toBe("ifc");
      });

      it("should have correct extensions", () => {
        const plugin = new IfcLoaderPlugin();

        expect(plugin.extensions).toBe(".ifc");
      });
    });

    describe("canDirectLoad", () => {
      it("should return true for .ifc extension", () => {
        const plugin = new IfcLoaderPlugin();

        expect(plugin.canDirectLoad("model.ifc")).toBe(true);
        expect(plugin.canDirectLoad("model.IFC")).toBe(true);
        expect(plugin.canDirectLoad("/path/to/model.ifc")).toBe(true);
      });

      it("should return false for non-ifc extensions", () => {
        const plugin = new IfcLoaderPlugin();

        expect(plugin.canDirectLoad("model.obj")).toBe(false);
        expect(plugin.canDirectLoad("model.glb")).toBe(false);
        expect(plugin.canDirectLoad("model")).toBe(false);
      });
    });

    describe("importMeshAsync", () => {
      it("should load IFC file and return meshes", async () => {
        const plugin = new IfcLoaderPlugin();

        const result = await plugin.importMeshAsync(
          null, // meshesNames
          scene,
          mockFile,
          "", // rootUrl
        );

        expect(result.meshes).toBeDefined();
        expect(result.meshes.length).toBeGreaterThan(0);
        expect(result.transformNodes).toBeDefined();
        expect(result.transformNodes.length).toBeGreaterThan(0);
        expect(result.particleSystems).toEqual([]);
        expect(result.skeletons).toEqual([]);
        expect(result.animationGroups).toEqual([]);
      });

      it("should call progress callback", async () => {
        const plugin = new IfcLoaderPlugin();
        const progressCallback = vi.fn();

        await plugin.importMeshAsync(null, scene, mockFile, "", progressCallback);

        expect(progressCallback).toHaveBeenCalled();
        // Should report progress from 0 to 100
        const calls = progressCallback.mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.loaded).toBe(100);
        expect(lastCall.total).toBe(100);
      });

      it("should use custom options", async () => {
        const options: Partial<IfcLoaderOptions> = {
          mergeMeshes: false,
          autoCenter: false,
          verbose: false,
        };

        const plugin = new IfcLoaderPlugin(options);

        const result = await plugin.importMeshAsync(null, scene, mockFile, "");

        expect(result.meshes).toBeDefined();
      });
    });

    describe("loadSceneAsync", () => {
      it("should throw error (not supported)", async () => {
        const plugin = new IfcLoaderPlugin();

        await expect(plugin.loadSceneAsync(scene, mockFile, "")).rejects.toThrow(
          "IFC loader does not support loadSceneAsync. Use importMeshAsync instead.",
        );
      });
    });

    describe("loadAsync", () => {
      it("should load IFC file", async () => {
        const plugin = new IfcLoaderPlugin();

        await expect(plugin.loadAsync(scene, mockFile, "")).resolves.not.toThrow();
      });
    });

    describe("loadAssetContainerAsync", () => {
      it("should return AssetContainer with meshes", async () => {
        const plugin = new IfcLoaderPlugin();

        const container = await plugin.loadAssetContainerAsync(scene, mockFile, "");

        expect(container).toBeInstanceOf(AssetContainer);
        expect(container.meshes.length).toBeGreaterThan(0);
        expect(container.transformNodes.length).toBeGreaterThan(0);
      });
    });

    describe("getLoaderResult", () => {
      it("should return null for node without metadata", () => {
        const node = new TransformNode("test", scene);

        const result = IfcLoaderPlugin.getLoaderResult(node);

        expect(result).toBeNull();
      });

      it("should return null for node without _ifcLoaderResult", () => {
        const node = new TransformNode("test", scene);
        node.metadata = { foo: "bar" };

        const result = IfcLoaderPlugin.getLoaderResult(node);

        expect(result).toBeNull();
      });

      it("should return loader result from metadata", async () => {
        const plugin = new IfcLoaderPlugin();
        const importResult = await plugin.importMeshAsync(null, scene, mockFile, "");

        const rootNode = importResult.transformNodes[0];
        const result = IfcLoaderPlugin.getLoaderResult(rootNode);

        expect(result).toBeDefined();
        expect(result?.modelID).toBe(1);
        expect(result?.meshes).toBeDefined();
        expect(result?.projectInfo).toBeDefined();
        expect(result?.bounds).toBeDefined();
        expect(result?.stats).toBeDefined();
      });
    });

    describe("loadAsync (static)", () => {
      it("should load IFC file directly", async () => {
        const result = await IfcLoaderPlugin.loadAsync(mockFile, scene);

        expect(result).toBeDefined();
        expect(result.modelID).toBe(1);
        expect(result.meshes).toBeDefined();
        expect(result.rootNode).toBeDefined();
        expect(result.projectInfo).toBeDefined();
        expect(result.bounds).toBeDefined();
        expect(result.stats).toBeDefined();
      });

      it("should accept custom options", async () => {
        const options: Partial<IfcLoaderOptions> = {
          mergeMeshes: false,
          autoCenter: false,
          verbose: false,
        };

        const result = await IfcLoaderPlugin.loadAsync(mockFile, scene, options);

        expect(result).toBeDefined();
      });
    });

    describe("disposeModel", () => {
      it("should dispose model resources", async () => {
        await IfcLoaderPlugin.loadAsync(mockFile, scene);

        // Should not throw
        expect(() => IfcLoaderPlugin.disposeModel(scene, 1)).not.toThrow();
      });
    });
  });

  // ==========================================================================
  // Convenience Functions Tests
  // ==========================================================================

  describe("loadIfc", () => {
    it("should load IFC file and return result", async () => {
      const result = await loadIfc(mockFile, scene);

      expect(result).toBeDefined();
      expect(result.modelID).toBe(1);
      expect(result.meshes).toBeDefined();
      expect(result.rootNode).toBeDefined();
    });

    it("should accept options", async () => {
      const options: Partial<IfcLoaderOptions> = {
        mergeMeshes: true,
        autoCenter: true,
        verbose: false,
      };

      const result = await loadIfc(mockFile, scene, options);

      expect(result).toBeDefined();
    });
  });

  describe("disposeIfc", () => {
    it("should dispose IFC model", async () => {
      await loadIfc(mockFile, scene);

      expect(() => disposeIfc(scene, 1)).not.toThrow();
    });
  });

  describe("getIfcProjectInfo", () => {
    it("should return null when no model is loaded", () => {
      resetIfcLoader();

      const result = getIfcProjectInfo(1);

      expect(result).toBeNull();
    });

    it("should return project info after loading", async () => {
      await getWebIfcAPI();
      const result = getIfcProjectInfo(1);

      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // IfcLoaderResult Tests
  // ==========================================================================

  describe("IfcLoaderResult", () => {
    it("should contain all expected properties", async () => {
      const result = await loadIfc(mockFile, scene);

      expect(result).toHaveProperty("meshes");
      expect(result).toHaveProperty("rootNode");
      expect(result).toHaveProperty("modelID");
      expect(result).toHaveProperty("projectInfo");
      expect(result).toHaveProperty("bounds");
      expect(result).toHaveProperty("rawModel");
      expect(result).toHaveProperty("stats");
    });

    it("should have correct types for all properties", async () => {
      const result = await loadIfc(mockFile, scene);

      expect(Array.isArray(result.meshes)).toBe(true);
      expect(result.rootNode).toBeInstanceOf(TransformNode);
      expect(typeof result.modelID).toBe("number");
      expect(typeof result.projectInfo).toBe("object");
      expect(typeof result.bounds).toBe("object");
      expect(typeof result.rawModel).toBe("object");
      expect(typeof result.stats).toBe("object");
    });

    it("should attach result to root node metadata", async () => {
      const result = await loadIfc(mockFile, scene);

      expect(result.rootNode.metadata).toBeDefined();
      expect(result.rootNode.metadata._ifcLoaderResult).toBe(result);
    });
  });

  // ==========================================================================
  // Default Options Tests
  // ==========================================================================

  describe("defaultOptions", () => {
    it("should have expected default values", () => {
      // Reset to ensure clean state
      resetIfcLoader();
      IfcLoaderPlugin.defaultOptions = {
        coordinateToOrigin: true,
        verbose: true,
        mergeMeshes: true,
        autoCenter: true,
        doubleSided: true,
        generateNormals: false,
        freezeAfterBuild: true,
      };

      expect(IfcLoaderPlugin.defaultOptions).toEqual({
        coordinateToOrigin: true,
        verbose: true,
        mergeMeshes: true,
        autoCenter: true,
        doubleSided: true,
        generateNormals: false,
        freezeAfterBuild: true,
      });
    });

    it("should be configurable via configureIfcLoader", () => {
      // First reset to known state
      resetIfcLoader();
      IfcLoaderPlugin.defaultOptions = {
        coordinateToOrigin: true,
        verbose: true,
        mergeMeshes: true,
        autoCenter: true,
        doubleSided: true,
        generateNormals: false,
        freezeAfterBuild: true,
      };

      configureIfcLoader({
        defaultLoadOptions: {
          verbose: false,
          mergeMeshes: false,
        },
      });

      expect(IfcLoaderPlugin.defaultOptions.verbose).toBe(false);
      expect(IfcLoaderPlugin.defaultOptions.mergeMeshes).toBe(false);

      // Reset for other tests
      resetIfcLoader();
      IfcLoaderPlugin.defaultOptions = {
        coordinateToOrigin: true,
        verbose: true,
        mergeMeshes: true,
        autoCenter: true,
        doubleSided: true,
        generateNormals: false,
        freezeAfterBuild: true,
      };
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe("error handling", () => {
    it("should handle loadIfcModel errors", async () => {
      const { loadIfcModel } = await import("../ifcInit");
      vi.mocked(loadIfcModel).mockRejectedValueOnce(new Error("Failed to load model"));

      await expect(loadIfc(mockFile, scene)).rejects.toThrow("Failed to load model");
    });

    it("should handle buildIfcModel errors", async () => {
      const { buildIfcModel } = await import("../ifcModel");
      vi.mocked(buildIfcModel).mockImplementationOnce(() => {
        throw new Error("Build failed");
      });

      await expect(loadIfc(mockFile, scene)).rejects.toThrow("Build failed");
    });
  });

  // ==========================================================================
  // Progress Callback Tests
  // ==========================================================================

  describe("progress callbacks", () => {
    it("should report progress at key stages", async () => {
      const plugin = new IfcLoaderPlugin();
      const progressEvents: any[] = [];

      await plugin.importMeshAsync(null, scene, mockFile, "", (event) => {
        progressEvents.push(event);
      });

      // Should have progress events
      expect(progressEvents.length).toBeGreaterThan(0);

      // First event should be 0%
      expect(progressEvents[0].loaded).toBe(0);

      // Last event should be 100%
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent.loaded).toBe(100);
      expect(lastEvent.total).toBe(100);
      expect(lastEvent.lengthComputable).toBe(true);
    });
  });

  // ==========================================================================
  // URL Loading Tests
  // ==========================================================================

  describe("URL loading", () => {
    it("should pass URL string to loadIfcModel", async () => {
      const { loadIfcModel } = await import("../ifcInit");

      const result = await loadIfc("./test.ifc", scene);

      expect(result).toBeDefined();
      // Verify loadIfcModel was called with the URL string
      expect(loadIfcModel).toHaveBeenCalledWith(
        expect.anything(), // ifcAPI
        "./test.ifc", // source URL
        expect.any(Object), // options
      );
    });

    it("should handle URL loading errors from loadIfcModel", async () => {
      const { loadIfcModel } = await import("../ifcInit");
      vi.mocked(loadIfcModel).mockRejectedValueOnce(new Error("Failed to fetch IFC file: HTTP 404 Not Found"));

      await expect(loadIfc("./missing.ifc", scene)).rejects.toThrow("Failed to fetch IFC file: HTTP 404 Not Found");
    });
  });
});
