import { describe, it, expect, beforeEach, vi } from "vitest";
import * as WebIFC from "web-ifc";
import { closeIfcModel } from "../ifcInit";

// Mock WebIFC with a proper class constructor
vi.mock("web-ifc", () => {
  class MockIfcAPI {
    SetWasmPath = vi.fn();
    Init = vi.fn().mockResolvedValue(undefined);
    SetLogLevel = vi.fn();
    IsModelOpen = vi.fn();
    CloseModel = vi.fn();
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

describe("closeIfcModel", () => {
  let mockIfcAPI: WebIFC.IfcAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIfcAPI = new WebIFC.IfcAPI();
  });

  it("should close an open model", () => {
    (mockIfcAPI.IsModelOpen as any).mockReturnValue(true);

    closeIfcModel(mockIfcAPI, 1);

    expect(mockIfcAPI.IsModelOpen).toHaveBeenCalledWith(1);
    expect(mockIfcAPI.CloseModel).toHaveBeenCalledWith(1);
  });

  it("should not attempt to close a model that is not open", () => {
    (mockIfcAPI.IsModelOpen as any).mockReturnValue(false);

    closeIfcModel(mockIfcAPI, 999);

    expect(mockIfcAPI.IsModelOpen).toHaveBeenCalledWith(999);
    expect(mockIfcAPI.CloseModel).not.toHaveBeenCalled();
  });

  it("should close model with correct modelID", () => {
    (mockIfcAPI.IsModelOpen as any).mockReturnValue(true);

    closeIfcModel(mockIfcAPI, 42);

    expect(mockIfcAPI.CloseModel).toHaveBeenCalledWith(42);
  });

  it("should handle multiple sequential close calls gracefully", () => {
    (mockIfcAPI.IsModelOpen as any).mockReturnValueOnce(true).mockReturnValueOnce(false);

    // First close should work
    closeIfcModel(mockIfcAPI, 1);
    expect(mockIfcAPI.CloseModel).toHaveBeenCalledTimes(1);

    // Second close should not call CloseModel again
    closeIfcModel(mockIfcAPI, 1);
    expect(mockIfcAPI.CloseModel).toHaveBeenCalledTimes(1);
  });

  it("should log confirmation message when closing model", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    (mockIfcAPI.IsModelOpen as any).mockReturnValue(true);

    closeIfcModel(mockIfcAPI, 1);

    expect(consoleSpy).toHaveBeenCalledWith("✓ Model 1 closed and memory freed");

    consoleSpy.mockRestore();
  });

  it("should not log when model is not open", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    (mockIfcAPI.IsModelOpen as any).mockReturnValue(false);

    closeIfcModel(mockIfcAPI, 1);

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
