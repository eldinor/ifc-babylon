import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, AbstractMesh, Color3 } from "@babylonjs/core";
import { initializeWebIFC, loadAndRenderIfc, disposeIfcScene, cleanupIfcModel } from "./ifcLoader";
import { ShowInspector } from "@babylonjs/inspector";

// Initialize web-ifc API
let ifcAPI: any = null;

// Store currently loaded meshes and model ID for cleanup when loading new files
let currentIfcMeshes: AbstractMesh[] = [];
let currentModelID: number | null = null;

// Store currently highlighted mesh
let currentHighlightedMesh: AbstractMesh | null = null;

try {
  // Set WASM path - empty string means root directory
  // In production, the WASM file is copied to the root of dist folder
  // web-ifc expects the directory path, not a URL path with trailing slash
  ifcAPI = await initializeWebIFC("");
  console.log("✓ web-ifc initialized successfully!");
} catch (error) {
  console.error("⚠ Failed to initialize web-ifc:", error);
  console.log("  The Babylon.js scene will still work, but IFC loading will not be available");
  console.log("  This is likely due to web worker limitations in the development environment");
}

// Get the canvas element
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

// Create the Babylon.js engine
const engine = new Engine(canvas, true);

// Helper function to show properties panel
// @ts-ignore
const showPropertiesPanel = (element: any) => {
  // Get or create properties panel
  let panel = document.getElementById("properties-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "properties-panel";
    panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 400px;
      max-height: 80vh;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 20px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(panel);

    // Add close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    `;
    closeBtn.onclick = () => {
      panel!.style.display = "none";
    };
    panel.appendChild(closeBtn);
  }

  panel.style.display = "block";

  // Format the element data
  const formatValue = (value: any, indent = 0): string => {
    const indentStr = "  ".repeat(indent);
    if (value === null || value === undefined) {
      return `${indentStr}<span style="color: #888">null</span>`;
    }
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        if (value.length === 0) return `${indentStr}[]`;
        return `${indentStr}[\n` + value.map((v) => formatValue(v, indent + 1)).join(",\n") + `\n${indentStr}]`;
      }
      const entries = Object.entries(value);
      if (entries.length === 0) return `${indentStr}{}`;
      return (
        `${indentStr}{\n` +
        entries
          .map(([k, v]) => `${indentStr}  <span style="color: #4EC9B0">${k}</span>: ${formatValue(v, 0)}`)
          .join(",\n") +
        `\n${indentStr}}`
      );
    }
    if (typeof value === "string") {
      return `${indentStr}<span style="color: #CE9178">"${value}"</span>`;
    }
    if (typeof value === "number") {
      return `${indentStr}<span style="color: #B5CEA8">${value}</span>`;
    }
    if (typeof value === "boolean") {
      return `${indentStr}<span style="color: #569CD6">${value}</span>`;
    }
    return `${indentStr}${value}`;
  };

  // Build HTML content
  let html = `<div style="margin-bottom: 30px;">`;
  html += `<h3 style="margin: 0 0 15px 0; color: #4EC9B0; font-size: 16px;">IFC Element Properties</h3>`;
  html += `<div style="line-height: 1.6;">`;
  html += formatValue(element);
  html += `</div>`;
  html += `</div>`;

  panel.innerHTML = html;

  // Re-add close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
  `;
  closeBtn.onclick = () => {
    panel!.style.display = "none";
  };
  panel.appendChild(closeBtn);
};

// Setup picking handler for IFC elements
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
          console.log(`  Element name:`, element.Name.value);

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
            const elementName = element.Name?.value || "Unnamed";
            upperText.innerHTML = `<strong>${typeName}</strong> | ${elementName} | ID: ${expressID}`;
            upperText.style.display = "block";
          }

          // Show properties panel
          //   showPropertiesPanel(element);
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

// Helper function to hide upper text and clear highlight
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

// Helper function to adjust camera to view meshes
const adjustCameraToMeshes = (meshes: AbstractMesh[], camera: ArcRotateCamera) => {
  if (meshes.length === 0) return;

  // Calculate bounding box of all meshes
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  meshes.forEach((mesh) => {
    const boundingInfo = mesh.getBoundingInfo();
    const min = boundingInfo.boundingBox.minimumWorld;
    const max = boundingInfo.boundingBox.maximumWorld;

    minX = Math.min(minX, min.x);
    minY = Math.min(minY, min.y);
    minZ = Math.min(minZ, min.z);
    maxX = Math.max(maxX, max.x);
    maxY = Math.max(maxY, max.y);
    maxZ = Math.max(maxZ, max.z);
  });

  // Calculate center and size
  const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

  console.log(`  Model center:`, center);
  console.log(`  Model size:`, size);

  // Position camera to view the entire model
  camera.target = center;
  camera.radius = size * 2;
  camera.alpha = -Math.PI / 4;
  camera.beta = Math.PI / 3;
};

// Create the scene
const createScene = async (): Promise<Scene> => {
  // Create a basic scene
  const scene = new Scene(engine);

  // Create a camera
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);

  // Create a light
  const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
  light.intensity = 0.7;

  // After creating the scene...
  if (ifcAPI) {
    try {
      console.log("🔄 Starting to load test.ifc...");
      const { meshes: initialMeshes, modelID } = await loadAndRenderIfc(ifcAPI, "/test.ifc", scene);
      currentIfcMeshes = initialMeshes;
      currentModelID = modelID;
      console.log(`✓ Loaded ${currentIfcMeshes.length} IFC meshes (Model ID: ${modelID})`);

      // Adjust camera to view the loaded model
      if (currentIfcMeshes.length > 0) {
        adjustCameraToMeshes(currentIfcMeshes, camera);
      }
    } catch (error) {
      console.error("❌ Failed to load IFC file:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    }
  }

  ShowInspector(scene);

  // Setup picking handler for IFC elements
  if (ifcAPI) {
    setupPickingHandler(scene, ifcAPI);
  }

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
  });

  canvas.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.style.opacity = "1";
  });

  // Handle file drop
  canvas.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.style.opacity = "1";

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
      }

      // Hide upper text and clear highlight when loading new model
      hideUpperTextAndClearHighlight();

      // Load the new IFC file
      const { meshes, modelID } = await loadAndRenderIfc(ifcAPI, file, scene);
      currentIfcMeshes = meshes;
      currentModelID = modelID;

      // Adjust camera to view the loaded model
      const camera = scene.activeCamera as ArcRotateCamera;
      if (camera) {
        adjustCameraToMeshes(meshes, camera);
      }

      console.log(`✅ Successfully loaded ${file.name}\n`);
    } catch (error) {
      console.error("Failed to load IFC file:", error);
      alert(`Failed to load IFC file: ${error}`);
    }
  });
}
