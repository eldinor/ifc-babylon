import {
  initializeWebIFC,
  loadAndRenderIfc,
  disposeIfcScene,
  cleanupIfcModel,
  getModelBounds,
  // centerModelAtOrigin,
} from "./ifcLoader";
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
import { ShowInspector } from "@babylonjs/inspector";

// Initialize web-ifc API
let ifcAPI: any = null;

// Store currently loaded meshes and model ID for cleanup when loading new files
let currentIfcMeshes: AbstractMesh[] = [];
let currentModelID: number | null = null;
// @ts-ignore
let currentRootNode: TransformNode | null = null;

// Store currently highlighted mesh
let currentHighlightedMesh: AbstractMesh | null = null;

try {
  // Set WASM path to "./" so web-ifc can find web-ifc.wasm in production
  // In dev, Vite serves from node_modules; in prod, vite-plugin-static-copy puts it at dist root
  ifcAPI = await initializeWebIFC("./");
  console.log("✓ web-ifc initialized successfully!");
} catch (error) {
  console.error("⚠ Failed to initialize web-ifc:", error);
  console.log("  The Babylon.js scene will still work, but IFC loading will not be available");
}

// Get the canvas element
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

// Create the Babylon.js engine
const engine = new Engine(canvas, true);

/**
 * Setup picking handler for IFC elements
 */
const setupPickingHandler = (scene: Scene, ifcAPI: any) => {
  scene.onPointerDown = (evt, pickResult) => {
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
 * Helper function to calculate bounds manually (fallback method)
 * Now matches the return type of getModelBounds
 */
const calculateBoundsManually = (
  meshes: AbstractMesh[],
): { min: Vector3; max: Vector3; center: Vector3; size: Vector3; diagonal: number } | null => {
  if (meshes.length === 0) return null;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let validBoundsFound = false;

  meshes.forEach((mesh) => {
    if (!mesh.isVisible || mesh.getTotalVertices() === 0) return;

    // Get vertices in world space
    const vertices = mesh.getVerticesData("position");
    if (!vertices) return;

    const worldMatrix = mesh.getWorldMatrix();

    for (let i = 0; i < vertices.length; i += 3) {
      const localPoint = new Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
      const worldPoint = Vector3.TransformCoordinates(localPoint, worldMatrix);

      minX = Math.min(minX, worldPoint.x);
      minY = Math.min(minY, worldPoint.y);
      minZ = Math.min(minZ, worldPoint.z);
      maxX = Math.max(maxX, worldPoint.x);
      maxY = Math.max(maxY, worldPoint.y);
      maxZ = Math.max(maxZ, worldPoint.z);

      validBoundsFound = true;
    }
  });

  if (!validBoundsFound) return null;

  const min = new Vector3(minX, minY, minZ);
  const max = new Vector3(maxX, maxY, maxZ);
  const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
  const diagonal = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z);

  return { min, max, center, size, diagonal };
};

/**
 * Helper function to adjust camera to view meshes
 */
const adjustCameraToMeshes = (meshes: AbstractMesh[], camera: ArcRotateCamera) => {
  if (meshes.length === 0) return;

  // Try to use the getModelBounds function first
  let bounds = getModelBounds(meshes);

  // If that fails, use manual calculation
  if (!bounds) {
    console.log("  Using manual bounds calculation...");
    bounds = calculateBoundsManually(meshes);
  }

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

  // Setup picking handler for IFC elements (if API is available)
  if (ifcAPI) {
    setupPickingHandler(scene, ifcAPI);
  }

  // After creating the scene, try to load initial IFC file
  if (ifcAPI) {
    try {
      console.log("\n📦 Loading initial IFC file: /test.ifc");

      // Load the IFC file with auto-centering enabled
      const {
        meshes: initialMeshes,
        modelID,
        rootNode,
        stats,
      } = await loadAndRenderIfc(ifcAPI, "/test.ifc", scene, {
        autoCenter: true, // Auto-center the model at origin
        verbose: true, // Show detailed loading information
        generateNormals: false,
        coordinateToOrigin: true,
      });

      currentIfcMeshes = initialMeshes;
      currentModelID = modelID;
      currentRootNode = rootNode;

      console.log(`✓ Loaded ${currentIfcMeshes.length} IFC meshes (Model ID: ${modelID})`);
      console.log(`  Load time: ${stats.loadTimeMs.toFixed(2)}ms`);
      console.log(`  Triangles: ${stats.triangleCount.toLocaleString()}`);

      // Adjust camera to view the loaded model
      if (currentIfcMeshes.length > 0) {
        adjustCameraToMeshes(currentIfcMeshes, camera);
      }
    } catch (error) {
      console.error("Failed to load initial IFC file:", error);
      console.log("  You can drag and drop an IFC file to load it");
    }
  }

  // Show inspector for debugging (optional)
  ShowInspector(scene);

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
if (ifcAPI) {
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
      if (currentIfcMeshes.length > 0 || currentModelID !== null) {
        console.log(`  Cleaning up previous model...`);

        // Dispose all meshes, materials, and the ifc-root node
        disposeIfcScene(scene);

        // Close the IFC model and free WASM memory
        if (currentModelID !== null) {
          cleanupIfcModel(ifcAPI, currentModelID);
        }

        currentIfcMeshes = [];
        currentModelID = null;
        currentRootNode = null;
      }

      // Hide upper text and clear highlight when loading new model
      hideUpperTextAndClearHighlight();

      // Load the new IFC file with auto-centering
      const { meshes, modelID, rootNode, stats } = await loadAndRenderIfc(ifcAPI, file, scene, {
        autoCenter: true,
        verbose: true,
        generateNormals: false,
        coordinateToOrigin: true,
      });

      currentIfcMeshes = meshes;
      currentModelID = modelID;
      currentRootNode = rootNode;

      // Adjust camera to view the loaded model
      const camera = scene.activeCamera as ArcRotateCamera;
      if (camera) {
        adjustCameraToMeshes(meshes, camera);
      }

      console.log(`✅ Successfully loaded ${file.name}`);
      console.log(
        `  Statistics: ${meshes.length} meshes, ${stats.triangleCount.toLocaleString()} triangles, ${stats.loadTimeMs.toFixed(2)}ms\n`,
      );
    } catch (error) {
      console.error("Failed to load IFC file:", error);
      alert(`Failed to load IFC file: ${error}`);
    }
  });
}

// Add a reset camera button or functionality (optional)
// @ts-ignore
const resetCamera = () => {
  if (currentIfcMeshes.length > 0) {
    const camera = scene.activeCamera as ArcRotateCamera;
    if (camera) {
      adjustCameraToMeshes(currentIfcMeshes, camera);
      console.log("Camera reset to view full model");
    }
  }
};

// You can call resetCamera() from a button if needed
// Example: document.getElementById("reset-camera")?.addEventListener("click", resetCamera);
