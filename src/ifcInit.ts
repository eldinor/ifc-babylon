import * as WebIFC from "web-ifc";
import { logError, logInfo, logWarn } from "./logging";

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
  flatTransform: ArrayLike<number>;
  color: { x: number; y: number; z: number; w: number } | null;
  colorId: number;
}

/** Complete raw model returned by loadIfcModel */
export interface RawIfcModel {
  modelID: number;
  parts: RawGeometryPart[];
  rawStats: {
    partCount: number;
    vertexCount: number;
    triangleCount: number;
  };
}

/** Configuration for IFC loader */
export interface IfcInitOptions {
  coordinateToOrigin?: boolean; // web-ifc COORDINATE_TO_ORIGIN (default: true)
  verbose?: boolean; // console logging (default: true)
  signal?: AbortSignal; // cancellation signal for fetch/parse
}

/** projectInfo extracted from IFC file */
export interface ProjectInfoResult {
  projectName: string | null;
  projectDescription: string | null;
  application: string | null;
  author: string | null;
  organization: string | null;
}

interface DisposableGeometry {
  delete?: () => void;
}

interface GeometryErrorContext {
  modelID: number;
  expressID: number;
  geometryExpressID: number;
}

class IfcGeometryProcessingError extends Error {
  readonly context: GeometryErrorContext;
  readonly cause: unknown;

  constructor(context: GeometryErrorContext, cause: unknown) {
    super(
      `Error processing geometry (modelID=${context.modelID}, expressID=${context.expressID}, geometryExpressID=${context.geometryExpressID})`,
    );
    this.name = "IfcGeometryProcessingError";
    this.context = context;
    this.cause = cause;
  }
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Operation was aborted", "AbortError");
  }
  const error = new Error("Operation was aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function disposeGeometry(geometry: unknown): void {
  if (geometry && typeof geometry === "object" && "delete" in geometry) {
    const disposable = geometry as DisposableGeometry;
    disposable.delete?.();
  }
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

  logInfo(`Web-IFC initialized in ${(performance.now() - startTime).toFixed(2)}ms`);

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
  options: IfcInitOptions = {},
): Promise<RawIfcModel> {
  const opts: IfcInitOptions = {
    coordinateToOrigin: true,
    verbose: true,
    ...options,
  };

  throwIfAborted(opts.signal);

  // Step 1: Open the model
  const modelID = await openModel(ifcAPI, source, opts);

  try {
    throwIfAborted(opts.signal);

    // Step 2: Stream geometry and extract raw data
    const { parts, rawStats } = streamGeometry(ifcAPI, modelID, opts);

    throwIfAborted(opts.signal);

    if (opts.verbose) {
      logInfo(`\nRaw model statistics:`, { modelID });
      logInfo(`  Parts extracted: ${rawStats.partCount}`, { modelID });
      logInfo(`  Vertices: ${rawStats.vertexCount.toLocaleString()}`, { modelID });
      logInfo(`  Triangles: ${rawStats.triangleCount.toLocaleString()}`, { modelID });
    }

    return {
      modelID,
      parts,
      rawStats,
    };
  } catch (error) {
    if (ifcAPI.IsModelOpen(modelID)) {
      ifcAPI.CloseModel(modelID);
    }
    throw error;
  }
}

/**
 * Close IFC model and free memory
 */
export function closeIfcModel(ifcAPI: WebIFC.IfcAPI, modelID: number): void {
  if (ifcAPI.IsModelOpen(modelID)) {
    ifcAPI.CloseModel(modelID);
    logInfo("Model closed and memory freed", { modelID });
  }
}

// ============================================================================
// PUBLIC API - projectInfo Extraction
// ============================================================================

/**
 * Extract high-level IFC projectInfo (project, application, author, organization)
 */
export function getProjectInfo(ifcAPI: WebIFC.IfcAPI, modelID: number): ProjectInfoResult {
  const projectInfo: ProjectInfoResult = {
    projectName: null,
    projectDescription: null,
    application: null,
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
        projectInfo.projectName = project.Name?.value || project.LongName?.value || null;
        projectInfo.projectDescription = project.Description?.value || null;
      }
    }

    // Get IFCAPPLICATION for application info
    const applications = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCAPPLICATION);
    if (applications.size() > 0) {
      const appID = applications.get(0);
      const app = ifcAPI.GetLine(modelID, appID);

      if (app) {
        projectInfo.application = app.ApplicationFullName?.value || app.ApplicationIdentifier?.value || null;
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
        projectInfo.author = [givenName, familyName, id].filter(Boolean).join(" ") || null;
      }
    }

    // Get IFCORGANIZATION
    const organizations = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCORGANIZATION);
    if (organizations.size() > 0) {
      const orgID = organizations.get(0);
      const org = ifcAPI.GetLine(modelID, orgID);

      if (org) {
        projectInfo.organization = org.Name?.value || null;
      }
    }
  } catch (error) {
    logWarn("Error extracting IFC projectInfo", { modelID }, error);
  }

  return projectInfo;
}

// ============================================================================
// PRIVATE HELPERS - Model Loading
// ============================================================================

/**
 * Open an IFC model from URL or File
 */
async function openModel(ifcAPI: WebIFC.IfcAPI, source: string | File, options: IfcInitOptions): Promise<number> {
  let data: ArrayBuffer;
  throwIfAborted(options.signal);

  if (typeof source === "string") {
    logInfo(`Fetching IFC from URL: ${source}`);
    const response = options.signal ? await fetch(source, { signal: options.signal }) : await fetch(source);
    logInfo(
      `Fetch response: status=${response.status}, ok=${response.ok}, type=${response.headers.get("content-type")}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch IFC file: HTTP ${response.status} ${response.statusText}`);
    }

    data = await response.arrayBuffer();
    logInfo(`Received ${(data.byteLength / 1024 / 1024).toFixed(2)} MB`);
  } else {
    logInfo(`Loading IFC file: ${source.name} (${(source.size / 1024 / 1024).toFixed(2)} MB)`);
    data = await source.arrayBuffer();
  }

  throwIfAborted(options.signal);

  // Configure loader settings
  const settings: WebIFC.LoaderSettings = {
    COORDINATE_TO_ORIGIN: options.coordinateToOrigin ?? true,
    CIRCLE_SEGMENTS: 24,
    MEMORY_LIMIT: 2147483648,
    TAPE_SIZE: 67108864,
  };

  logInfo(`Opening IFC model (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)...`);
  const modelID = ifcAPI.OpenModel(new Uint8Array(data), settings);
  logInfo("OpenModel returned", { modelID });

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
  options: IfcInitOptions,
): { parts: RawGeometryPart[]; rawStats: { partCount: number; vertexCount: number; triangleCount: number } } {
  throwIfAborted(options.signal);
  const parts: RawGeometryPart[] = [];
  let totalVertices = 0;
  let totalTriangles = 0;

  // Stream all meshes
  ifcAPI.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
    const placedGeometries = flatMesh.geometries;

    for (let i = 0; i < placedGeometries.size(); i++) {
      throwIfAborted(options.signal);
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
          disposeGeometry(geometry);
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
          flatTransform: placedGeometry.flatTransformation,
          color,
          colorId,
        });

        // Update stats
        totalVertices += numVertices;
        totalTriangles += indices.length / 3;

        // Clean up WASM memory
        disposeGeometry(geometry);
      } catch (error) {
        const context: GeometryErrorContext = {
          modelID,
          expressID: flatMesh.expressID,
          geometryExpressID: placedGeometry.geometryExpressID,
        };
        logError("Error processing geometry", context, new IfcGeometryProcessingError(context, error));
        disposeGeometry(geometry);
      }
    }
  });

  if (options.verbose) {
    logInfo(`\nCollected ${parts.length} geometry parts`, { modelID });
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





