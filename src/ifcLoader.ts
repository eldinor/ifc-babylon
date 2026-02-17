import * as WebIFC from "web-ifc";

// ============================================================================
// TYPE DEFINITIONS - Intermediate Data Contract
// ============================================================================

/** Single piece of placed geometry from web-ifc */
export interface RawGeometryPart {
  expressID: number;
  geometryExpressID: number;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  flatTransform: number[];
  color: { x: number; y: number; z: number; w: number } | null;
  colorId: number;
}

/** Complete raw model returned by loadIfcModel */
export interface RawIfcModel {
  modelID: number;
  parts: RawGeometryPart[];
  storeyMap: Map<number, number>;
  rawStats: {
    partCount: number;
    vertexCount: number;
    triangleCount: number;
  };
}

/** Configuration for IFC loader */
export interface IfcLoaderOptions {
  coordinateToOrigin?: boolean; // web-ifc COORDINATE_TO_ORIGIN (default: true)
  verbose?: boolean; // console logging (default: true)
}

/** Metadata extracted from IFC file */
export interface MetadataResult {
  projectName: string | null;
  projectDescription: string | null;
  software: string | null;
  author: string | null;
  organization: string | null;
}

/** Building information */
export interface BuildingInfo {
  id: number;
  name: string;
  longName: string;
  description: string;
  elevation?: number;
}

/** Unit information */
export interface UnitInfo {
  type: number;
  unitType?: string;
  name?: string;
  prefix?: string;
  value?: number;
}

/** Property information */
export interface PropertyInfo {
  name?: string;
  description?: string;
  value?: any;
  type?: number;
}

/** Property set information */
export interface PropertySetInfo {
  id: number;
  name?: string;
  description?: string;
  properties: PropertyInfo[];
}

// ============================================================================
// PUBLIC API - Initialization
// ============================================================================

/**
 * Initialize the web-ifc API
 * This should be called once at application startup
 */
export async function initializeWebIFC(
  wasmPath?: string,
  logLevel: WebIFC.LogLevel = WebIFC.LogLevel.LOG_LEVEL_ERROR,
): Promise<WebIFC.IfcAPI> {
  const ifcAPI = new WebIFC.IfcAPI();

  // Set custom WASM path if provided
  if (wasmPath) {
    ifcAPI.SetWasmPath(wasmPath);
  }

  // Initialize the API
  const startTime = performance.now();
  await ifcAPI.Init();

  // Set log level
  ifcAPI.SetLogLevel(logLevel);

  console.log(`✓ Web-IFC initialized in ${(performance.now() - startTime).toFixed(2)}ms`);

  return ifcAPI;
}

// ============================================================================
// PUBLIC API - Model Loading
// ============================================================================

/**
 * Load an IFC file and extract raw geometry data
 * Returns a RawIfcModel with no Babylon.js dependencies
 */
export async function loadIfcModel(
  ifcAPI: WebIFC.IfcAPI,
  source: string | File,
  options: IfcLoaderOptions = {},
): Promise<RawIfcModel> {
  const opts: IfcLoaderOptions = {
    coordinateToOrigin: true,
    verbose: true,
    ...options,
  };

  // Step 1: Open the model
  const modelID = await openModel(ifcAPI, source, opts);

  // Step 2: Stream geometry and extract raw data
  const { parts, rawStats } = streamGeometry(ifcAPI, modelID, opts);

  // Step 3: Build storey map for spatial context
  const storeyMap = buildStoreyMap(ifcAPI, modelID);

  if (opts.verbose) {
    console.log(`\n📊 Raw Model Statistics:`);
    console.log(`  Parts extracted: ${rawStats.partCount}`);
    console.log(`  Vertices: ${rawStats.vertexCount.toLocaleString()}`);
    console.log(`  Triangles: ${rawStats.triangleCount.toLocaleString()}`);
    console.log(`  Storey relationships: ${storeyMap.size}`);
  }

  return {
    modelID,
    parts,
    storeyMap,
    rawStats,
  };
}

/**
 * Close IFC model and free memory
 */
export function closeIfcModel(ifcAPI: WebIFC.IfcAPI, modelID: number): void {
  if (ifcAPI.IsModelOpen(modelID)) {
    ifcAPI.CloseModel(modelID);
    console.log(`✓ Model ${modelID} closed and memory freed`);
  }
}

// ============================================================================
// PUBLIC API - Metadata Extraction
// ============================================================================

/**
 * Extract high-level IFC metadata (project, software, author, organization)
 */
export function extractMetadata(ifcAPI: WebIFC.IfcAPI, modelID: number): MetadataResult {
  const metadata: MetadataResult = {
    projectName: null,
    projectDescription: null,
    software: null,
    author: null,
    organization: null,
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
  } catch (error) {
    console.warn("Error extracting IFC metadata:", error);
  }

  return metadata;
}

/**
 * Get building information from IFC file
 */
export async function getBuildingInfo(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
): Promise<BuildingInfo[]> {
  const buildings = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING);
  const buildingList: BuildingInfo[] = [];

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
export async function getProjectUnits(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
): Promise<UnitInfo[] | null> {
  const projects = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
  if (projects.size() === 0) return null;

  const project = await ifcAPI.GetLine(modelID, projects.get(0));
  if (!project.UnitsInContext) return null;

  const unitAssignment = await ifcAPI.GetLine(modelID, project.UnitsInContext.value);
  const units: UnitInfo[] = [];

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
 * Get all property sets from IFC model
 */
export async function getAllPropertySets(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
): Promise<PropertySetInfo[]> {
  const propertySets: PropertySetInfo[] = [];
  const propertySetIds = new Set<number>();

  try {
    // Get all IFCPROPERTYSET entities directly
    const propSetLines = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROPERTYSET);

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

// ============================================================================
// PRIVATE HELPERS - Model Loading
// ============================================================================

/**
 * Open an IFC model from URL or File
 */
async function openModel(
  ifcAPI: WebIFC.IfcAPI,
  source: string | File,
  options: IfcLoaderOptions,
): Promise<number> {
  let data: ArrayBuffer;

  if (typeof source === "string") {
    console.log(`📥 Fetching IFC from URL: ${source}`);
    const response = await fetch(source);
    console.log(
      `📥 Fetch response: status=${response.status}, ok=${response.ok}, type=${response.headers.get("content-type")}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch IFC file: HTTP ${response.status} ${response.statusText}`);
    }

    data = await response.arrayBuffer();
    console.log(`📥 Received ${(data.byteLength / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`📥 Loading IFC file: ${source.name} (${(source.size / 1024 / 1024).toFixed(2)} MB)`);
    data = await source.arrayBuffer();
  }

  // Configure loader settings
  const settings: WebIFC.LoaderSettings = {
    COORDINATE_TO_ORIGIN: options.coordinateToOrigin ?? true,
    CIRCLE_SEGMENTS: 24,
    MEMORY_LIMIT: 2147483648,
    TAPE_SIZE: 67108864,
  };

  console.log(`📥 Opening IFC model (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)...`);
  const modelID = ifcAPI.OpenModel(new Uint8Array(data), settings);
  console.log(`📥 OpenModel returned modelID: ${modelID}`);

  if (modelID === -1) {
    throw new Error("Failed to open IFC model");
  }

  return modelID;
}

/**
 * Stream geometry and extract raw data (no Babylon.js dependencies)
 */
function streamGeometry(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  options: IfcLoaderOptions,
): { parts: RawGeometryPart[]; rawStats: { partCount: number; vertexCount: number; triangleCount: number } } {
  const parts: RawGeometryPart[] = [];
  let totalVertices = 0;
  let totalTriangles = 0;

  // Stream all meshes
  ifcAPI.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
    const placedGeometries = flatMesh.geometries;

    for (let i = 0; i < placedGeometries.size(); i++) {
      const placedGeometry = placedGeometries.get(i);

      // Skip invalid geometries
      if (!placedGeometry || placedGeometry.geometryExpressID === undefined) continue;

      // Get geometry data
      const geometry = ifcAPI.GetGeometry(modelID, placedGeometry.geometryExpressID);
      if (!geometry) continue;

      try {
        const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

        if (verts.length === 0 || indices.length === 0) {
          (geometry as any)?.delete?.();
          continue;
        }

        // Extract positions and normals
        const numVertices = verts.length / 6;
        const positions = new Float32Array(numVertices * 3);
        const normals = new Float32Array(numVertices * 3);

        for (let v = 0; v < numVertices; v++) {
          positions[v * 3] = verts[v * 6];
          positions[v * 3 + 1] = verts[v * 6 + 1];
          positions[v * 3 + 2] = verts[v * 6 + 2];
          normals[v * 3] = verts[v * 6 + 3];
          normals[v * 3 + 1] = verts[v * 6 + 4];
          normals[v * 3 + 2] = verts[v * 6 + 5];
        }

        // Get color information
        const color = placedGeometry.color;
        let colorId: number;
        if (color) {
          colorId =
            Math.floor(color.x * 255) +
            Math.floor(color.y * 255) * 256 +
            Math.floor(color.z * 255) * 256 * 256 +
            Math.floor(color.w * 255) * 256 * 256 * 256;
        } else {
          colorId = 0; // Default color
        }

        // Store raw geometry part
        parts.push({
          expressID: flatMesh.expressID,
          geometryExpressID: placedGeometry.geometryExpressID,
          positions,
          normals,
          indices: new Uint32Array(indices),
          flatTransform: Array.from(placedGeometry.flatTransformation),
          color,
          colorId,
        });

        // Update stats
        totalVertices += numVertices;
        totalTriangles += indices.length / 3;

        // Clean up WASM memory
        (geometry as any)?.delete?.();
      } catch (error) {
        console.error(`Error processing geometry:`, error);
        (geometry as any)?.delete?.();
      }
    }
  });

  if (options.verbose) {
    console.log(`\n📦 Collected ${parts.length} geometry parts`);
  }

  return {
    parts,
    rawStats: {
      partCount: parts.length,
      vertexCount: totalVertices,
      triangleCount: totalTriangles,
    },
  };
}

/**
 * Build storey map for spatial context checking
 */
function buildStoreyMap(ifcAPI: WebIFC.IfcAPI, modelID: number): Map<number, number> {
  const elementToStorey = new Map<number, number>();

  try {
    // Get all building storeys
    const storeys = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);

    for (let i = 0; i < storeys.size(); i++) {
      const storeyID = storeys.get(i);

      try {
        // Get all elements in this storey via spatial structure
        const relAggregates = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);

        for (let j = 0; j < relAggregates.size(); j++) {
          const relID = relAggregates.get(j);
          const rel = ifcAPI.GetLine(modelID, relID);

          if (rel.RelatingObject && rel.RelatingObject.value === storeyID) {
            if (rel.RelatedObjects) {
              rel.RelatedObjects.forEach((obj: any) => {
                if (obj && obj.value) {
                  elementToStorey.set(obj.value, storeyID);
                }
              });
            }
          }
        }

        // Also check spatial containment
        const relContained = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);

        for (let j = 0; j < relContained.size(); j++) {
          const relID = relContained.get(j);
          const rel = ifcAPI.GetLine(modelID, relID);

          if (rel.RelatingStructure && rel.RelatingStructure.value === storeyID) {
            if (rel.RelatedElements) {
              rel.RelatedElements.forEach((elem: any) => {
                if (elem && elem.value) {
                  elementToStorey.set(elem.value, storeyID);
                }
              });
            }
          }
        }
      } catch (error) {
        // Skip errors for individual storeys
      }
    }
  } catch (error) {
    console.warn("Could not build storey map:", error);
  }

  return elementToStorey;
}

// ============================================================================
// PRIVATE HELPERS - Metadata
// ============================================================================

/**
 * Get properties from a property set
 */
async function getPropertiesFromSet(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  propertySet: any,
): Promise<PropertyInfo[]> {
  const properties: PropertyInfo[] = [];

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
