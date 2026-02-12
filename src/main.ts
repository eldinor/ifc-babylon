import { Engine, Scene, ArcRotateCamera, HemisphericLight, MeshBuilder, Vector3 } from "@babylonjs/core";
import { initializeWebIFC } from "./ifcLoader";

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
const createScene = (): Scene => {
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
  MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);

  return scene;
};

// Create the scene
const scene = createScene();

// Run the render loop
engine.runRenderLoop(() => {
  scene.render();
});

// Handle window resize
window.addEventListener("resize", () => {
  engine.resize();
});
