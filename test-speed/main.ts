import * as WebIFC from "web-ifc";
import { NullEngine, Scene } from "@babylonjs/core";
import { createIfcLoader, buildIfcModel, disposeIfcModel } from "../src/index";
import type { PreparedIfcModel } from "../src/index";

type IfcSource = string | File;
type BenchMode = "worker" | "main-thread" | "null-worker";

interface BenchResult {
  mode: BenchMode;
  initMs: number;
  medianLoadMs: number;
  medianBuildMs: number;
  coldStartTotalMs: number;
  steadyStateTotalMs: number;
}

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

async function waitForSceneMeshCount(scene: Scene, expectedMeshCount: number, timeoutMs = 5000): Promise<void> {
  const start = performance.now();
  while (scene.meshes.length < expectedMeshCount) {
    if (performance.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for scene meshes: expected >= ${expectedMeshCount}, got ${scene.meshes.length}`,
      );
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

class NullBuildWorkerClient {
  private worker: Worker;
  private requestId = 1;
  private pending = new Map<number, { resolve: (v: NullBuildResponse) => void }>();

  constructor() {
    this.worker = new Worker(new URL("../test-null/nullBuild.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<NullBuildResponse>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      pending.resolve(message);
    };
  }

  build(model: PreparedIfcModel, transferables: Transferable[]): Promise<NullBuildResponse> {
    const id = this.requestId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.worker.postMessage({ id, type: "build", model }, transferables);
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
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

async function benchmarkScenario(mode: BenchMode, source: IfcSource, iterations: number): Promise<BenchResult> {
  const useWorker = mode !== "main-thread";
  const loader = createIfcLoader({ useWorker });
  const nullWorker = mode === "null-worker" ? new NullBuildWorkerClient() : null;
  const engine = new NullEngine();

  const initStart = performance.now();
  await initLoaderWithFallback(loader);
  const initMs = performance.now() - initStart;

  const loadTimes: number[] = [];
  const buildTimes: number[] = [];
  const totalTimes: number[] = [];

  try {
    for (let i = 0; i < iterations; i++) {
      const runStart = performance.now();
      const scene = new Scene(engine);

      let modelID: number | null = null;
      try {
        const loadStart = performance.now();
        const model = mode === "main-thread"
          ? await loader.loadIfcModel(source, { coordinateToOrigin: true, verbose: false })
          : await loader.loadPreparedIfcModel(
              source,
              { coordinateToOrigin: true, verbose: false },
              { mergeMeshes: true, generateNormals: false },
            );
        const loadMs = performance.now() - loadStart;
        loadTimes.push(loadMs);
        modelID = model.modelID;

        const buildStart = performance.now();
        if (mode === "null-worker") {
          const preparedModel = model as PreparedIfcModel;
          const response = await nullWorker!.build(preparedModel, collectPreparedTransferables(preparedModel));
          if (!response.ok) {
            throw new Error(response.error);
          }
          buildTimes.push(response.buildMs);
        } else {
          const result = buildIfcModel(model, scene, {
            autoCenter: true,
            mergeMeshes: true,
            doubleSided: true,
            generateNormals: false,
            verbose: false,
            freezeAfterBuild: true,
            usePBRMaterials: true,
          });
          await waitForSceneMeshCount(scene, result.meshes.length);
          const buildMs = performance.now() - buildStart;
          buildTimes.push(buildMs);
        }
      } finally {
        disposeIfcModel(scene);
        scene.dispose();
        if (modelID !== null) {
          await loader.closeIfcModel(modelID);
        }
      }

      totalTimes.push(performance.now() - runStart);
      logLine(`  ${mode} run ${i + 1}/${iterations} complete`);
    }
  } finally {
    await loader.dispose();
    nullWorker?.dispose();
    engine.dispose();
  }

  return {
    mode,
    initMs,
    medianLoadMs: median(loadTimes),
    medianBuildMs: median(buildTimes),
    coldStartTotalMs: initMs + (totalTimes[0] ?? 0),
    steadyStateTotalMs: median(totalTimes.length > 1 ? totalTimes.slice(1) : totalTimes),
  };
}

async function run(): Promise<void> {
  runButton.disabled = true;
  output.textContent = "";

  const iterations = Math.max(1, Math.min(10, Number(iterationsInput.value) || 3));
  const file = fileInput.files?.[0] ?? null;
  const source: IfcSource = file ?? "/test.ifc";
  const sourceLabel = file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : "/test.ifc";

  try {
    logLine(`Source: ${sourceLabel}`);
    logLine(`Iterations: ${iterations}`);
    logLine("");

    logLine("Running main-thread benchmark...");
    const mainThread = await benchmarkScenario("main-thread", source, iterations);
    logLine("");

    logLine("Running worker benchmark...");
    const worker = await benchmarkScenario("worker", source, iterations);
    logLine("");

    logLine("Running null-worker benchmark...");
    const nullWorker = await benchmarkScenario("null-worker", source, iterations);
    logLine("");

    const coldSpeedup = mainThread.coldStartTotalMs / worker.coldStartTotalMs;
    const steadyStateSpeedup = mainThread.steadyStateTotalMs / worker.steadyStateTotalMs;
    const coldSpeedupNull = mainThread.coldStartTotalMs / nullWorker.coldStartTotalMs;
    const steadyStateSpeedupNull = mainThread.steadyStateTotalMs / nullWorker.steadyStateTotalMs;
    logLine("Results (median):");
    logLine(
      `- main-thread: init=${mainThread.initMs.toFixed(2)}ms, load=${mainThread.medianLoadMs.toFixed(2)}ms, build=${mainThread.medianBuildMs.toFixed(2)}ms, cold_start_total=${mainThread.coldStartTotalMs.toFixed(2)}ms, steady_state_total=${mainThread.steadyStateTotalMs.toFixed(2)}ms`,
    );
    logLine(
      `- worker:      init=${worker.initMs.toFixed(2)}ms, load=${worker.medianLoadMs.toFixed(2)}ms, build=${worker.medianBuildMs.toFixed(2)}ms, cold_start_total=${worker.coldStartTotalMs.toFixed(2)}ms, steady_state_total=${worker.steadyStateTotalMs.toFixed(2)}ms`,
    );
    logLine(
      `- null-worker: init=${nullWorker.initMs.toFixed(2)}ms, load=${nullWorker.medianLoadMs.toFixed(2)}ms, build=${nullWorker.medianBuildMs.toFixed(2)}ms, cold_start_total=${nullWorker.coldStartTotalMs.toFixed(2)}ms, steady_state_total=${nullWorker.steadyStateTotalMs.toFixed(2)}ms`,
    );
    logLine(`- speedup cold-start (main-thread / worker): ${coldSpeedup.toFixed(2)}x`);
    logLine(`- speedup steady-state (main-thread / worker): ${steadyStateSpeedup.toFixed(2)}x`);
    logLine(`- speedup cold-start (main-thread / null-worker): ${coldSpeedupNull.toFixed(2)}x`);
    logLine(`- speedup steady-state (main-thread / null-worker): ${steadyStateSpeedupNull.toFixed(2)}x`);
  } catch (error) {
    logLine("");
    logLine(`Benchmark failed: ${String(error)}`);
    console.error(error);
  } finally {
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", () => {
  void run();
});
