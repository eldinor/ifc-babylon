/// <reference lib="webworker" />
import * as WebIFC from "web-ifc";
import { closeIfcModel, getProjectInfo, initializeWebIFC, loadIfcModel } from "./ifcInit";
import type { IfcInitOptions } from "./ifcInit";
import { prepareIfcModelGeometry } from "./ifcModelPreparation";
import type { GeometryPreparationOptions, PreparedIfcModel } from "./ifcModelPreparation";

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
      type: "loadPrepared";
      id: number;
      source: WorkerLoadSource;
      options: Omit<IfcInitOptions, "signal">;
      prepareOptions: GeometryPreparationOptions;
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
const WORKER_LOG_PREFIX = "[ifc.worker]";

function workerLog(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`${WORKER_LOG_PREFIX} ${message}`, details);
  } else {
    console.log(`${WORKER_LOG_PREFIX} ${message}`);
  }
}

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

function collectPreparedTransferables(model: PreparedIfcModel): Transferable[] {
  const transferables: Transferable[] = [];
  const visited = new Set<ArrayBuffer>();
  for (const mesh of model.meshes) {
    const buffers = [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer];
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
  const requestStart = performance.now();
  workerLog(`received '${message.type}'`, { id: message.id });

  try {
    switch (message.type) {
      case "init": {
        ifcAPI = await initializeWebIFC(message.wasmPath, message.logLevel);
        workerLog("web-ifc initialized", {
          id: message.id,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
          wasmPath: message.wasmPath ?? "(default)",
        });
        postSuccess(message.id, null);
        return;
      }
      case "load": {
        const api = ensureIfcAPI();
        const source = message.source.kind === "url" ? message.source.url : message.source.data;
        workerLog("loading raw IFC model", {
          id: message.id,
          sourceKind: message.source.kind,
        });
        const model = await loadIfcModel(api, source, message.options);
        workerLog("raw IFC model loaded", {
          id: message.id,
          modelID: model.modelID,
          partCount: model.parts.length,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, model, collectModelTransferables(model));
        return;
      }
      case "loadPrepared": {
        const api = ensureIfcAPI();
        const source = message.source.kind === "url" ? message.source.url : message.source.data;
        workerLog("loading IFC model for preparation", {
          id: message.id,
          sourceKind: message.source.kind,
        });
        const model = await loadIfcModel(api, source, message.options);
        const preparationStart = performance.now();
        workerLog("preparing geometry", {
          id: message.id,
          modelID: model.modelID,
          sourcePartCount: model.parts.length,
        });
        const prepared = prepareIfcModelGeometry(model, message.prepareOptions);
        workerLog("geometry prepared", {
          id: message.id,
          modelID: prepared.modelID,
          preparedMeshCount: prepared.meshes.length,
          mergedGroupCount: prepared.mergedGroupCount,
          invalidPartCount: prepared.invalidPartCount,
          preparationMs: (performance.now() - preparationStart).toFixed(2),
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, prepared, collectPreparedTransferables(prepared));
        return;
      }
      case "closeModel": {
        const api = ensureIfcAPI();
        closeIfcModel(api, message.modelID);
        workerLog("model closed", {
          id: message.id,
          modelID: message.modelID,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, null);
        return;
      }
      case "getProjectInfo": {
        const api = ensureIfcAPI();
        const info = getProjectInfo(api, message.modelID);
        workerLog("project info extracted", {
          id: message.id,
          modelID: message.modelID,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
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
        workerLog("element data extracted", {
          id: message.id,
          modelID: message.modelID,
          expressID: message.expressID,
          typeName,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, {
          typeName,
          element,
        });
        return;
      }
      case "dispose": {
        ifcAPI = null;
        workerLog("worker IFC API disposed", {
          id: message.id,
          elapsedMs: (performance.now() - requestStart).toFixed(2),
        });
        postSuccess(message.id, null);
        return;
      }
      default: {
        const exhaustiveCheck: never = message;
        throw new Error(`Unknown worker message: ${String(exhaustiveCheck)}`);
      }
    }
  } catch (error) {
    workerLog("request failed", {
      id: message.id,
      type: message.type,
      elapsedMs: (performance.now() - requestStart).toFixed(2),
      error: getErrorMessage(error),
    });
    postError(message.id, error);
  }
};
