import * as WebIFC from "web-ifc";
import { Scene, Mesh, VertexData, StandardMaterial, Color3 } from "@babylonjs/core";

/**
 * Initialize the web-ifc API
 * This should be called once at application startup
 */
export async function initializeWebIFC(): Promise<WebIFC.IfcAPI> {
  const ifcAPI = new WebIFC.IfcAPI();

  // Set the path to WASM files (they're in the public directory)
  ifcAPI.SetWasmPath("/");

  // Initialize the API
  await ifcAPI.Init();

  return ifcAPI;
}

/**
 * Load an IFC file from a URL
 */
export async function loadIfcFile(ifcAPI: WebIFC.IfcAPI, url: string): Promise<number> {
  const response = await fetch(url);
  const data = await response.arrayBuffer();
  const uint8Array = new Uint8Array(data);

  // Open the model and return the model ID
  const modelID = ifcAPI.OpenModel(uint8Array);

  return modelID;
}

/**
 * Get all geometry from an IFC model
 */
export function getIfcGeometry(ifcAPI: WebIFC.IfcAPI, modelID: number): WebIFC.FlatMesh[] {
  const geometries: WebIFC.FlatMesh[] = [];

  // Get all geometry
  ifcAPI.StreamAllMeshes(modelID, (mesh: WebIFC.FlatMesh) => {
    geometries.push(mesh);
  });

  return geometries;
}

/**
 * Convert IFC geometry to Babylon.js meshes
 */
export function createBabylonMeshesFromIfc(ifcAPI: WebIFC.IfcAPI, geometries: WebIFC.FlatMesh[], scene: Scene): Mesh[] {
  const meshes: Mesh[] = [];

  for (let i = 0; i < geometries.length; i++) {
    const geometry = geometries[i];
    const placedGeometry = geometry.geometries.get(0);

    if (!placedGeometry) continue;

    // Create a new mesh
    const mesh = new Mesh(`ifc-mesh-${i}`, scene);

    // Get geometry data
    const positions = ifcAPI.GetVertexArray(placedGeometry.geometryExpressID, geometry.geometries.size());
    const indices = ifcAPI.GetIndexArray(placedGeometry.geometryExpressID, geometry.geometries.size());

    // Create vertex data
    const vertexData = new VertexData();
    vertexData.positions = Array.from(positions);
    vertexData.indices = Array.from(indices);

    // Compute normals
    const normals: number[] = [];
    VertexData.ComputeNormals(vertexData.positions, vertexData.indices, normals);
    vertexData.normals = normals;

    // Apply to mesh
    vertexData.applyToMesh(mesh);

    // Create a simple material
    const material = new StandardMaterial(`ifc-material-${i}`, scene);
    material.diffuseColor = new Color3(0.8, 0.8, 0.8);
    mesh.material = material;

    meshes.push(mesh);
  }

  return meshes;
}

/**
 * Load and render an IFC file in a Babylon.js scene
 */
export async function loadAndRenderIfc(ifcAPI: WebIFC.IfcAPI, url: string, scene: Scene): Promise<Mesh[]> {
  // Load the IFC file
  const modelID = await loadIfcFile(ifcAPI, url);

  // Get geometry
  const geometries = getIfcGeometry(ifcAPI, modelID);

  // Create Babylon meshes
  const meshes = createBabylonMeshesFromIfc(ifcAPI, geometries, scene);

  console.log(`✓ Loaded IFC file with ${meshes.length} meshes`);

  return meshes;
}
