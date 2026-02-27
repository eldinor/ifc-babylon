import * as WebIFC from "web-ifc";
import type { IfcInitOptions, ProjectInfoResult, RawIfcModel } from "./ifcInit";

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

type WorkerResultMessage =
  | {
      type: "result";
      id: number;
      ok: true;
      data: unknown;
    }
  | {
      type: "result";
      id: number;
      ok: false;
      error: string;
    };

export interface ElementDataResult {
  typeName: string;
  element: {
    type: number;
    Name?: { value?: string };
  };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
}

export class IfcWorkerClient {
  private worker: Worker;
  private requestID = 1;
  private pending = new Map<number, PendingRequest>();

  constructor() {
    this.worker = new Worker(new URL("./ifc.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResultMessage>) => {
      const message = event.data;
      if (message.type !== "result") return;

      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);

      if (message.ok) {
        pending.resolve(message.data);
      } else {
        pending.reject(new Error(message.error));
      }
    };
  }

  async init(wasmPath?: string, logLevel: WebIFC.LogLevel = WebIFC.LogLevel.LOG_LEVEL_ERROR): Promise<void> {
    await this.request<void>({
      type: "init",
      id: 0,
      wasmPath,
      logLevel,
    });
  }

  async loadIfcModel(source: string | File, options: Omit<IfcInitOptions, "signal"> = {}): Promise<RawIfcModel> {
    const workerSource: WorkerLoadSource =
      typeof source === "string"
        ? { kind: "url", url: source }
        : { kind: "file", name: source.name, data: await source.arrayBuffer() };

    const transferables: Transferable[] = [];
    if (workerSource.kind === "file") {
      transferables.push(workerSource.data);
    }

    return this.request<RawIfcModel>(
      {
        type: "load",
        id: 0,
        source: workerSource,
        options,
      },
      transferables,
    );
  }

  async closeIfcModel(modelID: number): Promise<void> {
    await this.request<void>({
      type: "closeModel",
      id: 0,
      modelID,
    });
  }

  async getProjectInfo(modelID: number): Promise<ProjectInfoResult> {
    return this.request<ProjectInfoResult>({
      type: "getProjectInfo",
      id: 0,
      modelID,
    });
  }

  async getElementData(modelID: number, expressID: number): Promise<ElementDataResult> {
    return this.request<ElementDataResult>({
      type: "getElementData",
      id: 0,
      modelID,
      expressID,
    });
  }

  async dispose(): Promise<void> {
    try {
      await this.request<void>({
        type: "dispose",
        id: 0,
      });
    } finally {
      this.worker.terminate();
    }
  }

  private request<T>(message: WorkerRequest, transferables: Transferable[] = []): Promise<T> {
    const id = this.requestID++;
    const payload = { ...message, id };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(payload, transferables);
    });
  }
}
