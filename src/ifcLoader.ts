import * as WebIFC from "web-ifc";
import { closeIfcModel, getProjectInfo, initializeWebIFC, loadIfcModel } from "./ifcInit";
import type { IfcInitOptions, ProjectInfoResult, RawIfcModel } from "./ifcInit";
import { IfcWorkerClient } from "./ifcWorkerClient";
import type { ElementDataResult } from "./ifcWorkerClient";

export interface IfcLoader {
  init(wasmPath?: string, logLevel?: WebIFC.LogLevel): Promise<void>;
  loadIfcModel(source: string | File, options?: Omit<IfcInitOptions, "signal">): Promise<RawIfcModel>;
  closeIfcModel(modelID: number): Promise<void>;
  getProjectInfo(modelID: number): Promise<ProjectInfoResult>;
  getElementData(modelID: number, expressID: number): Promise<ElementDataResult>;
  dispose(): Promise<void>;
}

export interface CreateIfcLoaderOptions {
  useWorker?: boolean;
}

class MainThreadIfcLoader implements IfcLoader {
  private ifcAPI: WebIFC.IfcAPI | null = null;

  async init(wasmPath?: string, logLevel: WebIFC.LogLevel = WebIFC.LogLevel.LOG_LEVEL_ERROR): Promise<void> {
    this.ifcAPI = await initializeWebIFC(wasmPath, logLevel);
  }

  async loadIfcModel(source: string | File, options: Omit<IfcInitOptions, "signal"> = {}): Promise<RawIfcModel> {
    return loadIfcModel(this.ensureIfcAPI(), source, options);
  }

  async closeIfcModel(modelID: number): Promise<void> {
    closeIfcModel(this.ensureIfcAPI(), modelID);
  }

  async getProjectInfo(modelID: number): Promise<ProjectInfoResult> {
    return getProjectInfo(this.ensureIfcAPI(), modelID);
  }

  async getElementData(modelID: number, expressID: number): Promise<ElementDataResult> {
    const api = this.ensureIfcAPI();
    const element = api.GetLine(modelID, expressID, true) as {
      type: number;
      Name?: { value?: string };
    };
    const typeName = api.GetNameFromTypeCode(element.type);
    return { element, typeName };
  }

  async dispose(): Promise<void> {
    this.ifcAPI = null;
  }

  private ensureIfcAPI(): WebIFC.IfcAPI {
    if (!this.ifcAPI) {
      throw new Error("IFC loader is not initialized. Call init() first.");
    }
    return this.ifcAPI;
  }
}

export function createIfcLoader(options: CreateIfcLoaderOptions = {}): IfcLoader {
  if (options.useWorker) {
    return new IfcWorkerClient();
  }
  return new MainThreadIfcLoader();
}
