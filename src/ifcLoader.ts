import * as WebIFC from "web-ifc";
import {
  Scene,
  Mesh,
  VertexData,
  Matrix,
  AbstractMesh,
  TransformNode,
  Vector3,
  Color3,
  StandardMaterial,
  VertexBuffer,
  GroundMesh,
  Texture,
  Tools,
  MeshBuilder,
} from "@babylonjs/core";
import { extractIfcMetadata } from "./ifcMetadata";

// Interface for mesh with color information
interface MeshWithColor {
  mesh: Mesh;
  colorId: number;
  color: { x: number; y: number; z: number; w: number } | null;
}

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
  /** Automatically center the model at origin */
  autoCenter?: boolean;
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

/**
 * Check if meshes can be safely merged based on spatial context
 */
function canMergeMeshes(meshes: Mesh[], elementToStorey: Map<number, number>): boolean {
  const storeyIDs = new Set<number>();

  meshes.forEach((mesh) => {
    const expressID = mesh.metadata?.expressID;
    if (expressID !== undefined) {
      const storeyID = elementToStorey.get(expressID);
      if (storeyID) {
        storeyIDs.add(storeyID);
      }
    }
  });

  // Allow merge ONLY if all parts belong to same storey OR no storey assignment
  return storeyIDs.size <= 1;
}

/**
 * Load IFC geometry and convert to Babylon.js meshes with intelligent merging
 */
function loadIfcGeometryAsMeshes(
  ifcAPI: WebIFC.IfcAPI,
  modelID: number,
  scene: Scene,
  options: IfcLoaderOptions = {},
): { meshes: AbstractMesh[]; stats: LoaderStats; rootNode: TransformNode } {
  const startTime = performance.now();

  // Create root transform node for better organization
  const rootNode = new TransformNode("ifc-root", scene);

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

  // Collect all meshes with their color information
  const meshesWithColor: MeshWithColor[] = [];

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

          // Update bounds (local space for now)
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

        // Get the expressID and color from the flatMesh
        const expressID = flatMesh.expressID;
        const color = placedGeometry.color;

        // Calculate color ID
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

        // Create mesh name (temporary, will be updated after merging)
        const meshName = `ifc-${expressID}-part-${i}`;

        // Create mesh
        const mesh = new Mesh(meshName, scene);
        mesh.parent = rootNode;

        // Add metadata with expressID and modelID
        mesh.metadata = {
          expressID: expressID,
          modelID: modelID,
        };

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

        // Make mesh visible (no material assigned yet)
        mesh.isVisible = true;

        // Store mesh with color information
        meshesWithColor.push({
          mesh: mesh,
          colorId: colorId,
          color: color,
        });

        // Clean up WASM memory
        (geometry as any)?.delete?.();
      } catch (error) {
        console.error(`Error processing geometry:`, error);
        (geometry as any)?.delete?.();
      }
    }
  });

  console.log(`\n📦 Collected ${meshesWithColor.length} mesh parts`);

  // Build storey map for spatial context
  const elementToStorey = buildStoreyMap(ifcAPI, modelID);
  console.log(`📍 Built storey map with ${elementToStorey.size} element-storey relationships`);

  // Step 1: Group by (expressID + colorId)
  const groupKey = (expressID: number, colorId: number) => `${expressID}-${colorId}`;
  const meshGroups = new Map<string, MeshWithColor[]>();

  meshesWithColor.forEach((item) => {
    const expressID = item.mesh.metadata!.expressID;
    const key = groupKey(expressID, item.colorId);

    if (!meshGroups.has(key)) {
      meshGroups.set(key, []);
    }
    meshGroups.get(key)!.push(item);
  });

  console.log(`🔗 Grouped into ${meshGroups.size} unique (expressID + material) combinations`);

  // Step 2: Create materials and merge groups with safety checks
  const materialCache = new Map<number, StandardMaterial>();
  const finalMeshes: AbstractMesh[] = [];
  let mergedCount = 0;
  let skippedCount = 0;
  let materialZOffset = 0; // Counter for z-offset to prevent z-fighting

  // Helper function to get or create material
  const getMaterial = (
    colorId: number,
    color: { x: number; y: number; z: number; w: number } | null,
  ): StandardMaterial => {
    if (materialCache.has(colorId)) {
      return materialCache.get(colorId)!;
    }

    const material = new StandardMaterial(`ifc-material-${colorId}`, scene);

    if (color) {
      material.diffuseColor = new Color3(color.x, color.y, color.z);
      material.alpha = color.w;
    } else {
      // Default gray color
      material.diffuseColor = new Color3(0.8, 0.8, 0.8);
    }

    // Add z-offset to prevent z-fighting between overlapping surfaces
    material.zOffset = materialZOffset;
    materialZOffset += 0.1; // Increment for next material

    // Enable backface culling for better performance
    material.backFaceCulling = false;

    materialCache.set(colorId, material);
    return material;
  };

  meshGroups.forEach((group) => {
    const meshes = group.map((item) => item.mesh);
    const expressID = meshes[0].metadata!.expressID;
    const colorId = group[0].colorId;
    const color = group[0].color;

    // Get or create material for this color
    const material = getMaterial(colorId, color);

    if (meshes.length === 1) {
      // Single mesh - no merging needed
      const mesh = meshes[0];
      mesh.name = `ifc-${expressID}`;
      mesh.material = material; // Assign material
      finalMeshes.push(mesh);
    } else {
      // Multiple meshes - check if we can merge
      const canMerge = canMergeMeshes(meshes, elementToStorey);

      if (canMerge) {
        // Safe to merge - all parts in same storey or no storey
        const mergedMesh = Mesh.MergeMeshes(
          meshes,
          true, // disposeSource - DISPOSE original meshes
          true, // allow32BitsIndices
          undefined, // meshSubclass
          false, // subdivideWithSubMeshes - NO SUBMESHES!
          false, // multiMultiMaterials - we handle materials ourselves
        );

        if (mergedMesh) {
          mergedMesh.name = `ifc-${expressID}`;
          mergedMesh.parent = rootNode;
          mergedMesh.material = material; // Assign material AFTER merging

          // PRESERVE SEMANTIC IDENTITY - copy metadata from first mesh
          mergedMesh.metadata = {
            expressID: expressID,
            modelID: modelID,
          };

          mergedMesh.isVisible = true;
          finalMeshes.push(mergedMesh);
          mergedCount++;
        } else {
          // Merge failed - keep original meshes
          meshes.forEach((mesh) => {
            mesh.name = `ifc-${expressID}`;
            mesh.material = material; // Assign material
            finalMeshes.push(mesh);
          });
          skippedCount++;
        }
      } else {
        // Cannot merge - different storeys
        meshes.forEach((mesh) => {
          mesh.name = `ifc-${expressID}`;
          mesh.material = material; // Assign material
          finalMeshes.push(mesh);
        });
        skippedCount++;
        console.log(`  ⚠ Skipped merging ${meshes.length} parts for expressID ${expressID} (different storeys)`);
      }
    }
  });

  console.log(`\n✅ Merging complete:`);
  console.log(`  Original parts: ${meshesWithColor.length}`);
  console.log(`  Merged groups: ${mergedCount}`);
  console.log(`  Skipped groups: ${skippedCount}`);
  console.log(`  Final meshes: ${finalMeshes.length}`);
  console.log(`  Materials created: ${materialCache.size}`);

  // Apply Z-axis flip for coordinate system conversion (IFC to Babylon)
  rootNode.scaling.z = -1;

  // Force update of world matrix to apply scaling
  rootNode.computeWorldMatrix(true);

  // Recalculate bounds in world space after scaling
  boundsMin = { x: Infinity, y: Infinity, z: Infinity };
  boundsMax = { x: -Infinity, y: -Infinity, z: -Infinity };

  finalMeshes.forEach((mesh) => {
    const worldMatrix = mesh.getWorldMatrix();
    const vertices = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!vertices) return;

    for (let i = 0; i < vertices.length; i += 3) {
      const localPoint = new Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
      const worldPoint = Vector3.TransformCoordinates(localPoint, worldMatrix);

      boundsMin.x = Math.min(boundsMin.x, worldPoint.x);
      boundsMin.y = Math.min(boundsMin.y, worldPoint.y);
      boundsMin.z = Math.min(boundsMin.z, worldPoint.z);
      boundsMax.x = Math.max(boundsMax.x, worldPoint.x);
      boundsMax.y = Math.max(boundsMax.y, worldPoint.y);
      boundsMax.z = Math.max(boundsMax.z, worldPoint.z);
    }
  });

  // Calculate bounds center in world space
  const bounds = {
    min: boundsMin,
    max: boundsMax,
    center: {
      x: (boundsMin.x + boundsMax.x) / 2,
      y: (boundsMin.y + boundsMax.y) / 2,
      z: (boundsMin.z + boundsMax.z) / 2,
    },
  };

  // Auto-center the model if requested
  if (options.autoCenter) {
    const centerOffset = new Vector3(bounds.center.x, bounds.center.y, bounds.center.z);
    rootNode.position.subtractInPlace(centerOffset);

    // Recalculate bounds after centering
    boundsMin = { x: boundsMin.x - centerOffset.x, y: boundsMin.y - centerOffset.y, z: boundsMin.z - centerOffset.z };
    boundsMax = { x: boundsMax.x - centerOffset.x, y: boundsMax.y - centerOffset.y, z: boundsMax.z - centerOffset.z };
    bounds.center = { x: 0, y: 0, z: 0 };

    console.log(`📍 Model auto-centered at origin`);
  }

  // Update stats
  stats.mergedMeshCount = finalMeshes.length;
  stats.materialCount = materialCache.size;
  stats.loadTimeMs = performance.now() - startTime;

  if (options.verbose) {
    console.log(`\n📊 Loading Statistics:`);
    console.log(`  Original parts: ${stats.originalMeshCount}`);
    console.log(`  Final meshes: ${stats.mergedMeshCount}`);
    console.log(`  Vertices: ${stats.vertexCount.toLocaleString()}`);
    console.log(`  Triangles: ${stats.triangleCount.toLocaleString()}`);
    console.log(`  Materials: ${stats.materialCount}`);
    console.log(`  Load time: ${stats.loadTimeMs.toFixed(2)}ms`);
    console.log(
      `  Bounds: X[${bounds.min.x.toFixed(2)}, ${bounds.max.x.toFixed(2)}] ` +
        `Y[${bounds.min.y.toFixed(2)}, ${bounds.max.y.toFixed(2)}] ` +
        `Z[${bounds.min.z.toFixed(2)}, ${bounds.max.z.toFixed(2)}]`,
    );
    console.log(
      `  Center: (${bounds.center.x.toFixed(2)}, ${bounds.center.y.toFixed(2)}, ${bounds.center.z.toFixed(2)})`,
    );
  }

  return { meshes: finalMeshes, stats, rootNode };
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
): Promise<{ meshes: AbstractMesh[]; stats: LoaderStats; modelID: number; rootNode: TransformNode }> {
  const startTime = performance.now();

  // Set defaults
  const opts: IfcLoaderOptions = {
    generateNormals: false,
    coordinateToOrigin: true,
    verbose: true,
    autoCenter: true, // Enable auto-centering by default
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
    const { meshes, stats, rootNode } = loadIfcGeometryAsMeshes(ifcAPI, modelID, scene, opts);

    const totalTime = performance.now() - startTime;

    console.log(`\n✓ IFC loaded successfully in ${totalTime.toFixed(2)}ms`);
    console.log(`  ${meshes.length} meshes, ${stats.triangleCount.toLocaleString()} triangles`);

    return { meshes, stats, modelID, rootNode };
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
 * Dispose all meshes, materials, and the root node
 */
export function disposeIfcScene(scene: Scene): void {
  // Dispose all IFC materials
  let materialCount = 0;
  scene.materials.forEach((material) => {
    if (material.name.startsWith("ifc-material-")) {
      material.dispose();
      materialCount++;
    }
  });

  // Find and dispose the ifc-root node (this will dispose all child meshes)
  const rootNode = scene.getTransformNodeByName("ifc-root");
  if (rootNode) {
    rootNode.dispose();
    console.log(`✓ ifc-root node and all child meshes disposed`);
  }

  if (materialCount > 0) {
    console.log(`✓ ${materialCount} IFC materials disposed`);
  }
}

/**
 * Get model bounds for camera framing
 */
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
  let validBoundsFound = false;

  meshes.forEach((mesh) => {
    if (!mesh.isVisible || mesh.getTotalVertices() === 0) return;

    // Force update of bounding info
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(false, false);

    // Get the bounding info
    const boundingInfo = mesh.getBoundingInfo();

    // Get min and max in world space
    const min = boundingInfo.boundingBox.minimumWorld;
    const max = boundingInfo.boundingBox.maximumWorld;

    // Update bounds
    minX = Math.min(minX, min.x);
    minY = Math.min(minY, min.y);
    minZ = Math.min(minZ, min.z);
    maxX = Math.max(maxX, max.x);
    maxY = Math.max(maxY, max.y);
    maxZ = Math.max(maxZ, max.z);

    validBoundsFound = true;
  });

  if (!validBoundsFound) return null;

  const min = new Vector3(minX, minY, minZ);
  const max = new Vector3(maxX, maxY, maxZ);
  const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
  const diagonal = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z);

  return { min, max, center, size, diagonal };
}

/**
 * Center the model at origin (useful for camera positioning)
 */
export function centerModelAtOrigin(meshes: AbstractMesh[], rootNode?: TransformNode): Vector3 {
  const bounds = getModelBounds(meshes);
  if (!bounds) return Vector3.Zero();

  const offset = bounds.center.clone();

  if (rootNode) {
    // Move the entire root node to center the model
    rootNode.position.subtractInPlace(offset);
  } else {
    // Move individual meshes
    meshes.forEach((mesh) => {
      mesh.position.subtractInPlace(offset);
    });
  }

  console.log(
    `📍 Model centered at origin, offset: (${offset.x.toFixed(2)}, ${offset.y.toFixed(2)}, ${offset.z.toFixed(2)})`,
  );

  return offset;
}

//
/**
 * Create a ground plane positioned slightly below the model
 * @param scene The Babylon.js scene
 * @param meshes Array of meshes to determine model bounds
 * @param options Configuration options for the ground
 * @returns The created ground mesh
 */
export function createGroundBelowModel(
  scene: Scene,
  meshes: AbstractMesh[],
  options?: {
    size?: number;
    offset?: number;
    gridRatio?: number;
    majorUnitFrequency?: number;
    opacity?: number;
    color?: Color3;
  },
): GroundMesh | null {
  // Get model bounds
  const bounds = getModelBounds(meshes);
  if (!bounds) {
    console.warn("Cannot create ground: No valid model bounds");
    return null;
  }

  // Set default options
  const size = options?.size ?? 1000;
  const offset = options?.offset ?? 2.0; // Position ground 2 units below model by default
  const gridRatio = options?.gridRatio ?? 0.01;
  const majorUnitFrequency = options?.majorUnitFrequency ?? 10;
  const opacity = options?.opacity ?? 0.8;
  const color = options?.color ?? new Color3(1, 1, 1);

  // Calculate ground Y position (slightly below the model's bottom)
  const groundY = bounds.min.y - offset;

  console.log(
    `📍 Positioning ground at Y = ${groundY.toFixed(2)} (model bottom: ${bounds.min.y.toFixed(2)}, offset: ${offset})`,
  );

  // Create the ground
  const ground = MeshBuilder.CreateGround(
    "ifc-ground",
    {
      width: size,
      height: size,
      subdivisions: 100, // Good for grid visibility
    },
    scene,
  );

  // Position the ground
  ground.position = new Vector3(bounds.center.x, groundY, bounds.center.z);

  // Create and configure grid material
  const groundMaterial = new GridMaterial("ifc-ground-material", scene);

  // Grid appearance settings
  groundMaterial.majorUnitFrequency = majorUnitFrequency;
  groundMaterial.minorUnitVisibility = 0.3;
  groundMaterial.gridRatio = gridRatio;
  groundMaterial.backFaceCulling = false;
  groundMaterial.mainColor = color;
  groundMaterial.lineColor = color;
  groundMaterial.opacity = opacity;

  // Add subtle transparency texture for better visibility
  const textureUrl = Tools.GetAssetUrl("https://assets.babylonjs.com/core/environments/backgroundGround.png");
  groundMaterial.opacityTexture = new Texture(textureUrl, scene);

  // Prevent z-fighting with model
  groundMaterial.zOffset = 1.0;

  ground.material = groundMaterial;

  // Make ground receive shadows (if you add shadows later)
  ground.receiveShadows = true;

  console.log(`✓ Ground created: ${size}x${size} at Y=${groundY.toFixed(2)}`);

  return ground;
}

/**
 * Update ground position if model moves or changes
 */
export function updateGroundPosition(ground: GroundMesh, meshes: AbstractMesh[], offset: number = 2.0): boolean {
  const bounds = getModelBounds(meshes);
  if (!bounds || !ground) return false;

  const groundY = bounds.min.y - offset;
  ground.position.y = groundY;
  ground.position.x = bounds.center.x;
  ground.position.z = bounds.center.z;

  return true;
}
