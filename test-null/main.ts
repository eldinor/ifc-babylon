import * as WebIFC from "web-ifc";
import { createIfcLoader } from "../src/index";

type IfcSource = string | File;

type NullBuildResponse =
  | { id: number; ok: true; buildMs: number; meshCount: number }
  | { id: number; ok: false; error: string };

const output = document.getElementById("output") as HTMLPreElement;
const runButton = document.getElementById("run-btn") as HTMLButtonElement;
const iterationsInput = document.getElementById("iterations") as HTMLInputElement;
const fileInput = document.getElementById("ifc-file") as HTMLInputElement;

function logLine(line: string): void {
  output.textContent += `${line}\n`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function initLoaderWithFallback(loader: ReturnType<typeof createIfcLoader>): Promise<void> {
  const wasmPaths = ["/", "/node_modules/web-ifc/"];
  let lastError: unknown = null;
  for (const wasmPath of wasmPaths) {
    try {
      await loader.init(wasmPath, WebIFC.LogLevel.LOG_LEVEL_ERROR);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

class NullBuildWorkerClient {
  private worker: Worker;
  private requestId = 1;
  private pending = new Map<number, { resolve: (v: NullBuildResponse) => void; reject: (e: unknown) => void }>();

  constructor() {
    this.worker = new Worker(new URL("./nullBuild.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<NullBuildResponse>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      pending.resolve(message);
    };
  }

  build(model: unknown, transferables: Transferable[]): Promise<NullBuildResponse> {
    const id = this.requestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: "build", model }, transferables);
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
}

function collectPreparedTransferables(model: { meshes: Array<{ positions: Float32Array; normals: Float32Array; indices: Uint32Array }> }): Transferable[] {
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

async function run(): Promise<void> {
  runButton.disabled = true;
  output.textContent = "";

  const iterations = Math.max(1, Math.min(10, Number(iterationsInput.value) || 3));
  const file = fileInput.files?.[0] ?? null;
  const source: IfcSource = file ?? "/test.ifc";
  const sourceLabel = file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : "/test.ifc";

  const loader = createIfcLoader({ useWorker: true });
  const nullWorker = new NullBuildWorkerClient();
  const loadTimes: number[] = [];
  const buildTimes: number[] = [];

  try {
    await initLoaderWithFallback(loader);

    logLine(`Source: ${sourceLabel}`);
    logLine(`Iterations: ${iterations}`);
    logLine("");

    for (let i = 0; i < iterations; i++) {
      const loadStart = performance.now();
      const prepared = await loader.loadPreparedIfcModel(
        source,
        { coordinateToOrigin: true, verbose: false },
        { mergeMeshes: true, generateNormals: false },
      );
      loadTimes.push(performance.now() - loadStart);

      const buildStart = performance.now();
      const response = await nullWorker.build(prepared, collectPreparedTransferables(prepared));
      buildTimes.push(performance.now() - buildStart);
      if (!response.ok) {
        throw new Error(response.error);
      }

      await loader.closeIfcModel(prepared.modelID);
      logLine(`  run ${i + 1}/${iterations} complete (meshes=${response.meshCount})`);
    }

    logLine("");
    logLine(`median load (prepare worker): ${median(loadTimes).toFixed(2)}ms`);
    logLine(`median null-worker build: ${median(buildTimes).toFixed(2)}ms`);
  } catch (error) {
    logLine("");
    logLine(`Test failed: ${String(error)}`);
    console.error(error);
  } finally {
    await loader.dispose();
    nullWorker.dispose();
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", () => {
  void run();
});

