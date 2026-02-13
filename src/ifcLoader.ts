import * as WebIFC from "web-ifc";
import { Scene, Mesh, VertexData, StandardMaterial, Color3, Matrix } from "@babylonjs/core";
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
 * Load an IFC file from a URL or from a File object (e.g., from drag-and-drop)
 */
export async function loadIfcFile(ifcAPI: WebIFC.IfcAPI, source: string | File): Promise<number> {
  // Accept either a URL string or a File object
  if (typeof source === "string") {
    const response = await fetch(source);
    const data = await response.arrayBuffer();
    return openIfcBytes(ifcAPI, new Uint8Array(data));
  } else {
    const data = await source.arrayBuffer();
    return openIfcBytes(ifcAPI, new Uint8Array(data));
  }
}

/**
 * Load an IFC file from Uint8Array)
 */
async function openIfcBytes(ifcAPI: WebIFC.IfcAPI, bytes: Uint8Array): Promise<number> {
  const modelID = ifcAPI.OpenModel(bytes);
  return modelID;
}

/**
 * Get building information from IFC file
 */
export async function getBuildingInfo(ifcAPI: WebIFC.IfcAPI, modelID: number) {
  const buildings = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING);
  const buildingList = [];

  for (let i = 0; i < buildings.size(); i++) {
    const buildingID = buildings.get(i);
    const building = await ifcAPI.GetLine(modelID, buildingID);

    buildingList.push({
      id: buildingID,
      name: building.Name?.value || "",
      longName: building.LongName?.value || "",
      description: building.Description?.value || "",
      elevation: building.ElevationOfRefHeight?.value,
    });
  }

  return buildingList;
}

/**
 * Get project units from IFC file
 */
export async function getProjectUnits(ifcAPI: WebIFC.IfcAPI, modelID: number) {
  const projects = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
  if (projects.size() === 0) return null;

  const project = await ifcAPI.GetLine(modelID, projects.get(0));
  if (!project.UnitsInContext) return null;

  const unitAssignment = await ifcAPI.GetLine(modelID, project.UnitsInContext.value);
  const units = [];

  // Parse units
  if (unitAssignment.Units) {
    for (const unitRef of unitAssignment.Units) {
      if (unitRef.value) {
        const unit = await ifcAPI.GetLine(modelID, unitRef.value);
        units.push({
          type: unit.type,
          unitType: unit.UnitType?.value,
          name: unit.Name?.value,
          prefix: unit.Prefix?.value,
          value: unit.Value?.value,
        });
      }
    }
  }

  return units;
}

/**
 * Get properties from a property set
 */
async function getPropertiesFromSet(ifcAPI: WebIFC.IfcAPI, modelID: number, propertySet: any) {
  const properties = [];

  if (propertySet.HasProperties) {
    for (const propRef of propertySet.HasProperties) {
      if (propRef.value) {
        const prop = await ifcAPI.GetLine(modelID, propRef.value);
        properties.push({
          name: prop.Name?.value,
          description: prop.Description?.value,
          value: prop.NominalValue?.value,
          type: prop.NominalValue?.type,
        });
      }
    }
  }

  return properties;
}

/**
 * Get all property sets from IFC model
 */
export async function getAllPropertySets(ifcAPI: WebIFC.IfcAPI, modelID: number) {
  const propertySets = [];
  const propertySetIds = new Set<number>();

  try {
    // Get all IFCPROPERTYSET entities directly
    const propSetLines = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROPERTYSET);

    // console.log(`  Found ${propSetLines.size()} property sets in the model`);

    for (let i = 0; i < propSetLines.size(); i++) {
      const propSetID = propSetLines.get(i);

      // Skip if we've already processed this property set
      if (propertySetIds.has(propSetID)) continue;
      propertySetIds.add(propSetID);

      const propSet = await ifcAPI.GetLine(modelID, propSetID);
      const properties = await getPropertiesFromSet(ifcAPI, modelID, propSet);

      propertySets.push({
        id: propSetID,
        name: propSet.Name?.value,
        description: propSet.Description?.value,
        properties,
      });
    }
  } catch (error) {
    console.warn("Error extracting property sets:", error);
  }

  return propertySets;
}

/**
 * Extract metadata from IFC file
 */

export function extractIfcMetadata(ifcAPI: WebIFC.IfcAPI, modelID: number): any {
  const metadata: any = {
    projectName: null,
    projectDescription: null,
    software: null,
    author: null,
    organization: null,
    //  schema: null,
  };

  try {
    // Get all lines of type IFCPROJECT
    const projects = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (projects.size() > 0) {
      const projectID = projects.get(0);
      const project = ifcAPI.GetLine(modelID, projectID);

      if (project) {
        metadata.projectName = project.Name?.value || project.LongName?.value || null;
        metadata.projectDescription = project.Description?.value || null;
      }
    }

    // Get IFCAPPLICATION for software info
    const applications = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCAPPLICATION);
    if (applications.size() > 0) {
      const appID = applications.get(0);
      const app = ifcAPI.GetLine(modelID, appID);

      if (app) {
        metadata.software = app.ApplicationFullName?.value || app.ApplicationIdentifier?.value || null;
      }
    }

    // Get IFCPERSON for author info
    const persons = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPERSON);
    if (persons.size() > 0) {
      const personID = persons.get(0);
      const person = ifcAPI.GetLine(modelID, personID);

      if (person) {
        const givenName = person.GivenName?.value || "";
        const familyName = person.FamilyName?.value || "";
        const id = person.Identification?.value || "";
        metadata.author = [givenName, familyName, id].filter(Boolean).join(" ") || null;
      }
    }

    // Get IFCORGANIZATION
    const organizations = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCORGANIZATION);
    if (organizations.size() > 0) {
      const orgID = organizations.get(0);
      const org = ifcAPI.GetLine(modelID, orgID);

      if (org) {
        metadata.organization = org.Name?.value || null;
      }
    }
    /*
    // Get schema from model
    const allLines = ifcAPI.GetAllLines(modelID);
    if (allLines && allLines.size() > 0) {
      // Schema is typically in the header, we can infer from the model
      metadata.schema = "IFC2X3 or IFC4"; // web-ifc doesn't expose schema directly
    }
    */
  } catch (error) {
    console.warn("Error extracting IFC metadata:", error);
  }

  return metadata;
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

  // Get and display project units (commented out - can be enabled if needed)
  // console.log("\n📏 Project Units:");
  // const units = await getProjectUnits(ifcAPI, modelID);
  // if (units && units.length > 0) {
  //   units.forEach((unit, index) => {
  //     console.log(`  Unit ${index + 1}:`);
  //     console.log(`    Type: ${unit.type || "N/A"}`);
  //     console.log(`    Unit Type: ${unit.unitType || "N/A"}`);
  //     console.log(`    Name: ${unit.name || "N/A"}`);
  //     console.log(`    Prefix: ${unit.prefix || "N/A"}`);
  //     console.log(`    Value: ${unit.value || "N/A"}`);
  //   });
  // } else {
  //   console.log(`  No unit information found`);
  // }

  // Get and display property sets (commented out - can be enabled if needed)
  // console.log("\n📦 Property Sets:");
  // const propertySets = await getAllPropertySets(ifcAPI, modelID);
  // if (propertySets.length > 0) {
  //   propertySets.forEach((propSet, index) => {
  //     console.log(`  Property Set ${index + 1}:`);
  //     console.log(`    ID: ${propSet.id}`);
  //     console.log(`    Name: ${propSet.name || "N/A"}`);
  //     console.log(`    Description: ${propSet.description || "N/A"}`);
  //     if (propSet.properties.length > 0) {
  //       console.log(`    Properties:`);
  //       propSet.properties.forEach((prop) => {
  //         console.log(`      - ${prop.name || "N/A"}: ${prop.value || "N/A"} (${prop.type || "N/A"})`);
  //       });
  //     } else {
  //       console.log(`    Properties: None`);
  //     }
  //   });
  // } else {
  //   console.log(`  No property sets found`);
  // }

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

/**
 * @deprecated Use loadAndRenderIfc() instead - it now accepts both URL strings and File objects
 */
export async function loadAndRenderIfcFromFile(ifcAPI: WebIFC.IfcAPI, file: File, scene: Scene): Promise<Mesh[]> {
  return loadAndRenderIfc(ifcAPI, file, scene);
}
