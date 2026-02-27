/// <reference lib="webworker" />
import * as WebIFC from "web-ifc";
import { closeIfcModel, getProjectInfo, initializeWebIFC, loadIfcModel } from "./ifcInit";
import type { IfcInitOptions } from "./ifcInit";

type WorkerLoadSource =
  | { kind: "url"; url: string }
  | { kind: "file"; name: string; data: ArrayBuffer };

type WorkerRequest =
  | {
      type: "init";
      id: number;
      wasmPath?: string;
      logLevel: WebIFC.LogLevel;
    }
  | {
      type: "load";
      id: number;
      source: WorkerLoadSource;
      options: Omit<IfcInitOptions, "signal">;
    }
  | {
      type: "closeModel";
      id: number;
      modelID: number;
    }
  | {
      type: "getProjectInfo";
      id: number;
      modelID: number;
    }
  | {
      type: "getElementData";
      id: number;
      modelID: number;
      expressID: number;
    }
  | {
      type: "dispose";
      id: number;
    };

interface WorkerSuccess {
  type: "result";
  id: number;
  ok: true;
  data: unknown;
}

interface WorkerError {
  type: "result";
  id: number;
  ok: false;
  error: string;
}

let ifcAPI: WebIFC.IfcAPI | null = null;

function ensureIfcAPI(): WebIFC.IfcAPI {
  if (!ifcAPI) {
    throw new Error("web-ifc worker is not initialized. Call init() first.");
  }
  return ifcAPI;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function postSuccess(id: number, data: unknown, transferables: Transferable[] = []): void {
  const message: WorkerSuccess = {
    type: "result",
    id,
    ok: true,
    data,
  };
  self.postMessage(message, transferables);
}

function postError(id: number, error: unknown): void {
  const message: WorkerError = {
    type: "result",
    id,
    ok: false,
    error: getErrorMessage(error),
  };
  self.postMessage(message);
}

function collectModelTransferables(model: Awaited<ReturnType<typeof loadIfcModel>>): Transferable[] {
  const transferables: Transferable[] = [];
  const visited = new Set<ArrayBuffer>();

  for (const part of model.parts) {
    const buffers = [part.positions.buffer, part.normals.buffer, part.indices.buffer];
    for (const buffer of buffers) {
      if (buffer instanceof ArrayBuffer && !visited.has(buffer)) {
        visited.add(buffer);
        transferables.push(buffer);
      }
    }
  }

  return transferables;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  try {
    switch (message.type) {
      case "init": {
        console.log("[ifc-worker] init start", { wasmPath: message.wasmPath, logLevel: message.logLevel });
        ifcAPI = await initializeWebIFC(message.wasmPath, message.logLevel);
        console.log("[ifc-worker] init ok");
        postSuccess(message.id, null);
        return;
      }
      case "load": {
        const api = ensureIfcAPI();
        console.log("[ifc-worker] load start", {
          sourceKind: message.source.kind,
          coordinateToOrigin: message.options.coordinateToOrigin ?? true,
        });
        const source = message.source.kind === "url" ? message.source.url : message.source.data;
        const model = await loadIfcModel(api, source, message.options);
        console.log("[ifc-worker] load ok", {
          modelID: model.modelID,
          partCount: model.rawStats.partCount,
          triangleCount: model.rawStats.triangleCount,
        });
        postSuccess(message.id, model, collectModelTransferables(model));
        return;
      }
      case "closeModel": {
        const api = ensureIfcAPI();
        closeIfcModel(api, message.modelID);
        console.log("[ifc-worker] closeModel", { modelID: message.modelID });
        postSuccess(message.id, null);
        return;
      }
      case "getProjectInfo": {
        const api = ensureIfcAPI();
        const info = getProjectInfo(api, message.modelID);
        postSuccess(message.id, info);
        return;
      }
      case "getElementData": {
        const api = ensureIfcAPI();
        const element = api.GetLine(message.modelID, message.expressID, true) as {
          type: number;
          Name?: { value?: string };
        };
        const typeName = api.GetNameFromTypeCode(element.type);
        postSuccess(message.id, {
          typeName,
          element,
        });
        return;
      }
      case "dispose": {
        console.log("[ifc-worker] dispose");
        ifcAPI = null;
        postSuccess(message.id, null);
        return;
      }
      default: {
        const exhaustiveCheck: never = message;
        throw new Error(`Unknown worker message: ${String(exhaustiveCheck)}`);
      }
    }
  } catch (error) {
    postError(message.id, error);
  }
};
