import { describe, it, expect, beforeEach, vi } from "vitest";
import * as WebIFC from "web-ifc";
import { initializeWebIFC } from "../ifcInit";

// Mock WebIFC with a proper class constructor
vi.mock("web-ifc", () => {
  class MockIfcAPI {
    SetWasmPath = vi.fn();
    Init = vi.fn().mockResolvedValue(undefined);
    SetLogLevel = vi.fn();
  }
  return {
    IfcAPI: MockIfcAPI,
    LogLevel: {
      LOG_LEVEL_ERROR: 1,
      LOG_LEVEL_WARN: 2,
      LOG_LEVEL_INFO: 4,
      LOG_LEVEL_DEBUG: 8,
    },
  };
});

describe("initializeWebIFC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize WebIFC API with default settings", async () => {
    const result = await initializeWebIFC();

    expect(result).toBeInstanceOf(WebIFC.IfcAPI);
    expect(result.Init).toHaveBeenCalled();
    expect(result.SetLogLevel).toHaveBeenCalledWith(WebIFC.LogLevel.LOG_LEVEL_ERROR);
    expect(result.SetWasmPath).not.toHaveBeenCalled();
  });

  it("should initialize WebIFC API with custom WASM path", async () => {
    const wasmPath = "custom/path/";
    const result = await initializeWebIFC(wasmPath);

    expect(result.SetWasmPath).toHaveBeenCalledWith(wasmPath);
    expect(result.Init).toHaveBeenCalled();
  });

  it("should initialize WebIFC API with custom log level", async () => {
    const result = await initializeWebIFC(undefined, WebIFC.LogLevel.LOG_LEVEL_DEBUG);

    expect(result.SetLogLevel).toHaveBeenCalledWith(WebIFC.LogLevel.LOG_LEVEL_DEBUG);
  });

  it("should initialize with both custom WASM path and log level", async () => {
    const wasmPath = "./wasm/";
    const result = await initializeWebIFC(wasmPath, WebIFC.LogLevel.LOG_LEVEL_WARN);

    expect(result.SetWasmPath).toHaveBeenCalledWith(wasmPath);
    expect(result.SetLogLevel).toHaveBeenCalledWith(WebIFC.LogLevel.LOG_LEVEL_WARN);
    expect(result.Init).toHaveBeenCalled();
  });
});
