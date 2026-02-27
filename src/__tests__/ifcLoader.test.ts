import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawIfcModel } from "../ifcInit";
import type { PreparedIfcModel } from "../ifcModelPreparation";

const mocks = vi.hoisted(() => {
  const mockIfcApi = {
    GetLine: vi.fn(),
    GetNameFromTypeCode: vi.fn(),
    IsModelOpen: vi.fn(),
    CloseModel: vi.fn(),
  };
  return {
    initializeWebIFC: vi.fn(),
    loadIfcModel: vi.fn(),
    closeIfcModel: vi.fn(),
    getProjectInfo: vi.fn(),
    prepareIfcModelGeometry: vi.fn(),
    mockIfcApi,
    workerInstances: [] as unknown[],
  };
});

vi.mock("web-ifc", () => ({
  LogLevel: {
    LOG_LEVEL_ERROR: 1,
    LOG_LEVEL_WARN: 2,
    LOG_LEVEL_INFO: 4,
    LOG_LEVEL_DEBUG: 8,
  },
}));

vi.mock("../ifcInit", () => ({
  initializeWebIFC: mocks.initializeWebIFC,
  loadIfcModel: mocks.loadIfcModel,
  closeIfcModel: mocks.closeIfcModel,
  getProjectInfo: mocks.getProjectInfo,
}));

vi.mock("../ifcModelPreparation", () => ({
  prepareIfcModelGeometry: mocks.prepareIfcModelGeometry,
}));

vi.mock("../ifcWorkerClient", () => {
  class MockIfcWorkerClient {
    constructor() {
      mocks.workerInstances.push(this);
    }
  }
  return { IfcWorkerClient: MockIfcWorkerClient };
});

import { createIfcLoader } from "../ifcLoader";

function createRawModel(): RawIfcModel {
  return {
    modelID: 42,
    parts: [],
    rawStats: {
      partCount: 0,
      vertexCount: 0,
      triangleCount: 0,
    },
  };
}

function createPreparedModel(): PreparedIfcModel {
  return {
    modelID: 42,
    sourcePartCount: 0,
    invalidPartCount: 0,
    mergedGroupCount: 0,
    mergeMode: "by-color",
    telemetry: {
      tier: "explicit",
      opaqueMeshCount: 0,
      transparentMeshCount: 0,
      elementRangeCount: 0,
      elementMapBytes: 0,
      geometryBytes: 0,
      transferBytes: 0,
      includeElementMap: true,
    },
    meshes: [],
  };
}

describe("createIfcLoader / MainThreadIfcLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workerInstances.length = 0;
    mocks.initializeWebIFC.mockResolvedValue(mocks.mockIfcApi);
    mocks.loadIfcModel.mockResolvedValue(createRawModel());
    mocks.prepareIfcModelGeometry.mockReturnValue(createPreparedModel());
    mocks.getProjectInfo.mockReturnValue({
      projectName: "Project",
      projectDescription: null,
      application: "App",
      author: "Author",
      organization: "Org",
    });
    mocks.mockIfcApi.GetLine.mockReturnValue({ type: 100, Name: { value: "Element" } });
    mocks.mockIfcApi.GetNameFromTypeCode.mockReturnValue("IfcWall");
    mocks.mockIfcApi.IsModelOpen.mockReturnValue(true);
  });

  it("should create worker loader when useWorker=true", () => {
    const loader = createIfcLoader({ useWorker: true });
    expect(mocks.workerInstances).toContain(loader);
  });

  it("should initialize and use main-thread loader when useWorker=false", async () => {
    const loader = createIfcLoader({ useWorker: false });
    await loader.init("/wasm-path/");
    await loader.loadIfcModel("/test.ifc");

    expect(mocks.initializeWebIFC).toHaveBeenCalledWith("/wasm-path/", 1);
    expect(mocks.loadIfcModel).toHaveBeenCalledWith(mocks.mockIfcApi, "/test.ifc", {});
  });

  it("should throw when calling loadIfcModel before init", async () => {
    const loader = createIfcLoader({ useWorker: false });
    await expect(loader.loadIfcModel("/test.ifc")).rejects.toThrow("IFC loader is not initialized");
  });

  it("should close model and return modelID=-1 when keepModelOpen is false", async () => {
    const loader = createIfcLoader({ useWorker: false });
    await loader.init("/");

    const result = await loader.loadPreparedIfcModel("/test.ifc", { keepModelOpen: false });

    expect(mocks.prepareIfcModelGeometry).toHaveBeenCalled();
    expect(mocks.closeIfcModel).toHaveBeenCalledWith(mocks.mockIfcApi, 42);
    expect(result.modelID).toBe(-1);
  });

  it("should force renderOnly profile options and close model", async () => {
    const loader = createIfcLoader({ useWorker: false });
    await loader.init("/");
    const controller = new AbortController();

    const result = await loader.loadPreparedIfcModel(
      "/test.ifc",
      { keepModelOpen: true, renderOnly: true, signal: controller.signal },
      { mergeMode: "none", includeElementMap: true },
    );

    expect(mocks.prepareIfcModelGeometry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mergeMode: "two-material",
        includeElementMap: false,
        profile: "renderOnly",
        signal: controller.signal,
      }),
    );
    expect(mocks.closeIfcModel).toHaveBeenCalledWith(mocks.mockIfcApi, 42);
    expect(result.modelID).toBe(-1);
  });

  it("should use IFC API for element data and type name", async () => {
    const loader = createIfcLoader({ useWorker: false });
    await loader.init("/");

    const result = await loader.getElementData(42, 1001);

    expect(mocks.mockIfcApi.GetLine).toHaveBeenCalledWith(42, 1001, true);
    expect(mocks.mockIfcApi.GetNameFromTypeCode).toHaveBeenCalledWith(100);
    expect(result.typeName).toBe("IfcWall");
    expect(result.element.Name?.value).toBe("Element");
  });
});
