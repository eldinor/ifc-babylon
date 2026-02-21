/**
 * Minimal Babylon.js Viewer for IFC files
 *
 * This demonstrates using the <babylon-viewer> web component
 * with the IFC loader plugin.
 */

// Import the IFC loader - this registers the plugin with SceneLoader globally
import type { ArcRotateCamera, Scene } from "@babylonjs/core";
import { configureIfcLoader, loadIfc, type IfcLoaderResult } from "./ifcLoader";

// Import the viewer - this registers the <babylon-viewer> web component
import "@babylonjs/viewer";

// Configure the IFC loader with WASM path
configureIfcLoader({
  wasmPath: "./",
  defaultLoadOptions: {
    coordinateToOrigin: true,
    mergeMeshes: true,
    autoCenter: true,
    doubleSided: true,
  },
});

// Get the viewer element
const viewerElement = document.querySelector("babylon-viewer") as HTMLElement & {
  viewerDetails?: {
    scene: any;
    viewer: any;
    model: any;
  };
};

// Listen for viewer ready event
viewerElement?.addEventListener("viewerready", () => {
  console.log("✓ Babylon.js Viewer ready");

  console.log(viewerElement.viewerDetails);

  const loadIfcFile = async (scene: Scene, source: string | File): Promise<IfcLoaderResult> => {
    console.log(`\n📦 Loading IFC file using ifcLoader plugin...`);

    const result = await loadIfc(source, scene);

    console.log(`\n✓ IFC loaded successfully`);
    console.log(
      `  ${result.meshes.length} meshes, ${result.rawModel.rawStats.triangleCount.toLocaleString()} triangles`,
    );
    console.log(`  Build time: ${result.stats.buildTimeMs.toFixed(2)}ms`);

    return result;
  };

  loadIfcFile(viewerElement.viewerDetails?.scene, "test.ifc");
  (viewerElement.viewerDetails?.scene.activeCamera as ArcRotateCamera).radius = 150;
});

// Listen for model changes
viewerElement?.addEventListener("modelchange", () => {
  console.log("✓ IFC model loaded");
});
