/**
 * IFC Viewer using the ifcLoader plugin
 *
 * This file demonstrates using the high-level IFC loader plugin API
 * instead of the manual two-step approach (ifcInit + ifcModel).
 */
import { loadIfc, disposeIfc, configureIfcLoader, getWebIfcAPI } from "./ifcLoader";
import type { IfcLoaderResult } from "./ifcLoader";
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, AbstractMesh, Color3 } from "@babylonjs/core";

// Configure the IFC loader before any loading
configureIfcLoader({
  wasmPath: "./",
  defaultLoadOptions: {
    coordinateToOrigin: true,
    verbose: true,
    mergeMeshes: true,
    autoCenter: true,
    doubleSided: true,
    freezeAfterBuild: true,
  },
});

// Store currently loaded model data for cleanup
let currentResult: IfcLoaderResult | null = null;

// Store currently highlighted mesh
let currentHighlightedMesh: AbstractMesh | null = null;

// Get the canvas element
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

// Create the Babylon.js engine
const engine = new Engine(canvas, true);

/**
 * Setup picking handler for IFC elements
 */
const setupPickingHandler = (scene: Scene) => {
  scene.onPointerDown = async (evt, pickResult) => {
    // Only handle left click
    if (evt.button !== 0) return;

    if (pickResult.hit && pickResult.pickedMesh) {
      const pickedMesh = pickResult.pickedMesh;
      const metadata = pickedMesh.metadata;

      if (metadata && metadata.expressID !== undefined && metadata.modelID !== undefined) {
        const expressID = metadata.expressID;
        const modelID = metadata.modelID;

        console.log(`\n🎯 Picked IFC Element:`);
        console.log(`  Mesh: ${pickedMesh.name}`);
        console.log(`  Express ID: ${expressID}`);
        console.log(`  Model ID: ${modelID}`);

        try {
          // Get the web-ifc API instance for element querying
          const ifcAPI = await getWebIfcAPI();

          // Fetch FULL element data — includes ALL properties
          const element = ifcAPI.GetLine(modelID, expressID, true);
          // Get the IFC type name (e.g., "IFCWALL", "IFCDOOR", etc.)
          const typeName = ifcAPI.GetNameFromTypeCode(element.type);
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
          pickedMesh.overlayAlpha = 0.3;
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
const showProjectInfo = (result: IfcLoaderResult) => {
  const upperText = document.getElementById("upper-text");

  if (upperText) {
    const parts: string[] = [];

    if (result.projectInfo.projectName) {
      parts.push(`<strong>Project: ${result.projectInfo.projectName}</strong>`);
    }
    if (result.projectInfo.author) {
      parts.push(`Author: ${result.projectInfo.author}`);
    }
    if (result.projectInfo.application) {
      parts.push(`App: ${result.projectInfo.application}`);
    }

    if (parts.length > 0) {
      upperText.innerHTML = parts.join(" | ");
      upperText.style.display = "block";
    }
  }

  console.log("\n📋 IFC Project Info:");
  console.log(`  Project: ${result.projectInfo.projectName || "N/A"}`);
  console.log(`  Description: ${result.projectInfo.projectDescription || "N/A"}`);
  console.log(`  Application: ${result.projectInfo.application || "N/A"}`);
  console.log(`  Author: ${result.projectInfo.author || "N/A"}`);
  console.log(`  Organization: ${result.projectInfo.organization || "N/A"}`);
};

/**
 * Helper function to adjust camera to view meshes
 */
const adjustCameraToMeshes = (result: IfcLoaderResult, camera: ArcRotateCamera) => {
  if (!result.bounds) {
    console.warn("Could not calculate model bounds");
    return;
  }

  const bounds = result.bounds;

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
  camera.radius = bounds.diagonal * 1.5;

  // Set a nice isometric view angle
  camera.alpha = -Math.PI / 4; // 45 degrees around Y axis
  camera.beta = Math.PI / 3; // 60 degrees from horizontal

  // Ensure camera limits are appropriate
  camera.lowerRadiusLimit = bounds.diagonal * 0.3;
  camera.upperRadiusLimit = bounds.diagonal * 5;
  camera.wheelPrecision = bounds.diagonal * 0.01;

  console.log(`  Camera positioned: radius=${camera.radius.toFixed(2)}`);
};

/**
 * Load an IFC file using the loader plugin
 */
const loadIfcFile = async (scene: Scene, source: string | File): Promise<IfcLoaderResult> => {
  console.log(`\n📦 Loading IFC file using ifcLoader plugin...`);

  const result = await loadIfc(source, scene);

  console.log(`\n✓ IFC loaded successfully`);
  console.log(`  ${result.meshes.length} meshes, ${result.rawModel.rawStats.triangleCount.toLocaleString()} triangles`);
  console.log(`  Build time: ${result.stats.buildTimeMs.toFixed(2)}ms`);

  return result;
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
  light.intensity = 0.7;

  // Setup picking handler for IFC elements
  setupPickingHandler(scene);

  // Try to load initial IFC file
  try {
    const result = await loadIfcFile(scene, "/test.ifc");

    currentResult = result;

    // Log root node information
    if (result.rootNode) {
      console.log(
        `  Model root node: ${result.rootNode.name} with ${result.rootNode.getChildMeshes().length} child meshes`,
      );
    }

    console.log(`✓ Loaded ${result.meshes.length} IFC meshes (Model ID: ${result.modelID})`);

    // Show project info in upper text
    showProjectInfo(result);

    // Adjust camera to view the loaded model
    if (result.meshes.length > 0) {
      adjustCameraToMeshes(result, camera);
    }
  } catch (error) {
    console.error("Failed to load initial IFC file:", error);
    console.log("  You can drag and drop an IFC file to load it");
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

// Add drag-and-drop functionality for IFC files
// Prevent default drag behavior
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
    console.log(`\n📦 Loading dropped file: ${file.name}`);

    // Dispose of previously loaded model
    if (currentResult) {
      console.log(`  Cleaning up previous model...`);
      console.log(`  Disposing root node: ${currentResult.rootNode.name}`);

      // Use the convenience dispose function
      disposeIfc(scene, currentResult.modelID);
      currentResult = null;
    }

    // Hide upper text and clear highlight when loading new model
    hideUpperTextAndClearHighlight();

    // Load the new IFC file using the loader plugin
    const result = await loadIfcFile(scene, file);

    currentResult = result;

    // Log hierarchy information
    if (result.rootNode) {
      console.log(`Child meshes: ${result.rootNode.getChildMeshes().length}`);
    }

    // Show project info in upper text
    showProjectInfo(result);

    // Adjust camera to view the loaded model
    const camera = scene.activeCamera as ArcRotateCamera;
    if (camera) {
      adjustCameraToMeshes(result, camera);
    }

    console.log(`✅ Successfully loaded ${file.name}`);
    console.log(`  Statistics: ${result.meshes.length} meshes, ${result.stats.buildTimeMs.toFixed(2)}ms\n`);
  } catch (error) {
    console.error("Failed to load IFC file:", error);
    alert(`Failed to load IFC file: ${error}`);
  }
});

// Add a reset camera button or functionality (optional)
//@ts-ignore
const resetCamera = () => {
  if (currentResult) {
    const camera = scene.activeCamera as ArcRotateCamera;
    if (camera) {
      adjustCameraToMeshes(currentResult, camera);
      console.log("Camera reset to view full model");
    }
  }
};

// Track inspector state for toggle functionality
let inspectorLoaded = false;

// Add Ctrl+I keyboard shortcut to toggle Babylon Inspector
window.addEventListener("keydown", async (e) => {
  // Check for Ctrl+I (or Cmd+I on Mac)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
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
