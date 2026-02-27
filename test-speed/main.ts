import * as WebIFC from "web-ifc";
import { NullEngine, Scene } from "@babylonjs/core";
import { createIfcLoader, buildIfcModel, disposeIfcModel } from "../src/index";

type IfcSource = string | File;
type MergeMode = "by-express-color" | "by-color" | "two-material";
type Backend = "worker" | "main-thread";

interface BenchResult {
  backend: Backend;
  mergeMode: MergeMode;
  initMs: number;
  medianLoadMs: number;
  medianBuildMs: number;
  medianTotalMs: number;
  medianMeshCount: number;
  medianMaterialCount: number;
  medianMemoryBytes: number;
  medianTransferBytes: number;
  medianMapBytes: number;
  medianOpaqueMeshCount: number;
  medianTransparentMeshCount: number;
}

const output = document.getElementById("output") as HTMLPreElement;
const runButton = document.getElementById("run-btn") as HTMLButtonElement;
const iterationsInput = document.getElementById("iterations") as HTMLInputElement;
const fileInput = document.getElementById("ifc-file") as HTMLInputElement;
const MODES: MergeMode[] = ["by-express-color", "by-color", "two-material"];

function logLine(line: string): void {
  output.textContent += `${line}\n`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

function renderTable(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, index) => {
    let max = header.length;
    for (const row of rows) {
      max = Math.max(max, row[index]?.length ?? 0);
    }
    return max;
  });

  const formatRow = (row: string[]) => `| ${row.map((cell, i) => pad(cell, widths[i])).join(" | ")} |`;
  const separator = `|-${widths.map((width) => "-".repeat(width)).join("-|-")}-|`;

  return [formatRow(headers), separator, ...rows.map((row) => formatRow(row))];
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

async function benchmarkMode(
  backend: Backend,
  mergeMode: MergeMode,
  source: IfcSource,
  iterations: number,
): Promise<BenchResult> {
  const loader = createIfcLoader({ useWorker: backend === "worker" });
  const engine = new NullEngine();

  const initStart = performance.now();
  await initLoaderWithFallback(loader);
  const initMs = performance.now() - initStart;

  const loadTimes: number[] = [];
  const buildTimes: number[] = [];
  const totalTimes: number[] = [];
  const meshCounts: number[] = [];
  const materialCounts: number[] = [];
  const memoryBytes: number[] = [];
  const transferBytes: number[] = [];
  const mapBytes: number[] = [];
  const opaqueMeshCounts: number[] = [];
  const transparentMeshCounts: number[] = [];

  try {
    for (let i = 0; i < iterations; i++) {
      const runStart = performance.now();
      const scene = new Scene(engine);

      let modelID: number | null = null;
      try {
        const loadStart = performance.now();
        const model = await loader.loadPreparedIfcModel(
          source,
          { coordinateToOrigin: true, verbose: false },
          {
            mergeMode,
            generateNormals: false,
            includeElementMap: true,
          },
        );
        const loadMs = performance.now() - loadStart;
        loadTimes.push(loadMs);
        modelID = model.modelID;
        memoryBytes.push(model.telemetry.geometryBytes + model.telemetry.elementMapBytes);
        transferBytes.push(model.telemetry.transferBytes);
        mapBytes.push(model.telemetry.elementMapBytes);
        opaqueMeshCounts.push(model.telemetry.opaqueMeshCount);
        transparentMeshCounts.push(model.telemetry.transparentMeshCount);

        const buildStart = performance.now();
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
        meshCounts.push(result.stats.finalMeshCount);
        materialCounts.push(result.stats.materialCount);
      } finally {
        disposeIfcModel(scene);
        scene.dispose();
        if (modelID !== null) {
          if (modelID >= 0) {
            await loader.closeIfcModel(modelID);
          }
        }
      }

      totalTimes.push(performance.now() - runStart);
      logLine(`  ${mergeMode} run ${i + 1}/${iterations} complete`);
    }
  } finally {
    await loader.dispose();
    engine.dispose();
  }

  return {
    backend,
    mergeMode,
    initMs,
    medianLoadMs: median(loadTimes),
    medianBuildMs: median(buildTimes),
    medianTotalMs: median(totalTimes),
    medianMeshCount: median(meshCounts),
    medianMaterialCount: median(materialCounts),
    medianMemoryBytes: median(memoryBytes),
    medianTransferBytes: median(transferBytes),
    medianMapBytes: median(mapBytes),
    medianOpaqueMeshCount: median(opaqueMeshCounts),
    medianTransparentMeshCount: median(transparentMeshCounts),
  };
}

async function run(): Promise<void> {
  runButton.disabled = true;
  output.textContent = "";

  const iterations = Math.max(1, Math.min(10, Number(iterationsInput.value) || 3));
  const file = fileInput.files?.[0] ?? null;
  const source: IfcSource = file ?? "/test.ifc";
  const fileName = file ? file.name : "/test.ifc";
  const fileSizeLabel = file ? formatBytes(file.size) : "N/A (URL)";
  const backends: Backend[] = ["main-thread", "worker"];

  try {
    logLine(`Source: ${fileName}`);
    logLine(`File size: ${fileSizeLabel}`);
    logLine(`Iterations: ${iterations}`);
    logLine(`Benchmark backend: main-thread + worker`);
    logLine("");

    const results: BenchResult[] = [];
    for (const backend of backends) {
      for (const mergeMode of MODES) {
        logLine(`Running ${backend} / ${mergeMode} benchmark...`);
        const result = await benchmarkMode(backend, mergeMode, source, iterations);
        results.push(result);
        logLine("");
      }
    }
    const mainThreadByMode = new Map<MergeMode, BenchResult>();
    for (const result of results) {
      if (result.backend === "main-thread" && !mainThreadByMode.has(result.mergeMode)) {
        mainThreadByMode.set(result.mergeMode, result);
      }
    }

    const headers = [
      "filename",
      "filesize",
      "backend",
      "mode",
      "load ms",
      "build ms",
      "total ms",
      "meshes",
      "materials",
      "memory",
      "transfer",
      "map",
      "opaque",
      "transparent",
      "speedup vs main",
    ];
    const rows = results.map((result) => {
      const modeBaseline = mainThreadByMode.get(result.mergeMode) ?? result;
      const relativeSpeed = modeBaseline.medianTotalMs / result.medianTotalMs;
      return [
        fileName,
        fileSizeLabel,
        result.backend,
        result.mergeMode,
        result.medianLoadMs.toFixed(2),
        result.medianBuildMs.toFixed(2),
        result.medianTotalMs.toFixed(2),
        result.medianMeshCount.toFixed(0),
        result.medianMaterialCount.toFixed(0),
        formatBytes(result.medianMemoryBytes),
        formatBytes(result.medianTransferBytes),
        formatBytes(result.medianMapBytes),
        result.medianOpaqueMeshCount.toFixed(0),
        result.medianTransparentMeshCount.toFixed(0),
        `${relativeSpeed.toFixed(2)}x`,
      ];
    });
    logLine("Results (median):");
    logLine("");
    for (const line of renderTable(headers, rows)) {
      logLine(line);
    }
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
