import * as WebIFC from "web-ifc";
import { Scene, Mesh, VertexData, StandardMaterial, Color3, Matrix } from "@babylonjs/core";

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

  // Open the model
  const modelID = ifcAPI.OpenModel(uint8Array);

  // Apply coordinate system transformation (IFC uses different coordinate system than Babylon.js)
  // This flips Y and Z axes to match Babylon.js coordinate system
  const coordinateTransform = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];
  ifcAPI.SetGeometryTransformation(modelID, coordinateTransform);

  return modelID;
}

/**
 * Load IFC geometry and convert to Babylon.js meshes
 * This must be done in one step because the geometry data is only valid during the StreamAllMeshes callback
 */
export function loadIfcGeometryAsMeshes(ifcAPI: WebIFC.IfcAPI, modelID: number, scene: Scene): Mesh[] {
  const meshes: Mesh[] = [];
  let meshIndex = 0;

  // Map to store meshes by material color for merging
  const materialMeshMap = new Map<number, Mesh>();

  // Stream all meshes and process them immediately
  ifcAPI.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
    const placedGeometries = flatMesh.geometries;

    // Process each placed geometry in this mesh
    for (let i = 0; i < placedGeometries.size(); i++) {
      const placedGeometry = placedGeometries.get(i);

      // Get the actual geometry data
      const geometry = ifcAPI.GetGeometry(modelID, placedGeometry.geometryExpressID);

      // Get vertex and index arrays
      const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
      const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

      // Skip if no geometry
      if (verts.length === 0 || indices.length === 0) continue;

      // web-ifc provides vertices as interleaved data: [x, y, z, nx, ny, nz, x, y, z, nx, ny, nz, ...]
      // Extract positions and normals
      const numVertices = verts.length / 6;
      const positions = new Array(numVertices * 3);
      const normals = new Array(numVertices * 3);

      for (let v = 0; v < numVertices; v++) {
        positions[v * 3 + 0] = verts[v * 6 + 0];
        positions[v * 3 + 1] = verts[v * 6 + 1];
        positions[v * 3 + 2] = verts[v * 6 + 2];
        normals[v * 3 + 0] = verts[v * 6 + 3];
        normals[v * 3 + 1] = verts[v * 6 + 4];
        normals[v * 3 + 2] = verts[v * 6 + 5];
      }

      // Create a new mesh
      const mesh = new Mesh(`ifc-mesh-${meshIndex}-${i}`, scene);

      // Create vertex data
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.normals = normals;
      vertexData.indices = Array.from(indices);

      // Apply to mesh first
      vertexData.applyToMesh(mesh);

      // Apply transformation matrix by baking it into vertices
      const m = placedGeometry.flatTransformation;
      if (m && m.length === 16) {
        const matrix = new Matrix();
        // web-ifc provides column-major matrix, set it row by row
        matrix.setRowFromFloats(0, m[0], m[1], m[2], m[3]);
        matrix.setRowFromFloats(1, m[4], m[5], m[6], m[7]);
        matrix.setRowFromFloats(2, m[8], m[9], m[10], m[11]);
        matrix.setRowFromFloats(3, m[12], m[13], m[14], m[15]);

        // Bake transformation into vertices (like in the reference example)
        try {
          mesh.bakeTransformIntoVertices(matrix);
        } catch (error) {
          console.warn("Unable to bake transform matrix into vertex array:", error);
        }
      }

      // Calculate color ID for material merging
      const color = placedGeometry.color;
      let colorId: number;
      if (color) {
        // Create a unique ID from RGBA values
        colorId =
          Math.floor(color.x * 255) +
          Math.floor(color.y * 255) * 256 +
          Math.floor(color.z * 255) * 256 * 256 +
          Math.floor(color.w * 255) * 256 * 256 * 256;
      } else {
        colorId = 0; // Default color
      }

      // Check if we already have a mesh with this material
      if (materialMeshMap.has(colorId)) {
        const existingMesh = materialMeshMap.get(colorId)!;

        // Merge the new mesh with the existing one
        const mergedMesh = Mesh.MergeMeshes([existingMesh, mesh], true, true, undefined, false, true);

        if (mergedMesh) {
          mergedMesh.name = `ifc-merged-${colorId.toString(16)}`;
          materialMeshMap.set(colorId, mergedMesh);

          // Remove old mesh from meshes array and add merged one
          const index = meshes.indexOf(existingMesh);
          if (index > -1) {
            meshes.splice(index, 1);
          }
          meshes.push(mergedMesh);
        }
      } else {
        // Create a new material for this color
        const material = new StandardMaterial(`ifc-material-${colorId.toString(16)}`, scene);

        if (color) {
          material.diffuseColor = new Color3(color.x, color.y, color.z);
          material.alpha = color.w;
        } else {
          material.diffuseColor = new Color3(0.8, 0.8, 0.8);
        }

        // Ensure mesh is visible
        material.backFaceCulling = false;
        mesh.material = material;
        mesh.isVisible = true;

        // Store this mesh for future merging
        materialMeshMap.set(colorId, mesh);
        meshes.push(mesh);
      }
    }

    meshIndex++;
  });

  console.log(`  Merged into ${meshes.length} meshes (from ${meshIndex} original groups)`);

  return meshes;
}

/**
 * Load and render an IFC file in a Babylon.js scene
 */
export async function loadAndRenderIfc(ifcAPI: WebIFC.IfcAPI, url: string, scene: Scene): Promise<Mesh[]> {
  // Load the IFC file
  const modelID = await loadIfcFile(ifcAPI, url);

  // Load geometry and create meshes (must be done in one step)
  const meshes = loadIfcGeometryAsMeshes(ifcAPI, modelID, scene);

  console.log(`✓ Loaded IFC file with ${meshes.length} meshes`);

  // Log bounding info for debugging
  if (meshes.length > 0) {
    const firstMesh = meshes[0];
    const boundingInfo = firstMesh.getBoundingInfo();
    console.log(`  First mesh position:`, firstMesh.position);
    console.log(`  First mesh bounding box:`, boundingInfo.boundingBox);
    console.log(`  Vertices in first mesh:`, firstMesh.getTotalVertices());
  }

  return meshes;
}
