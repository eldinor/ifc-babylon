import * as WebIFC from "web-ifc";
import { buildIfcModel, disposeIfcModel, getModelBounds } from "./ifcModel";
import { IfcWorkerClient } from "./ifcWorkerClient";
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
  environmentTextureLevel: 0.7,
  camera: {
    radiusFromDiagonalMultiplier: 1.5,
    lowerRadiusFromDiagonalMultiplier: 0.3,
    upperRadiusFromDiagonalMultiplier: 5,
    wheelPrecisionFromDiagonalMultiplier: 0.01,
  },
} as const;

// Initialize web-ifc worker client
let ifcWorker: IfcWorkerClient | null = null;

// Store currently loaded meshes and model ID for cleanup when loading new files
let currentIfcMeshes: AbstractMesh[] = [];
let currentModelID: number | null = null;
let currentRootNode: TransformNode | null = null;

// Store currently highlighted mesh
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

try {
  // Set WASM path to "./" so web-ifc can find web-ifc.wasm in production
  // In dev, Vite serves from node_modules; in prod, vite-plugin-static-copy puts it at dist root
  ifcWorker = new IfcWorkerClient();
  await ifcWorker.init("/", WebIFC.LogLevel.LOG_LEVEL_ERROR);
  console.log("web-ifc worker initialized successfully");
} catch (error) {
  console.error("Failed to initialize web-ifc worker:", error);
  ifcWorker = null;
  console.log("  The Babylon.js scene will still work, but IFC loading will not be available");
}

// Get the canvas element
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

// Create the Babylon.js engine
const engine = new Engine(canvas, true);

/**
 * Setup picking handler for IFC elements
 */
const setupPickingHandler = (scene: Scene, worker: IfcWorkerClient) => {
  scene.onPointerDown = async (evt, pickResult) => {
    // Only handle left click
    if (evt.button !== 0) return;

    if (pickResult.hit && pickResult.pickedMesh) {
      const pickedMesh = pickResult.pickedMesh;
      if (isIfcMeshMetadata(pickedMesh.metadata)) {
        const metadata = pickedMesh.metadata;
        const expressID = metadata.expressID;
        const modelID = metadata.modelID;

        console.log(`\nPicked IFC Element:`);
        console.log(`  Mesh: ${pickedMesh.name}`);
        console.log(`  Express ID: ${expressID}`);
        console.log(`  Model ID: ${modelID}`);

        try {
          const { element, typeName } = await worker.getElementData(modelID, expressID);
          console.log(`  Element type name:`, typeName);
          console.log(`  Element data:`, element);
          console.log(`  Element type:`, element.type);

          // Safely access Name property
          const elementName = element.Name?.value || "Unnamed";
          console.log(`  Element name:`, elementName);

          // Remove previous highlight
          if (currentHighlightedMesh) {
            currentHighlightedMesh.renderOverlay = false;
          }

          // Add teal overlay to picked mesh
          pickedMesh.renderOverlay = true;
          pickedMesh.overlayColor = Color3.Teal();
          pickedMesh.overlayAlpha = VIEWER_CONFIG.overlayAlpha;
          currentHighlightedMesh = pickedMesh;

          // Update upper text with element info
          const upperText = document.getElementById("upper-text");
          if (upperText) {
            upperText.innerHTML = `<strong>${typeName}</strong> | ${elementName} | ID: ${expressID}`;
            upperText.style.display = "block";
          }
        } catch (error) {
          console.error(`  Failed to get element data:`, error);
        }
      } else {
        // Clicked on mesh without IFC metadata - hide upper text and remove highlight
        hideUpperTextAndClearHighlight();
      }
    } else {
      // Clicked outside the model - hide upper text and remove highlight
      hideUpperTextAndClearHighlight();
    }
  };
};

/**
 * Helper function to hide upper text and clear highlight
 */
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

/**
 * Helper function to show project info in upper text
 */
const showProjectInfo = async (modelID: number) => {
  if (!ifcWorker) return;

  const projectInfo = await ifcWorker.getProjectInfo(modelID);
  const upperText = document.getElementById("upper-text");

  if (upperText) {
    const parts: string[] = [];

    if (projectInfo.projectName) {
      parts.push(`<strong>Project: ${projectInfo.projectName}</strong>`);
    }
    if (projectInfo.author) {
      parts.push(`Author: ${projectInfo.author}`);
    }
    /*
    if (projectInfo.organization) {
      parts.push(`Org: ${projectInfo.organization}`);
    }
      */
    if (projectInfo.application) {
      parts.push(`App: ${projectInfo.application}`);
    }

    if (parts.length > 0) {
      upperText.innerHTML = parts.join(" | ");
      upperText.style.display = "block";
    }
  }

  console.log("\nIFC Project Info:");
  console.log(`  Project: ${projectInfo.projectName || "N/A"}`);
  console.log(`  Description: ${projectInfo.projectDescription || "N/A"}`);
  console.log(`  Application: ${projectInfo.application || "N/A"}`);
  console.log(`  Author: ${projectInfo.author || "N/A"}`);
  console.log(`  Organization: ${projectInfo.organization || "N/A"}`);
};

/**
 * Helper function to adjust camera to view meshes
 */
const adjustCameraToMeshes = (meshes: AbstractMesh[], camera: ArcRotateCamera) => {
  if (meshes.length === 0) return;

  // Get model bounds
  const bounds = getModelBounds(meshes);

  if (!bounds) {
    console.warn("Could not calculate model bounds");
    return;
  }

  console.log(
    `  Model center: (${bounds.center.x.toFixed(2)}, ${bounds.center.y.toFixed(2)}, ${bounds.center.z.toFixed(2)})`,
  );
  console.log(`  Model diagonal: ${bounds.diagonal.toFixed(2)}`);
  console.log(
    `  Bounds: X[${bounds.min.x.toFixed(2)}, ${bounds.max.x.toFixed(2)}], ` +
      `Y[${bounds.min.y.toFixed(2)}, ${bounds.max.y.toFixed(2)}], ` +
      `Z[${bounds.min.z.toFixed(2)}, ${bounds.max.z.toFixed(2)}]`,
  );

  // Position camera to view the entire model with a good perspective
  camera.target = bounds.center;

  // Set radius based on model diagonal with some margin
  camera.radius = bounds.diagonal * VIEWER_CONFIG.camera.radiusFromDiagonalMultiplier;

  // Set a nice isometric view angle
  camera.alpha = -Math.PI / 4; // 45 degrees around Y axis
  camera.beta = Math.PI / 3; // 60 degrees from horizontal

  // Ensure camera limits are appropriate
  camera.lowerRadiusLimit = bounds.diagonal * VIEWER_CONFIG.camera.lowerRadiusFromDiagonalMultiplier;
  camera.upperRadiusLimit = bounds.diagonal * VIEWER_CONFIG.camera.upperRadiusFromDiagonalMultiplier;
  camera.wheelPrecision = bounds.diagonal * VIEWER_CONFIG.camera.wheelPrecisionFromDiagonalMultiplier;

  console.log(`  Camera positioned: radius=${camera.radius.toFixed(2)}`);
};

/**
 * Load an IFC file using the new two-step API
 */
const loadIfc = async (scene: Scene, source: string | File) => {
  if (!ifcWorker) {
    throw new Error("IFC worker not initialized");
  }

  console.log(`\nLoading IFC file...`);

  // Step 1: Load and prepare IFC model geometry in worker
  const model = await ifcWorker.loadPreparedIfcModel(
    source,
    {
      coordinateToOrigin: true,
      verbose: true,
    },
    {
      mergeMeshes: true,
      generateNormals: false,
    },
  );

  // Step 2: Build Babylon.js scene (Babylon only)
  const { meshes, rootNode, stats } = buildIfcModel(model, scene, {
    autoCenter: true,
    mergeMeshes: true,
    doubleSided: true,
    generateNormals: false,
    verbose: true,
    freezeAfterBuild: true,
    usePBRMaterials: true,
  });

  console.log(`\nIFC loaded successfully`);
  console.log(`  ${meshes.length} meshes`);

  return { meshes, rootNode, modelID: model.modelID, stats };
};

/**
 * Create the scene
 */
const createScene = async (): Promise<Scene> => {
  // Create a basic scene
  const scene = new Scene(engine);

  // Create a camera with initial position
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);

  // Set some reasonable camera limits (will be updated when model loads)
  camera.lowerRadiusLimit = 1;
  camera.upperRadiusLimit = 1000;
  camera.wheelPrecision = 10;

  // Create a light
  const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
  light.intensity = 0.01;
  light.setEnabled(false);

  // Setup environment for PBR materials if needed

  if (!scene.environmentTexture) {
    scene.createDefaultEnvironment({ createGround: false, createSkybox: false });
    scene.environmentTexture!.level = VIEWER_CONFIG.environmentTextureLevel;
  }

  // Setup picking handler for IFC elements (if API is available)
  if (ifcWorker) {
    setupPickingHandler(scene, ifcWorker);
  }

  // After creating the scene, try to load initial IFC file
  if (ifcWorker) {
    try {
      const { meshes, modelID, rootNode, stats } = await loadIfc(scene, "/test.ifc");

      currentIfcMeshes = meshes;
      currentModelID = modelID;
      currentRootNode = rootNode;

      // Log root node information to actually use it
      if (rootNode) {
        console.log(`  Model root node: ${rootNode.name} with ${rootNode.getChildMeshes().length} child meshes`);
      }

      console.log(`Loaded ${currentIfcMeshes.length} IFC meshes (Model ID: ${modelID})`);
      console.log(`  Build time: ${stats.buildTimeMs.toFixed(2)}ms`);

      // Show project info in upper text
      await showProjectInfo(modelID);

      // Adjust camera to view the loaded model
      if (currentIfcMeshes.length > 0) {
        adjustCameraToMeshes(currentIfcMeshes, camera);
      }
    } catch (error) {
      console.error("Failed to load initial IFC file:", error);
      console.log("  You can drag and drop an IFC file to load it");
    }
  }

  console.log(scene);

  return scene;
};

// Create the scene
const scene = await createScene();

// Run the render loop
engine.runRenderLoop(() => {
  scene.render();
});

// Handle window resize
window.addEventListener("resize", () => {
  engine.resize();
});

window.addEventListener("beforeunload", () => {
  if (ifcWorker) {
    void ifcWorker.dispose();
  }
});

// Add drag-and-drop functionality for IFC files
if (ifcWorker) {
  // Prevent default drag behaviorshowProjectInfo
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

  // Handle file drop
  canvas.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.style.opacity = "1";
    canvas.style.border = "none";

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Check if it's an IFC file
    if (!file.name.toLowerCase().endsWith(".ifc")) {
      console.error("Please drop an IFC file (.ifc extension)");
      alert("Please drop an IFC file (.ifc extension)");
      return;
    }

    try {
      console.log(`\nLoading dropped file: ${file.name}`);

      // Dispose of previously loaded model
      if (currentIfcMeshes.length > 0 || currentModelID !== null || currentRootNode !== null) {
        console.log(`  Cleaning up previous model...`);

        // Log root node info before disposal
        if (currentRootNode) {
          console.log(`  Disposing root node: ${currentRootNode.name}`);
        }

        // Dispose all meshes, materials, and the ifc-root node
        disposeIfcModel(scene);

        // Close the IFC model and free WASM memory
        if (currentModelID !== null) {
          await ifcWorker.closeIfcModel(currentModelID);
        }

        currentIfcMeshes = [];
        currentModelID = null;
        currentRootNode = null;
      }

      // Hide upper text and clear highlight when loading new model
      hideUpperTextAndClearHighlight();

      // Load the new IFC file using two-step API
      const { meshes, modelID, rootNode, stats } = await loadIfc(scene, file);

      currentIfcMeshes = meshes;
      currentModelID = modelID;
      currentRootNode = rootNode;

      // Use rootNode for additional setup if needed
      if (rootNode) {
        // Log hierarchy information
        console.log(`Child meshes: ${rootNode.getChildMeshes().length}`);
      }

      // Show project info in upper text
      await showProjectInfo(modelID);

      // Adjust camera to view the loaded model
      const camera = scene.activeCamera as ArcRotateCamera;
      if (camera) {
        adjustCameraToMeshes(meshes, camera);
      }

      console.log(`Successfully loaded ${file.name}`);
      console.log(`  Statistics: ${meshes.length} meshes, ${stats.buildTimeMs.toFixed(2)}ms\n`);
    } catch (error) {
      console.error("Failed to load IFC file:", error);
      alert(`Failed to load IFC file: ${error}`);
    }
  });
}

// Add a reset camera button or functionality (optional)
const resetCamera = () => {
  if (currentIfcMeshes.length > 0) {
    const camera = scene.activeCamera as ArcRotateCamera;
    if (camera) {
      adjustCameraToMeshes(currentIfcMeshes, camera);
      console.log("Camera reset to view full model");
    }
  }
};

if (import.meta.env.DEV) {
  // Track inspector state for toggle functionality
  let inspectorLoaded = false;

  // Add Ctrl+I keyboard shortcut to toggle Babylon Inspector
  window.addEventListener("keydown", async (e) => {
    // Check for Ctrl+I (or Cmd+I on Mac) - use e.code for keyboard layout independence
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyI") {
      e.preventDefault();

      // Dynamically import the inspector if not already loaded
      if (!inspectorLoaded) {
        try {
          await import("@babylonjs/inspector");
          inspectorLoaded = true;
        } catch (error) {
          console.error("Failed to load Babylon Inspector:", error);
          return;
        }
      }

      // Toggle inspector visibility using scene.debugLayer
      if (scene.debugLayer.isVisible()) {
        scene.debugLayer.hide();
        console.log("Inspector hidden");
      } else {
        await scene.debugLayer.show({ embedMode: false });
        console.log("Inspector shown");
      }
    }
  });
}
