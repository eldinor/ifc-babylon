import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from "@babylonjs/core";
import { initializeWebIFC, loadAndRenderIfc } from "./ifcLoader";
import { Inspector } from "@babylonjs/inspector";

// Initialize web-ifc API
let ifcAPI: any = null;

try {
  ifcAPI = await initializeWebIFC();
  console.log("✓ web-ifc initialized successfully!");
  console.log("  You can now load IFC files using the ifcLoader utilities");
} catch (error) {
  console.error("⚠ Failed to initialize web-ifc:", error);
  console.log("  The Babylon.js scene will still work, but IFC loading will not be available");
  console.log("  This is likely due to web worker limitations in the development environment");
}

// Get the canvas element
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

// Create the Babylon.js engine
const engine = new Engine(canvas, true);

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

  // Create a sphere
  //  const sphere = MeshBuilder.CreateSphere("sphere", { diameter: 2 }, scene);
  // sphere.position.y = 1;

  // Create a ground
  //  MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);

  // After creating the scene...
  if (ifcAPI) {
    try {
      const meshes = await loadAndRenderIfc(ifcAPI, "/example.ifc", scene);
      console.log(`✓ Loaded ${meshes.length} IFC meshes`);

      // Adjust camera to view the loaded model
      if (meshes.length > 0) {
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
      }
    } catch (error) {
      console.error("Failed to load IFC file:", error);
    }
  }

  Inspector.Show(scene, {});

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
