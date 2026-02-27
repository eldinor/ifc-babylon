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

self.onmessage = (event: MessageEvent<NullBuildRequest>) => {
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

