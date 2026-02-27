/// <reference lib="webworker" />
import { NullEngine, Scene } from "@babylonjs/core";
import { buildIfcModel, disposeIfcModel } from "../src/index";
import type { PreparedIfcModel, RawIfcModel } from "../src/index";

type NullBuildRequest = {
  id: number;
  type: "build";
  model: RawIfcModel | PreparedIfcModel;
};

type NullBuildResponse =
  | {
      id: number;
      ok: true;
      buildMs: number;
      meshCount: number;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

const engine = new NullEngine();

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

self.onmessage = async (event: MessageEvent<NullBuildRequest>) => {
  const message = event.data;

  if (message.type !== "build") return;

  try {
    const scene = new Scene(engine);
    const start = performance.now();
    const result = buildIfcModel(message.model, scene, {
      autoCenter: true,
      mergeMeshes: true,
      doubleSided: true,
      generateNormals: false,
      verbose: false,
      freezeAfterBuild: true,
      usePBRMaterials: true,
    });
    await waitForSceneMeshCount(scene, result.meshes.length);
    const buildMs = performance.now() - start;

    disposeIfcModel(scene);
    scene.dispose();

    const response: NullBuildResponse = {
      id: message.id,
      ok: true,
      buildMs,
      meshCount: result.meshes.length,
    };
    self.postMessage(response);
  } catch (error) {
    const response: NullBuildResponse = {
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
