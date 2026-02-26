import { describe, it, expect, vi, afterEach } from "vitest";
import { logError, logInfo, logWarn } from "../logging";

describe("logging helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logInfo should log message without context", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logInfo("hello");

    expect(spy).toHaveBeenCalledWith("hello");
  });

  it("logInfo should append context in stable order", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logInfo("hello", { modelID: 1, expressID: 2, geometryExpressID: 3 });

    expect(spy).toHaveBeenCalledWith("hello (modelID=1, expressID=2, geometryExpressID=3)");
  });

  it("logWarn should log message and detail when provided", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const detail = new Error("warn detail");

    logWarn("warn message", { modelID: 9 }, detail);

    expect(spy).toHaveBeenCalledWith("warn message (modelID=9)", detail);
  });

  it("logWarn should log message only when detail is not provided", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logWarn("warn message", { expressID: 11 });

    expect(spy).toHaveBeenCalledWith("warn message (expressID=11)");
  });

  it("logError should log message and detail when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const detail = new Error("error detail");

    logError("error message", { geometryExpressID: 77 }, detail);

    expect(spy).toHaveBeenCalledWith("error message (geometryExpressID=77)", detail);
  });

  it("logError should log message only when detail is not provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("error message");

    expect(spy).toHaveBeenCalledWith("error message");
  });
});

