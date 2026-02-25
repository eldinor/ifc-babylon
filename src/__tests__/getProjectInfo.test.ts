import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import * as WebIFC from "web-ifc";
import { getProjectInfo } from "../ifcInit";

// Mock WebIFC with a proper class constructor
vi.mock("web-ifc", () => {
  class MockIfcAPI {
    SetWasmPath = vi.fn();
    Init = vi.fn().mockResolvedValue(undefined);
    SetLogLevel = vi.fn();
    GetLineIDsWithType = vi.fn();
    GetLine = vi.fn();
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
  };
});

describe("getProjectInfo", () => {
  let mockIfcAPI: WebIFC.IfcAPI;
  const asMock = (fn: unknown): Mock => fn as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIfcAPI = new WebIFC.IfcAPI();
  });

  it("should return null values when no data is found", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockReturnValue({
      size: () => 0,
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result).toEqual({
      projectName: null,
      projectDescription: null,
      application: null,
      author: null,
      organization: null,
    });
  });

  it("should extract project name from Name property", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPROJECT) {
        return { size: () => 1, get: () => 100 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 100) {
        return { Name: { value: "Test Project" } };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.projectName).toBe("Test Project");
  });

  it("should extract project name from LongName when Name is not available", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPROJECT) {
        return { size: () => 1, get: () => 100 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 100) {
        return { LongName: { value: "Long Project Name" } };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.projectName).toBe("Long Project Name");
  });

  it("should prefer Name over LongName when both are available", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPROJECT) {
        return { size: () => 1, get: () => 100 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 100) {
        return { Name: { value: "Short Name" }, LongName: { value: "Long Name" } };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.projectName).toBe("Short Name");
  });

  it("should extract project description", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPROJECT) {
        return { size: () => 1, get: () => 100 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 100) {
        return { Description: { value: "A test project description" } };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.projectDescription).toBe("A test project description");
  });

  it("should extract application name from ApplicationFullName", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCAPPLICATION) {
        return { size: () => 1, get: () => 200 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 200) {
        return { ApplicationFullName: { value: "Revit 2024" } };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.application).toBe("Revit 2024");
  });

  it("should extract application name from ApplicationIdentifier when ApplicationFullName is not available", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCAPPLICATION) {
        return { size: () => 1, get: () => 200 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 200) {
        return { ApplicationIdentifier: { value: "ArchiCAD" } };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.application).toBe("ArchiCAD");
  });

  it("should extract author info from person data", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPERSON) {
        return { size: () => 1, get: () => 300 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 300) {
        return {
          GivenName: { value: "John" },
          FamilyName: { value: "Doe" },
        };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.author).toBe("John Doe");
  });

  it("should include identification in author if available", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPERSON) {
        return { size: () => 1, get: () => 300 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 300) {
        return {
          GivenName: { value: "Jane" },
          FamilyName: { value: "Smith" },
          Identification: { value: "JS001" },
        };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.author).toBe("Jane Smith JS001");
  });

  it("should extract organization name", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCORGANIZATION) {
        return { size: () => 1, get: () => 400 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 400) {
        return { Name: { value: "ACME Corporation" } };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.organization).toBe("ACME Corporation");
  });

  it("should extract all project info together", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPROJECT) return { size: () => 1, get: () => 100 };
      if (type === WebIFC.IFCAPPLICATION) return { size: () => 1, get: () => 200 };
      if (type === WebIFC.IFCPERSON) return { size: () => 1, get: () => 300 };
      if (type === WebIFC.IFCORGANIZATION) return { size: () => 1, get: () => 400 };
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 100) return { Name: { value: "My Project" }, Description: { value: "Project description" } };
      if (id === 200) return { ApplicationFullName: { value: "Test App 1.0" } };
      if (id === 300) return { GivenName: { value: "Alice" }, FamilyName: { value: "Brown" } };
      if (id === 400) return { Name: { value: "Test Company" } };
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result).toEqual({
      projectName: "My Project",
      projectDescription: "Project description",
      application: "Test App 1.0",
      author: "Alice Brown",
      organization: "Test Company",
    });
  });

  it("should handle errors gracefully and return partial results", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation(() => {
      throw new Error("Test error");
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result).toEqual({
      projectName: null,
      projectDescription: null,
      application: null,
      author: null,
      organization: null,
    });

    expect(consoleSpy).toHaveBeenCalledWith("Error extracting IFC projectInfo:", expect.any(Error));

    consoleSpy.mockRestore();
  });

  it("should handle null project line gracefully", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPROJECT) {
        return { size: () => 1, get: () => 100 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockReturnValue(null);

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.projectName).toBeNull();
    expect(result.projectDescription).toBeNull();
  });

  it("should handle empty string values", () => {
    asMock(mockIfcAPI.GetLineIDsWithType).mockImplementation((_modelID: number, type: number) => {
      if (type === WebIFC.IFCPERSON) {
        return { size: () => 1, get: () => 300 };
      }
      return { size: () => 0 };
    });

    asMock(mockIfcAPI.GetLine).mockImplementation((_modelID: number, id: number) => {
      if (id === 300) {
        return {
          GivenName: { value: "" },
          FamilyName: { value: "" },
        };
      }
      return null;
    });

    const result = getProjectInfo(mockIfcAPI, 1);

    expect(result.author).toBeNull();
  });
});

