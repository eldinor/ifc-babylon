import { describe, it, expect, beforeEach, vi } from "vitest";
import * as WebIFC from "web-ifc";
import { initializeWebIFC } from "../ifcInit";
import type { Mock } from "vitest";

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
  const asMock = (fn: unknown): Mock => fn as Mock;

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

  it("should log initialization time on success", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await initializeWebIFC();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/✓ Web-IFC initialized in \d+\.?\d*ms/));

    consoleSpy.mockRestore();
  });

  it("should handle empty string WASM path (should not set)", async () => {
    const result = await initializeWebIFC("");

    // Empty string is falsy, so SetWasmPath should not be called
    expect(result.SetWasmPath).not.toHaveBeenCalled();
  });

  it("should call Init before SetLogLevel", async () => {
    const result = await initializeWebIFC();

    // Check the order of calls
    const initOrder = asMock(result.Init).mock.invocationCallOrder[0];
    const logLevelOrder = asMock(result.SetLogLevel).mock.invocationCallOrder[0];

    expect(initOrder).toBeLessThan(logLevelOrder);
  });

  it("should call SetWasmPath before Init when path is provided", async () => {
    const result = await initializeWebIFC("custom/path/");

    const wasmPathOrder = asMock(result.SetWasmPath).mock.invocationCallOrder[0];
    const initOrder = asMock(result.Init).mock.invocationCallOrder[0];

    expect(wasmPathOrder).toBeLessThan(initOrder);
  });
});
