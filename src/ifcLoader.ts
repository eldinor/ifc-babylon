import * as WebIFC from "web-ifc";
import { closeIfcModel, getProjectInfo, initializeWebIFC, loadIfcModel } from "./ifcInit";
import type { ProjectInfoResult, RawIfcModel } from "./ifcInit";
import { IfcWorkerClient } from "./ifcWorkerClient";
import type { ElementDataResult, IfcWorkerLoadOptions } from "./ifcWorkerClient";
import { prepareIfcModelGeometry } from "./ifcModelPreparation";
import type { GeometryPreparationOptions, PreparedIfcModel } from "./ifcModelPreparation";

export interface LoadPreparedIfcModelOptions extends IfcWorkerLoadOptions {
  keepModelOpen?: boolean;
}

export interface IfcLoader {
  init(wasmPath?: string, logLevel?: WebIFC.LogLevel): Promise<void>;
  loadIfcModel(source: string | File, options?: IfcWorkerLoadOptions): Promise<RawIfcModel>;
  loadPreparedIfcModel(
    source: string | File,
    options?: LoadPreparedIfcModelOptions,
    prepareOptions?: GeometryPreparationOptions,
  ): Promise<PreparedIfcModel>;
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

  async loadIfcModel(source: string | File, options: IfcWorkerLoadOptions = {}): Promise<RawIfcModel> {
    const { onProgress: _onProgress, ...ifcOptions } = options;
    return loadIfcModel(this.ensureIfcAPI(), source, ifcOptions);
  }

  async loadPreparedIfcModel(
    source: string | File,
    options: LoadPreparedIfcModelOptions = {},
    prepareOptions: GeometryPreparationOptions = {},
  ): Promise<PreparedIfcModel> {
    const { keepModelOpen = true, onProgress: _onProgress, ...ifcOptions } = options;
    const model = await this.loadIfcModel(source, ifcOptions);
    const prepared = prepareIfcModelGeometry(model, { ...prepareOptions, signal: ifcOptions.signal });
    if (!keepModelOpen) {
      closeIfcModel(this.ensureIfcAPI(), model.modelID);
      return { ...prepared, modelID: -1 };
    }
    return prepared;
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
