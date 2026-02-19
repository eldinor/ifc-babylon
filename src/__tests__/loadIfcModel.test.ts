import { describe, it, expect, beforeEach, vi } from "vitest";
import * as WebIFC from "web-ifc";
import { loadIfcModel } from "../ifcInit";
import type { IfcInitOptions } from "../ifcInit";

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

describe("loadIfcModel", () => {
  let mockIfcAPI: WebIFC.IfcAPI;
  const mockFile = new File(["mock ifc content"], "test.ifc", { type: "application/ifc" });
  const mockOptions: IfcInitOptions = {
    coordinateToOrigin: true,
    verbose: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIfcAPI = new WebIFC.IfcAPI();

    // Mock geometry streaming
    const mockGeometry = {
      GetVertexData: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4, 5, 6])),
      GetVertexDataSize: vi.fn().mockReturnValue(6),
      GetIndexData: vi.fn().mockReturnValue(new Uint8Array([0, 1, 2])),
      GetIndexDataSize: vi.fn().mockReturnValue(3),
    };

    (mockIfcAPI as any).GetGeometry.mockReturnValue(mockGeometry);
    (mockIfcAPI as any).GetVertexArray.mockReturnValue(new Float32Array([1, 2, 3, 0.1, 0.2, 0.3]));
    (mockIfcAPI as any).GetIndexArray.mockReturnValue(new Uint32Array([0, 1, 2]));

    // Mock StreamAllMeshes to simulate geometry data
    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
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

    // Mock storey map building
    (mockIfcAPI as any).GetLineIDsWithType.mockReturnValue({
      size: () => 1,
      get: (_index: number) => 300,
    });

    (mockIfcAPI as any).GetLine.mockReturnValue({
      RelatingObject: { value: 300 },
      RelatedObjects: [{ value: 400 }],
    });
  });

  it("should load IFC model from File", async () => {
    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(result).toBeDefined();
    expect(result.modelID).toBe(1);
    expect(result.parts).toHaveLength(1);
    expect(result.storeyMap).toBeDefined();
    expect(result.rawStats).toBeDefined();
    expect(result.rawStats.partCount).toBe(1);
    expect(result.rawStats.vertexCount).toBe(1);
    expect(result.rawStats.triangleCount).toBe(1);
  });

  it("should load IFC model from URL", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue("application/ifc"),
      },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    };

    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await loadIfcModel(mockIfcAPI, "./test.ifc", mockOptions);

    expect(fetch).toHaveBeenCalledWith("./test.ifc");
    expect(result.modelID).toBe(1);

    (globalThis as any).fetch = originalFetch;
  });

  it("should handle fetch errors when loading from URL", async () => {
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
    });

    await expect(loadIfcModel(mockIfcAPI, "./missing.ifc", mockOptions)).rejects.toThrow(
      "Failed to fetch IFC file: HTTP 404 Not Found",
    );

    (globalThis as any).fetch = originalFetch;
  });

  it("should handle OpenModel failure", async () => {
    (mockIfcAPI as any).OpenModel.mockReturnValue(-1);

    await expect(loadIfcModel(mockIfcAPI, mockFile, mockOptions)).rejects.toThrow("Failed to open IFC model");
  });

  it("should use default options when none provided", async () => {
    await loadIfcModel(mockIfcAPI, mockFile);

    expect(mockIfcAPI.OpenModel).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        COORDINATE_TO_ORIGIN: true,
      }),
    );
  });

  it("should use custom options when provided", async () => {
    const customOptions: IfcInitOptions = {
      coordinateToOrigin: false,
      verbose: false,
    };

    await loadIfcModel(mockIfcAPI, mockFile, customOptions);

    expect(mockIfcAPI.OpenModel).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        COORDINATE_TO_ORIGIN: false,
      }),
    );
  });

  it("should handle empty geometry gracefully", async () => {
    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
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

    // Mock empty vertex/index arrays
    (mockIfcAPI as any).GetVertexArray.mockReturnValue(new Float32Array([]));
    (mockIfcAPI as any).GetIndexArray.mockReturnValue(new Uint32Array([]));

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(result.parts).toHaveLength(0);
    expect(result.rawStats.vertexCount).toBe(0);
    expect(result.rawStats.triangleCount).toBe(0);
  });

  it("should handle geometry without color", async () => {
    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
      const mockFlatMesh = {
        expressID: 100,
        geometries: {
          size: () => 1,
          get: (_index: number) => ({
            geometryExpressID: 200,
            color: null,
            flatTransformation: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          }),
        },
      };
      callback(mockFlatMesh);
    });

    (mockIfcAPI as any).GetVertexArray.mockReturnValue(new Float32Array([1, 2, 3, 0.1, 0.2, 0.3]));
    (mockIfcAPI as any).GetIndexArray.mockReturnValue(new Uint32Array([0, 1, 2]));

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].color).toBeNull();
    expect(result.parts[0].colorId).toBe(0);
  });

  it("should handle invalid placedGeometry (undefined geometryExpressID)", async () => {
    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
      const mockFlatMesh = {
        expressID: 100,
        geometries: {
          size: () => 1,
          get: (_index: number) => ({
            geometryExpressID: undefined,
            color: { x: 1, y: 0, z: 0, w: 1 },
            flatTransformation: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          }),
        },
      };
      callback(mockFlatMesh);
    });

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(result.parts).toHaveLength(0);
  });

  it("should handle null geometry from GetGeometry", async () => {
    (mockIfcAPI as any).GetGeometry.mockReturnValue(null);
    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
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

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(result.parts).toHaveLength(0);
  });

  it("should handle multiple geometries in a single flatMesh", async () => {
    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
      const mockFlatMesh = {
        expressID: 100,
        geometries: {
          size: () => 2,
          get: (index: number) => ({
            geometryExpressID: 200 + index,
            color: { x: index, y: 0, z: 0, w: 1 },
            flatTransformation: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          }),
        },
      };
      callback(mockFlatMesh);
    });

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(result.parts).toHaveLength(2);
  });

  it("should calculate correct colorId from color values", async () => {
    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
      const mockFlatMesh = {
        expressID: 100,
        geometries: {
          size: () => 1,
          get: (_index: number) => ({
            geometryExpressID: 200,
            color: { x: 1, y: 1, z: 1, w: 1 }, // White = 255 + 255*256 + 255*256*256 + 255*256*256*256
            flatTransformation: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          }),
        },
      };
      callback(mockFlatMesh);
    });

    (mockIfcAPI as any).GetVertexArray.mockReturnValue(new Float32Array([1, 2, 3, 0.1, 0.2, 0.3]));
    (mockIfcAPI as any).GetIndexArray.mockReturnValue(new Uint32Array([0, 1, 2]));

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    // Expected: 255 + 255*256 + 255*65536 + 255*16777216
    const expectedColorId = 255 + 255 * 256 + 255 * 65536 + 255 * 16777216;
    expect(result.parts[0].colorId).toBe(expectedColorId);
  });

  it("should handle verbose logging", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await loadIfcModel(mockIfcAPI, mockFile, { verbose: true });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("📊 Raw Model Statistics:"));

    consoleSpy.mockRestore();
  });

  it("should suppress verbose logging when verbose is false", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await loadIfcModel(mockIfcAPI, mockFile, { verbose: false });

    // Should not log statistics
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("📊 Raw Model Statistics:"));

    consoleSpy.mockRestore();
  });

  it("should handle errors in geometry processing gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
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

    // Make GetVertexArray throw an error
    (mockIfcAPI as any).GetVertexArray.mockImplementation(() => {
      throw new Error("Geometry processing error");
    });

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(consoleSpy).toHaveBeenCalledWith("Error processing geometry:", expect.any(Error));
    expect(result.parts).toHaveLength(0); // Error should be caught, part not added

    consoleSpy.mockRestore();
  });

  it("should handle empty storey map gracefully", async () => {
    (mockIfcAPI as any).GetLineIDsWithType.mockReturnValue({
      size: () => 0,
    });

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(result.storeyMap.size).toBe(0);
  });

  it("should handle errors in storey map building", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    (mockIfcAPI as any).GetLineIDsWithType.mockImplementation(() => {
      throw new Error("Storey map error");
    });

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(consoleSpy).toHaveBeenCalledWith("Could not build storey map:", expect.any(Error));
    expect(result.storeyMap.size).toBe(0);

    consoleSpy.mockRestore();
  });

  it("should extract positions and normals correctly from vertex data", async () => {
    (mockIfcAPI as any).StreamAllMeshes.mockImplementation((_modelID: number, callback: any) => {
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

    // 2 vertices: each has 6 floats (px, py, pz, nx, ny, nz)
    const vertexData = new Float32Array([
      1,
      2,
      3,
      0.1,
      0.2,
      0.3, // vertex 0: pos(1,2,3), normal(0.1,0.2,0.3)
      4,
      5,
      6,
      0.4,
      0.5,
      0.6, // vertex 1: pos(4,5,6), normal(0.4,0.5,0.6)
    ]);
    (mockIfcAPI as any).GetVertexArray.mockReturnValue(vertexData);
    (mockIfcAPI as any).GetIndexArray.mockReturnValue(new Uint32Array([0, 1, 0]));

    const result = await loadIfcModel(mockIfcAPI, mockFile, mockOptions);

    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].positions).toEqual(new Float32Array([1, 2, 3, 4, 5, 6]));
    expect(result.parts[0].normals).toEqual(new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]));
    expect(result.rawStats.vertexCount).toBe(2);
  });
});
