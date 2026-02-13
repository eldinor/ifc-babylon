import * as WebIFC from "web-ifc";
import {
  Scene,
  Mesh,
  VertexData,
  StandardMaterial,
  Color3,
  Matrix,
  AbstractMesh,
  TransformNode,
  PBRMaterial,
  Vector3,
} from "@babylonjs/core";
import { extractIfcMetadata } from "./ifcMetadata";

// Shared material cache to avoid recreating identical materials
const materialCache = new Map<string, StandardMaterial | PBRMaterial>();

// Configuration interface for better flexibility
export interface IfcLoaderOptions {
  /** Merge meshes with same material to reduce draw calls */
  mergeMeshes?: boolean;
  /** Generate smooth normals if missing */
  generateNormals?: boolean;
  /** Use PBR materials for better rendering */
  usePBR?: boolean;
  /** Coordinate to origin transformation */
  coordinateToOrigin?: boolean;
  /** Logging verbosity */
  verbose?: boolean;
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
  /** Batch size for geometry processing */
  batchSize?: number;
  /** Enable double-sided rendering */
  doubleSided?: boolean;
  /** Maximum texture size for generated materials */
  maxTextureSize?: number;
}


// Statistics for performance monitoring
export interface LoaderStats {
  originalMeshCount: number;
  mergedMeshCount: number;
  vertexCount: number;
  triangleCount: number;
  materialCount: number;
  loadTimeMs: number;
  memoryUsageMB?: number;
}

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

/**
 * Load an IFC file from a URL or File object with progress tracking
 */
async function loadIfcFile(
  ifcAPI: WebIFC.IfcAPI,
  source: string | File,
  options: IfcLoaderOptions = {},
): Promise<number> {
  let data: ArrayBuffer;
  let totalSize: number;

  if (typeof source === "string") {
    if (options.verbose) console.log(`📥 Fetching IFC from URL: ${source}`);
    const response = await fetch(source);
    totalSize = parseInt(response.headers.get("content-length") || "0");
    const reader = response.body?.getReader();

    if (reader && totalSize > 0) {
      // Stream with progress
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        received += value.length;

        if (options.onProgress) {
          options.onProgress(received, totalSize);
        }
      }

      // Combine chunks
      const allChunks = new Uint8Array(received);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }
      data = allChunks.buffer;
    } else {
      // Fallback to regular fetch
      data = await response.arrayBuffer();
    }
  } else {
    if (options.verbose) {
      console.log(`📥 Loading IFC file: ${source.name} (${(source.size / 1024 / 1024).toFixed(2)} MB)`);
    }
    totalSize = source.size;
    data = await source.arrayBuffer();
  }

  // Configure loader settings
  const settings: WebIFC.LoaderSettings = {
    COORDINATE_TO_ORIGIN: options.coordinateToOrigin ?? true,
    CIRCLE_SEGMENTS: 24,
    MEMORY_LIMIT: 2147483648,
    TAPE_SIZE: 67108864,
  };

  const modelID = ifcAPI.OpenModel(new Uint8Array(data), settings);

  if (modelID === -1) {
    throw new Error("Failed to open IFC model");
  }

  return modelID;
}

/**
 * Load IFC geometry and convert to Babylon.js meshes with improved memory management
 */
function loadIfcGeometryAsMeshes(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  scene: Scene,
  options: IfcLoaderOptions = {},
): { meshes: AbstractMesh[]; stats: LoaderStats } {
  const meshes: AbstractMesh[] = [];
  const startTime = performance.now();

  // Create root transform node for better organization
  const rootNode = new TransformNode("ifc-root", scene);

  // Maps for optimization
  const materialMeshMap = new Map<string, Mesh[]>();
  
  // Statistics
  const stats: LoaderStats = {
    originalMeshCount: 0,
    mergedMeshCount: 0,
    vertexCount: 0,
    triangleCount: 0,
    materialCount: 0,
    loadTimeMs: 0,
  };

  // Track bounds for camera framing
  let boundsMin = { x: Infinity, y: Infinity, z: Infinity };
  let boundsMax = { x: -Infinity, y: -Infinity, z: -Infinity };

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

        stats.originalMeshCount++;
        stats.vertexCount += verts.length / 6; // 6 components per vertex (pos + normal)
        stats.triangleCount += indices.length / 3;

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

          // Update bounds
          const x = verts[v * 6];
          const y = verts[v * 6 + 1];
          const z = verts[v * 6 + 2];
          boundsMin.x = Math.min(boundsMin.x, x);
          boundsMin.y = Math.min(boundsMin.y, y);
          boundsMin.z = Math.min(boundsMin.z, z);
          boundsMax.x = Math.max(boundsMax.x, x);
          boundsMax.y = Math.max(boundsMax.y, y);
          boundsMax.z = Math.max(boundsMax.z, z);
        }

        // Generate normals if needed
        if (options.generateNormals && normals.every((v) => v === 0)) {
          const tempNormals: number[] = [];
          VertexData.ComputeNormals(Array.from(positions), Array.from(indices), tempNormals);
          for (let n = 0; n < tempNormals.length; n++) {
            normals[n] = tempNormals[n];
          }
        }

        // Create mesh name
        const elementId = flatMesh.expressID;
        const meshName = `ifc-${elementId}-${i}`;

        // Create mesh
        const mesh = new Mesh(meshName, scene);
        mesh.parent = rootNode;
        mesh.metadata = { elementId };

        // Apply vertex data
        const vertexData = new VertexData();
        vertexData.positions = Array.from(positions);
        vertexData.normals = Array.from(normals);
        vertexData.indices = Array.from(indices);
        vertexData.applyToMesh(mesh);

        // Apply transformation
        const transform = placedGeometry.flatTransformation;
        if (transform && transform.length === 16) {
          const matrix = Matrix.FromArray(transform);
          mesh.bakeTransformIntoVertices(matrix);
        }

        // Get or create material
        const color = placedGeometry.color;
        const colorKey = color
          ? `${color.x.toFixed(4)},${color.y.toFixed(4)},${color.z.toFixed(4)},${color.w.toFixed(4)}`
          : "default";

        if (options.mergeMeshes) {
          // Group by material for later merging
          if (!materialMeshMap.has(colorKey)) {
            materialMeshMap.set(colorKey, []);
            stats.materialCount++;
          }
          materialMeshMap.get(colorKey)!.push(mesh);
        } else {
          // Create material immediately
          const material = createMaterial(scene, colorKey, color, options);
          mesh.material = material;
          meshes.push(mesh);
        }

        // Clean up WASM memory
        (geometry as any)?.delete?.();
      } catch (error) {
        console.error(`Error processing geometry:`, error);
        (geometry as any)?.delete?.();
      }
    }

      });

  // Merge meshes by material if requested
  if (options.mergeMeshes && materialMeshMap.size > 0) {
    stats.mergedMeshCount = 0;

    materialMeshMap.forEach((meshGroup, colorKey) => {
      if (meshGroup.length === 0) return;

      try {
        // Extract color from key
        const colorParts = colorKey.split(",").map(Number);
        const color =
          colorParts.length === 4
            ? {
                x: colorParts[0],
                y: colorParts[1],
                z: colorParts[2],
                w: colorParts[3],
              }
            : undefined;

        if (meshGroup.length === 1) {
          // Single mesh, just assign material
          const material = createMaterial(scene, colorKey, color, options);
          meshGroup[0].material = material;
          meshes.push(meshGroup[0]);
          stats.mergedMeshCount++;
        } else {
          // Merge multiple meshes
          const mergedMesh = Mesh.MergeMeshes(
            meshGroup,
            true, // dispose source
            true, // allow32BitsIndices
            undefined, // meshCombined
            false, // subMeshClass
            true, // cloneWhenMerging
          );

          if (mergedMesh) {
            mergedMesh.name = `ifc-merged-${colorKey}`;
            mergedMesh.parent = rootNode;

            const material = createMaterial(scene, colorKey, color, options);
            mergedMesh.material = material;

            // Transfer metadata from first mesh
            if (meshGroup[0]?.metadata) {
              mergedMesh.metadata = meshGroup[0].metadata;
            }

            meshes.push(mergedMesh);
            stats.mergedMeshCount++;
          }
        }
      } catch (error) {
        console.warn(`Failed to merge meshes for material ${colorKey}:`, error);
        // Fallback: use individual meshes
        meshGroup.forEach((mesh) => {
          const material = createMaterial(scene, colorKey, color, options);
          mesh.material = material;
          meshes.push(mesh);
          stats.mergedMeshCount++;
        });
      }
    });
  }

  // Calculate bounds center
  const bounds = {
    min: boundsMin,
    max: boundsMax,
    center: {
      x: (boundsMin.x + boundsMax.x) / 2,
      y: (boundsMin.y + boundsMax.y) / 2,
      z: (boundsMin.z + boundsMax.z) / 2,
    },
  };

  stats.loadTimeMs = performance.now() - startTime;

  if (options.verbose) {
    console.log(`\n📊 Loading Statistics:`);
    console.log(`  Original meshes: ${stats.originalMeshCount}`);
    console.log(`  Final meshes: ${options.mergeMeshes ? stats.mergedMeshCount : stats.originalMeshCount}`);
    console.log(`  Materials: ${stats.materialCount}`);
    console.log(`  Vertices: ${stats.vertexCount.toLocaleString()}`);
    console.log(`  Triangles: ${stats.triangleCount.toLocaleString()}`);
    console.log(`  Load time: ${stats.loadTimeMs.toFixed(2)}ms`);
    console.log(
      `  Bounds: X[${bounds.min.x.toFixed(2)}, ${bounds.max.x.toFixed(2)}] ` +
        `Y[${bounds.min.y.toFixed(2)}, ${bounds.max.y.toFixed(2)}] ` +
        `Z[${bounds.min.z.toFixed(2)}, ${bounds.max.z.toFixed(2)}]`,
    );
  }

  return { meshes, stats };
}

/**
 * Create material with specified color and options
 */
function createMaterial(
  scene: Scene,
  colorKey: string,
  color?: { x: number; y: number; z: number; w: number },
  options: IfcLoaderOptions = {},
): StandardMaterial | PBRMaterial {
  const materialClass = options.usePBR ? PBRMaterial : StandardMaterial;

  // Check cache first
  if (options.mergeMeshes && materialCache.has(colorKey)) {
    return materialCache.get(colorKey)!.clone(`material-${colorKey}-clone`);
  }

  const material = new materialClass(`material-${colorKey}`, scene);

  if (color) {
    const diffuseColor = new Color3(color.x, color.y, color.z);

    if (material instanceof StandardMaterial) {
      material.diffuseColor = diffuseColor;
    } else if (material instanceof PBRMaterial) {
      material.albedoColor = diffuseColor;
      material.metallic = 0;
      material.roughness = 0.5;
    }

    // Handle transparency
    if (color.w < 1.0) {
      material.alpha = Math.max(0.2, color.w); // Minimum 0.2 for visibility
      material.transparencyMode = 2; // ALPHABLEND
      if (material instanceof PBRMaterial) {
        material.alphaMode = 1; // ALPHABLEND
      }
    } else {
      material.alpha = 1.0;
    }
  } else {
    // Default color
    if (material instanceof StandardMaterial) {
      material.diffuseColor = new Color3(0.8, 0.8, 0.8);
    } else if (material instanceof PBRMaterial) {
      material.albedoColor = new Color3(0.8, 0.8, 0.8);
    }
  }

  // Configure material
  material.backFaceCulling = !(options.doubleSided ?? false);

  if (options.usePBR && options.maxTextureSize) {
    (material as PBRMaterial).maxSimultaneousLights = 4;
  }

  // Cache for reuse
  if (options.mergeMeshes) {
    materialCache.set(colorKey, material);
  }

  return material;
}

/**
 * Load and render an IFC file in a Babylon.js scene
 * @returns Object containing meshes and statistics
 */
export async function loadAndRenderIfc(
  ifcAPI: WebIFC.IfcAPI,
  source: string | File,
  scene: Scene,
  options: IfcLoaderOptions = {},
): Promise<{ meshes: AbstractMesh[]; stats: LoaderStats; modelID: number }> {
  const startTime = performance.now();

  // Set defaults
  const opts: IfcLoaderOptions = {
    mergeMeshes: true,
    generateNormals: false,
    usePBR: false,
    coordinateToOrigin: true,
    verbose: false,
    batchSize: 100,
    doubleSided: true,
    ...options,
  };

  try {
    // Load the IFC file
    const modelID = await loadIfcFile(ifcAPI, source, opts);

    // Extract and display metadata
    if (opts.verbose) {
      console.log("\n📋 IFC File Metadata:");
      const metadata = extractIfcMetadata(ifcAPI, modelID);
      console.log(`  Project: ${metadata.projectName || "N/A"}`);
      console.log(`  Description: ${metadata.projectDescription || "N/A"}`);
      console.log(`  Software: ${metadata.software || "N/A"}`);
      console.log(`  Author: ${metadata.author || "N/A"}`);
      console.log(`  Organization: ${metadata.organization || "N/A"}`);
    }

    // Load geometry and create meshes
    const { meshes, stats } = loadIfcGeometryAsMeshes(ifcAPI, modelID, scene, opts);

    const totalTime = performance.now() - startTime;

    console.log(`\n✓ IFC loaded successfully in ${totalTime.toFixed(2)}ms`);
    console.log(`  ${meshes.length} meshes, ${stats.triangleCount.toLocaleString()} triangles`);

    return { meshes, stats, modelID };
  } catch (error) {
    console.error("❌ Failed to load IFC:", error);
    throw error;
  }
}

/**
 * Clean up IFC model and free memory
 */
export function cleanupIfcModel(ifcAPI: WebIFC.IfcAPI, modelID: number): void {
  if (ifcAPI.IsModelOpen(modelID)) {
    ifcAPI.CloseModel(modelID);
    console.log(`✓ Model ${modelID} closed and memory freed`);
  }
}

/**
 * Get model bounds for camera framing
 */
export function getModelBounds(meshes: AbstractMesh[]): {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  size: Vector3;
  diagonal: number;
} | null {
  if (meshes.length === 0) return null;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  meshes.forEach((mesh) => {
    const bounds = mesh.getBoundingInfo().boundingBox;
    const worldMin = bounds.minimumWorld;
    const worldMax = bounds.maximumWorld;

    minX = Math.min(minX, worldMin.x);
    minY = Math.min(minY, worldMin.y);
    minZ = Math.min(minZ, worldMin.z);
    maxX = Math.max(maxX, worldMax.x);
    maxY = Math.max(maxY, worldMax.y);
    maxZ = Math.max(maxZ, worldMax.z);
  });

  const min = new Vector3(minX, minY, minZ);
  const max = new Vector3(maxX, maxY, maxZ);
  const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
  const diagonal = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z);

  return { min, max, center, size, diagonal };
}
