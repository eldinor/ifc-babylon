// ============================================================================
// Test file for npm package - imports from babylon-ifc-loader via npm link
// ============================================================================

import * as WebIFC from "web-ifc";
import { createIfcLoader } from "babylon-ifc-loader";
import type { IfcLoader } from "babylon-ifc-loader";
import { buildIfcModel, disposeIfcModel, getModelBounds } from "babylon-ifc-loader";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  AbstractMesh,
  Color3,
  TransformNode,
} from "@babylonjs/core";

const VIEWER_CONFIG = {
  overlayAlpha: 0.3,
  camera: {
    radiusFromDiagonalMultiplier: 1.5,
    lowerRadiusFromDiagonalMultiplier: 0.3,
    upperRadiusFromDiagonalMultiplier: 5,
    wheelPrecisionFromDiagonalMultiplier: 0.01,
  },
} as const;

let ifcLoader: IfcLoader | null = null;
let currentIfcMeshes: AbstractMesh[] = [];
let currentModelID: number | null = null;
let currentRootNode: TransformNode | null = null;
let currentHighlightedMesh: AbstractMesh | null = null;

interface IfcMeshMetadata {
  expressID: number;
  modelID: number;
}

function isIfcMeshMetadata(metadata: unknown): metadata is IfcMeshMetadata {
  if (typeof metadata !== "object" || metadata === null) return false;
  const value = metadata as Partial<IfcMeshMetadata>;
  return typeof value.expressID === "number" && typeof value.modelID === "number";
}

let useWorker = true;

try {
  // In npm-link test mode, resolve wasm from node_modules.
  ifcLoader = createIfcLoader({ useWorker: useWorker });
  await ifcLoader.init("/node_modules/web-ifc/", WebIFC.LogLevel.LOG_LEVEL_ERROR);
  if (useWorker) {
    console.log("web-ifc worker initialized successfully");
  }
} catch (error) {
  console.error("Failed to initialize web-ifc worker:", error);
  ifcLoader = null;
  console.log("  The Babylon.js scene will still work, but IFC loading will not be available");
}

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

const setupPickingHandler = (scene: Scene, loader: IfcLoader) => {
  scene.onPointerDown = async (evt, pickResult) => {
    if (evt.button !== 0) return;

    if (pickResult.hit && pickResult.pickedMesh) {
      const pickedMesh = pickResult.pickedMesh;
      if (isIfcMeshMetadata(pickedMesh.metadata)) {
        const { expressID, modelID } = pickedMesh.metadata;

        try {
          const { element, typeName } = await loader.getElementData(modelID, expressID);
          const elementName = element.Name?.value || "Unnamed";

          if (currentHighlightedMesh) {
            currentHighlightedMesh.renderOverlay = false;
          }

          pickedMesh.renderOverlay = true;
          pickedMesh.overlayColor = Color3.Teal();
          pickedMesh.overlayAlpha = VIEWER_CONFIG.overlayAlpha;
          currentHighlightedMesh = pickedMesh;

          const upperText = document.getElementById("upper-text");
          if (upperText) {
            upperText.innerHTML = `<strong>${typeName}</strong> | ${elementName} | ID: ${expressID}`;
            upperText.style.display = "block";
          }
        } catch (error) {
          console.error("Failed to get element data:", error);
        }
      } else {
        hideUpperTextAndClearHighlight();
      }
    } else {
      hideUpperTextAndClearHighlight();
    }
  };
};

const hideUpperTextAndClearHighlight = () => {
  const upperText = document.getElementById("upper-text");
  if (upperText) {
    upperText.style.display = "none";
  }

  if (currentHighlightedMesh) {
    currentHighlightedMesh.renderOverlay = false;
    currentHighlightedMesh = null;
  }
};

const showProjectInfo = async (modelID: number) => {
  if (!ifcLoader) return;
  const projectInfo = await ifcLoader.getProjectInfo(modelID);
  const upperText = document.getElementById("upper-text");

  if (upperText) {
    const parts: string[] = [];
    if (projectInfo.projectName) parts.push(`<strong>Project: ${projectInfo.projectName}</strong>`);
    if (projectInfo.author) parts.push(`Author: ${projectInfo.author}`);
    if (projectInfo.application) parts.push(`App: ${projectInfo.application}`);
    if (parts.length > 0) {
      upperText.innerHTML = parts.join(" | ");
      upperText.style.display = "block";
    }
  }
};

const adjustCameraToMeshes = (meshes: AbstractMesh[], camera: ArcRotateCamera) => {
  if (meshes.length === 0) return;
  const bounds = getModelBounds(meshes);
  if (!bounds) return;

  camera.target = bounds.center;
  camera.radius = bounds.diagonal * VIEWER_CONFIG.camera.radiusFromDiagonalMultiplier;
  camera.alpha = -Math.PI / 4;
  camera.beta = Math.PI / 3;
  camera.lowerRadiusLimit = bounds.diagonal * VIEWER_CONFIG.camera.lowerRadiusFromDiagonalMultiplier;
  camera.upperRadiusLimit = bounds.diagonal * VIEWER_CONFIG.camera.upperRadiusFromDiagonalMultiplier;
  camera.wheelPrecision = bounds.diagonal * VIEWER_CONFIG.camera.wheelPrecisionFromDiagonalMultiplier;
};

const loadIfc = async (scene: Scene, source: string | File) => {
  if (!ifcLoader) throw new Error("IFC loader not initialized");

  const model = await ifcLoader.loadIfcModel(source, {
    coordinateToOrigin: true,
    verbose: true,
  });

  const { meshes, rootNode, stats } = buildIfcModel(model, scene, {
    autoCenter: true,
    mergeMeshes: true,
    doubleSided: true,
    generateNormals: false,
    verbose: true,
    freezeAfterBuild: true,
    usePBRMaterials: true,
  });

  return { meshes, rootNode, modelID: model.modelID, stats };
};

const createScene = async (): Promise<Scene> => {
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 1;
  camera.upperRadiusLimit = 1000;
  camera.wheelPrecision = 10;

  const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
  light.intensity = 0.7;
  light.setEnabled(true);

  if (ifcLoader) {
    setupPickingHandler(scene, ifcLoader);
    try {
      const { meshes, modelID, rootNode } = await loadIfc(scene, "/test.ifc");
      currentIfcMeshes = meshes;
      currentModelID = modelID;
      currentRootNode = rootNode;
      await showProjectInfo(modelID);
      adjustCameraToMeshes(meshes, camera);
    } catch (error) {
      console.error("Failed to load initial IFC file:", error);
    }
  }

  return scene;
};

const scene = await createScene();
engine.runRenderLoop(() => scene.render());

window.addEventListener("resize", () => {
  engine.resize();
});

window.addEventListener("beforeunload", () => {
  if (ifcLoader) {
    void ifcLoader.dispose();
  }
});

if (ifcLoader) {
  canvas.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.style.opacity = "0.5";
    canvas.style.border = "2px dashed #00aaff";
  });

  canvas.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.style.opacity = "1";
    canvas.style.border = "none";
  });

  canvas.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.style.opacity = "1";
    canvas.style.border = "none";

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".ifc")) return;

    try {
      if (currentIfcMeshes.length > 0 || currentModelID !== null || currentRootNode !== null) {
        disposeIfcModel(scene);
        if (currentModelID !== null && ifcLoader) {
          await ifcLoader.closeIfcModel(currentModelID);
        }
        currentIfcMeshes = [];
        currentModelID = null;
        currentRootNode = null;
      }

      hideUpperTextAndClearHighlight();
      const { meshes, modelID, rootNode } = await loadIfc(scene, file);
      currentIfcMeshes = meshes;
      currentModelID = modelID;
      currentRootNode = rootNode;
      await showProjectInfo(modelID);

      const camera = scene.activeCamera as ArcRotateCamera;
      if (camera) adjustCameraToMeshes(meshes, camera);
    } catch (error) {
      console.error("Failed to load IFC file:", error);
      alert(`Failed to load IFC file: ${error}`);
    }
  });
}

if (import.meta.env.DEV) {
  let inspectorLoaded = false;
  window.addEventListener("keydown", async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyI") {
      e.preventDefault();
      if (!inspectorLoaded) {
        try {
          await import("@babylonjs/inspector");
          inspectorLoaded = true;
        } catch (error) {
          console.error("Failed to load Babylon Inspector:", error);
          return;
        }
      }
      if (scene.debugLayer.isVisible()) {
        scene.debugLayer.hide();
      } else {
        await scene.debugLayer.show({ embedMode: false });
      }
    }
  });
}
