import * as WebIFC from "web-ifc";
import { Scene, Mesh, VertexData, StandardMaterial, Color3, Matrix } from "@babylonjs/core";
import { extractIfcMetadata, getBuildingInfo } from "./ifcMetadata";
/**
 * Initialize the web-ifc API
 * This should be called once at application startup
 */
export async function initializeWebIFC(): Promise<WebIFC.IfcAPI> {
  const ifcAPI = new WebIFC.IfcAPI();

  // Initialize the API
  await ifcAPI.Init();

  return ifcAPI;
}

/**
 * Load an IFC file from a URL or File object (internal helper)
 */
async function loadIfcFile(ifcAPI: WebIFC.IfcAPI, source: string | File): Promise<number> {
  let data: ArrayBuffer;

  if (typeof source === "string") {
    const response = await fetch(source);
    data = await response.arrayBuffer();
  } else {
    data = await source.arrayBuffer();
  }

  const modelID = ifcAPI.OpenModel(new Uint8Array(data));
  return modelID;
}

/**
 * Load IFC geometry and convert to Babylon.js meshes (internal helper)
 * This must be done in one step because the geometry data is only valid during the StreamAllMeshes callback
 */
function loadIfcGeometryAsMeshes(ifcAPI: WebIFC.IfcAPI, modelID: number, scene: Scene): Mesh[] {
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

        // Store references to materials that will be disposed
        const existingMaterial = existingMesh.material;
        const newMaterial = mesh.material;

        // Merge the new mesh with the existing one
        // disposeSource=true will dispose the source meshes but NOT their materials
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

          // Dispose the unused materials from the merged meshes
          if (existingMaterial && existingMaterial !== mergedMesh.material) {
            existingMaterial.dispose();
          }
          if (newMaterial && newMaterial !== mergedMesh.material) {
            newMaterial.dispose();
          }
        }
      } else {
        // Create a new material for this color
        const material = new StandardMaterial(`ifc-material-${colorId.toString(16)}`, scene);

        if (color) {
          material.diffuseColor = new Color3(color.x, color.y, color.z);

          // Check if material has transparency (alpha < 1.0)
          if (color.w < 1.0) {
            material.alpha = 0.2;
            material.transparencyMode = 2; // ALPHABLEND mode
          } else {
            material.alpha = color.w;
          }
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
 * @param ifcAPI - The web-ifc API instance
 * @param source - Either a URL string or a File object
 * @param scene - The Babylon.js scene
 * @returns Array of loaded meshes
 */
export async function loadAndRenderIfc(ifcAPI: WebIFC.IfcAPI, source: string | File, scene: Scene): Promise<Mesh[]> {
  // Load the IFC file based on source type
  let modelID: number;
  if (typeof source === "string") {
    // Load from URL
    modelID = await loadIfcFile(ifcAPI, source);
  } else {
    // Load from File object
    console.log(`Loading IFC file: ${source.name} (${(source.size / 1024 / 1024).toFixed(2)} MB)`);
    modelID = await loadIfcFile(ifcAPI, source);
  }

  // Extract and display metadata
  console.log("\n📋 IFC File Metadata:");
  const metadata = extractIfcMetadata(ifcAPI, modelID);
  console.log(`  Project Name: ${metadata.projectName || "N/A"}`);
  console.log(`  Description: ${metadata.projectDescription || "N/A"}`);
  console.log(`  Software: ${metadata.software || "N/A"}`);
  console.log(`  Author: ${metadata.author || "N/A"}`);
  console.log(`  Organization: ${metadata.organization || "N/A"}`);
  // console.log(`  Schema: ${metadata.schema || "N/A"}`);

  /*
  // Get and display building information
  console.log("\n🏢 Building Information:");
  const buildings = await getBuildingInfo(ifcAPI, modelID);
  if (buildings.length > 0) {
    buildings.forEach((building, index) => {
      console.log(`  Building ${index + 1}:`);
      console.log(`    ID: ${building.id}`);
      console.log(`    Name: ${building.name || "N/A"}`);
      console.log(`    Long Name: ${building.longName || "N/A"}`);
      console.log(`    Description: ${building.description || "N/A"}`);
      console.log(`    Elevation: ${building.elevation !== undefined ? building.elevation : "N/A"}`);
    });
  } else {
    console.log(`  No building information found`);
  }
*/
  // Load geometry and create meshes (must be done in one step)
  const meshes = loadIfcGeometryAsMeshes(ifcAPI, modelID, scene);

  console.log(`\n✓ Loaded IFC file with ${meshes.length} meshes`);

  // Log bounding info for debugging
  if (meshes.length > 0) {
    const firstMesh = meshes[0];
    const boundingInfo = firstMesh.getBoundingInfo();
    console.log(`  First mesh position:`, firstMesh.position);
    console.log(`  First mesh bounding box:`, boundingInfo.boundingBox);
    // console.log(`  Vertices in first mesh:`, firstMesh.getTotalVertices());
  }

  return meshes;
}
