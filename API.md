# API Reference

This document provides detailed API reference for the IFC Viewer library. The codebase follows a strict layered architecture with clear separation between the IFC data layer (web-ifc) and the rendering layer (Babylon.js).

## Table of Contents

- [Babylon.js Loader Plugin (ifcLoader.ts)](#babylonjs-loader-plugin-ifcloaderts)
  - [loadIfc](#loadifc)
  - [configureIfcLoader](#configureifcloader)
  - [disposeIfc](#disposeifc)
  - [IfcLoaderPlugin](#ifcloaderplugin)
  - [Types](#types-ifcloader)
- [IFC Data Layer (ifcInit.ts)](#ifc-data-layer-ifcinitts)
  - [initializeWebIFC](#initializewebifc)
  - [loadIfcModel](#loadifcmodel)
  - [closeIfcModel](#closeifcmodel)
  - [getProjectInfo](#getprojectinfo)
  - [Types](#types-ifcinit)
- [Rendering Layer (ifcModel.ts)](#rendering-layer-ifcmodelts)
  - [buildIfcModel](#buildifcmodel)
  - [disposeIfcScene](#disposeifcscene)
  - [getModelBounds](#getmodelbounds)
  - [centerModelAtOrigin](#centermodelatorigin)
  - [Types](#types-ifcmodel)

---

## Babylon.js Loader Plugin (ifcLoader.ts)

High-level Babylon.js SceneLoader plugin for IFC files. Automatically registers with `SceneLoader` for `.ifc` file extension.

### loadIfc

Load an IFC file using the convenience function.

```typescript
async function loadIfc(
  source: string | File,
  scene: Scene,
  options?: Partial<IfcLoaderOptions>,
): Promise<IfcLoaderResult>;
```

#### Parameters

| Parameter | Type                        | Required | Description                          |
| --------- | --------------------------- | -------- | ------------------------------------ |
| `source`  | `string \| File`            | Yes      | URL path to IFC file or File object. |
| `scene`   | `Scene`                     | Yes      | Babylon.js scene instance.           |
| `options` | `Partial<IfcLoaderOptions>` | No       | Loading options.                     |

#### Returns

`Promise<IfcLoaderResult>` - Object containing meshes, root node, model ID, project info, bounds, and stats.

#### Example

```typescript
import { loadIfc, disposeIfc } from "./ifcLoader";

// Load IFC file
const result = await loadIfc("/model.ifc", scene, {
  mergeMeshes: true,
  autoCenter: true,
});

console.log(`Loaded ${result.meshes.length} meshes`);
console.log(`Project: ${result.projectInfo.projectName}`);

// Position camera
if (result.bounds) {
  camera.target = result.bounds.center;
  camera.radius = result.bounds.diagonal * 1.5;
}

// Cleanup when done
disposeIfc(scene, result.modelID);
```

---

### configureIfcLoader

Configure global loader options before loading any IFC files.

```typescript
function configureIfcLoader(options: IfcPluginOptions): void;
```

#### Parameters

| Property             | Type                        | Description                       |
| -------------------- | --------------------------- | --------------------------------- |
| `wasmPath`           | `string`                    | Custom path to web-ifc.wasm file. |
| `logLevel`           | `WebIFC.LogLevel`           | Logging level for web-ifc.        |
| `defaultLoadOptions` | `Partial<IfcLoaderOptions>` | Default options for all loads.    |

#### Example

```typescript
import { configureIfcLoader } from "./ifcLoader";
import * as WebIFC from "web-ifc";

// Configure before loading
configureIfcLoader({
  wasmPath: "./",
  logLevel: WebIFC.LogLevel.LOG_LEVEL_WARNING,
  defaultLoadOptions: {
    verbose: false,
    mergeMeshes: true,
  },
});
```

---

### disposeIfc

Dispose an IFC model and free memory.

```typescript
function disposeIfc(scene: Scene, modelID: number): void;
```

#### Example

```typescript
import { disposeIfc } from "./ifcLoader";

// Clean up when loading a new model
disposeIfc(scene, previousModelID);
```

---

### IfcLoaderPlugin

The Babylon.js SceneLoader plugin class. Use the static methods for direct loading.

#### Static Methods

| Method                               | Description                         |
| ------------------------------------ | ----------------------------------- |
| `loadAsync(source, scene, options?)` | Load IFC file directly.             |
| `disposeModel(scene, modelID)`       | Dispose model and free memory.      |
| `getLoaderResult(rootNode)`          | Get result from root node metadata. |

#### Using with SceneLoader

```typescript
import { SceneLoader } from "@babylonjs/core";
import "./ifcLoader"; // Import to register plugin

// Method 1: ImportMeshAsync
const result = await SceneLoader.ImportMeshAsync("", "/", "model.ifc", scene);
const meshes = result.meshes;

// Method 2: LoadAssetContainerAsync
const container = await SceneLoader.LoadAssetContainerAsync("/", "model.ifc", scene);
container.addAllToScene();
```

---

### Types (ifcLoader)

#### IfcLoaderResult

Result returned by the IFC loader.

```typescript
interface IfcLoaderResult {
  meshes: AbstractMesh[]; // Created meshes
  rootNode: TransformNode; // Root transform node
  modelID: number; // IFC model ID
  projectInfo: ProjectInfoResult; // Project metadata
  bounds: BoundsInfo | null; // Bounding box
  rawModel: RawIfcModel; // Raw IFC model data
  stats: BuildStats; // Build statistics
}
```

#### IfcLoaderOptions

Options for the IFC loader (combines IFC and scene options).

```typescript
interface IfcLoaderOptions extends IfcInitOptions, SceneBuildOptions {
  wasmPath?: string; // Custom WASM path
  logLevel?: WebIFC.LogLevel; // Log level
}
```

---

## IFC Data Layer (ifcInit.ts)

All web-ifc interaction. **Zero Babylon.js dependencies.**

### initializeWebIFC

Initialize the web-ifc API. This should be called once at application startup.

```typescript
async function initializeWebIFC(wasmPath?: string, logLevel?: WebIFC.LogLevel): Promise<WebIFC.IfcAPI>;
```

#### Parameters

| Parameter  | Type              | Required | Default           | Description                                                             |
| ---------- | ----------------- | -------- | ----------------- | ----------------------------------------------------------------------- |
| `wasmPath` | `string`          | No       | -                 | Custom path to the web-ifc.wasm file. Use `"./"` for production builds. |
| `logLevel` | `WebIFC.LogLevel` | No       | `LOG_LEVEL_ERROR` | Logging level for web-ifc.                                              |

#### Returns

`Promise<WebIFC.IfcAPI>` - Initialized web-ifc API instance.

#### Example

```typescript
import { initializeWebIFC } from "./ifcInit";

// Initialize with default settings
const ifcAPI = await initializeWebIFC();

// Initialize with custom WASM path (for production)
const ifcAPI = await initializeWebIFC("./");

// Initialize with custom log level
import * as WebIFC from "web-ifc";
const ifcAPI = await initializeWebIFC("./", WebIFC.LogLevel.LOG_LEVEL_WARNING);
```

#### Console Output

```
✓ Web-IFC initialized in Xms
```

---

### loadIfcModel

Load an IFC file and extract raw geometry data. Returns a `RawIfcModel` with no Babylon.js dependencies.

```typescript
async function loadIfcModel(
  ifcAPI: WebIFC.IfcAPI,
  source: string | File,
  options?: IfcInitOptions,
): Promise<RawIfcModel>;
```

#### Parameters

| Parameter | Type             | Required | Default | Description                                             |
| --------- | ---------------- | -------- | ------- | ------------------------------------------------------- |
| `ifcAPI`  | `WebIFC.IfcAPI`  | Yes      | -       | Initialized web-ifc API instance.                       |
| `source`  | `string \| File` | Yes      | -       | URL path to IFC file or File object from drag-and-drop. |
| `options` | `IfcInitOptions` | No       | `{}`    | Configuration options for loading.                      |

#### IfcInitOptions

| Property             | Type      | Default | Description                                                        |
| -------------------- | --------- | ------- | ------------------------------------------------------------------ |
| `coordinateToOrigin` | `boolean` | `true`  | Move model coordinates to origin (web-ifc `COORDINATE_TO_ORIGIN`). |
| `verbose`            | `boolean` | `true`  | Enable console logging during loading.                             |

#### Returns

`Promise<RawIfcModel>` - Raw IFC model data with geometry parts, storey map, and statistics.

#### Example

```typescript
import { loadIfcModel } from "./ifcInit";

// Load from URL
const model = await loadIfcModel(ifcAPI, "/path/to/model.ifc");

// Load from File object (drag-and-drop)
const model = await loadIfcModel(ifcAPI, fileObject);

// Load with options
const model = await loadIfcModel(ifcAPI, "/model.ifc", {
  coordinateToOrigin: true,
  verbose: true,
});

// Access model data
console.log(model.modelID); // IFC model identifier
console.log(model.parts.length); // Number of geometry parts
console.log(model.rawStats); // Statistics
```

#### Console Output (verbose mode)

```
📥 Fetching IFC from URL: /test.ifc
📥 Received 2.45 MB
📥 Opening IFC model (2.45 MB)...
📥 OpenModel returned modelID: 0

📦 Collected 1234 geometry parts

📊 Raw Model Statistics:
  Parts extracted: 1234
  Vertices: 156,789
  Triangles: 52,263
  Storey relationships: 5
```

---

### closeIfcModel

Close an IFC model and free WASM memory. Call this when disposing of a model.

```typescript
function closeIfcModel(ifcAPI: WebIFC.IfcAPI, modelID: number): void;
```

#### Parameters

| Parameter | Type            | Required | Description                            |
| --------- | --------------- | -------- | -------------------------------------- |
| `ifcAPI`  | `WebIFC.IfcAPI` | Yes      | Initialized web-ifc API instance.      |
| `modelID` | `number`        | Yes      | Model ID returned from `loadIfcModel`. |

#### Example

```typescript
import { closeIfcModel } from "./ifcInit";

// Close model and free memory
closeIfcModel(ifcAPI, model.modelID);
```

#### Console Output

```
✓ Model 0 closed and memory freed
```

---

### getProjectInfo

Extract high-level IFC project metadata (project name, application, author, organization).

```typescript
function getProjectInfo(ifcAPI: WebIFC.IfcAPI, modelID: number): ProjectInfoResult;
```

#### Parameters

| Parameter | Type            | Required | Description                            |
| --------- | --------------- | -------- | -------------------------------------- |
| `ifcAPI`  | `WebIFC.IfcAPI` | Yes      | Initialized web-ifc API instance.      |
| `modelID` | `number`        | Yes      | Model ID returned from `loadIfcModel`. |

#### Returns

`ProjectInfoResult` - Project metadata object.

#### Example

```typescript
import { getProjectInfo } from "./ifcInit";

const projectInfo = getProjectInfo(ifcAPI, model.modelID);

console.log(projectInfo.projectName); // "My Building Project"
console.log(projectInfo.projectDescription); // "A sample building"
console.log(projectInfo.application); // "Revit 2024"
console.log(projectInfo.author); // "John Doe"
console.log(projectInfo.organization); // "ACME Corp"
```

---

### Types (ifcInit)

#### RawIfcModel

Complete raw model returned by `loadIfcModel`.

```typescript
interface RawIfcModel {
  modelID: number; // IFC model identifier
  parts: RawGeometryPart[]; // Array of geometry parts
  storeyMap: Map<number, number>; // Element ID to storey ID mapping
  rawStats: {
    partCount: number; // Number of geometry parts
    vertexCount: number; // Total vertices
    triangleCount: number; // Total triangles
  };
}
```

#### RawGeometryPart

Single piece of placed geometry from web-ifc.

```typescript
interface RawGeometryPart {
  expressID: number; // IFC element express ID
  geometryExpressID: number; // Geometry express ID
  positions: Float32Array; // Vertex positions (x, y, z)
  normals: Float32Array; // Vertex normals (nx, ny, nz)
  indices: Uint32Array; // Triangle indices
  flatTransform: number[]; // 4x4 transformation matrix (16 values)
  color: {
    // RGBA color (normalized 0-1)
    x: number; // R
    y: number; // G
    z: number; // B
    w: number; // A
  } | null;
  colorId: number; // Unique color identifier
}
```

#### IfcInitOptions

Configuration for IFC loader.

```typescript
interface IfcInitOptions {
  coordinateToOrigin?: boolean; // Move to origin (default: true)
  verbose?: boolean; // Console logging (default: true)
}
```

#### ProjectInfoResult

Project metadata extracted from IFC file.

```typescript
interface ProjectInfoResult {
  projectName: string | null; // IFC project name
  projectDescription: string | null; // Project description
  application: string | null; // Creating application
  author: string | null; // Author name
  organization: string | null; // Organization name
}
```

---

## Rendering Layer (ifcModel.ts)

All Babylon.js scene construction. **Zero web-ifc dependencies.**

### buildIfcModel

Build a Babylon.js scene from raw IFC model data.

```typescript
function buildIfcModel(model: RawIfcModel, scene: Scene, options?: SceneBuildOptions): SceneBuildResult;
```

#### Parameters

| Parameter | Type                | Required | Description                               |
| --------- | ------------------- | -------- | ----------------------------------------- |
| `model`   | `RawIfcModel`       | Yes      | Raw model data from `loadIfcModel`.       |
| `scene`   | `Scene`             | Yes      | Babylon.js scene instance.                |
| `options` | `SceneBuildOptions` | No       | Configuration options for scene building. |

#### SceneBuildOptions

| Property           | Type      | Default | Description                                      |
| ------------------ | --------- | ------- | ------------------------------------------------ |
| `mergeMeshes`      | `boolean` | `true`  | Merge meshes with same material for performance. |
| `autoCenter`       | `boolean` | `true`  | Center model at origin.                          |
| `doubleSided`      | `boolean` | `true`  | Disable backface culling (render both sides).    |
| `generateNormals`  | `boolean` | `false` | Generate normals if missing.                     |
| `verbose`          | `boolean` | `true`  | Enable console logging during building.          |
| `freezeAfterBuild` | `boolean` | `true`  | Freeze meshes and materials for performance.     |

#### Returns

`SceneBuildResult` - Object containing meshes, root node, and statistics.

#### Example

```typescript
import { buildIfcModel } from "./ifcModel";

const { meshes, rootNode, stats } = buildIfcModel(model, scene, {
  mergeMeshes: true,
  autoCenter: true,
  doubleSided: true,
  generateNormals: false,
  verbose: true,
  freezeAfterBuild: true,
});

console.log(`Created ${meshes.length} meshes`);
console.log(`Build time: ${stats.buildTimeMs}ms`);
```

#### Console Output (verbose mode)

```
🏗️  Building Babylon.js scene from 1234 raw parts...
  Created 1234 initial meshes
  Grouped into 567 unique (expressID + material) combinations

📍 Model auto-centered at origin (offset: 10.50, 0.00, -5.25)

✅ Scene building complete:
  Original parts: 1234
  Merged groups: 100
  Skipped groups: 5
  Final meshes: 1129
  Materials created: 15
  Build time: 234.56ms
  IFC meshes and materials frozen for optimal performance
```

---

### disposeIfcScene

Dispose all IFC meshes, materials, and the root node. Call this before loading a new model.

```typescript
function disposeIfcScene(scene: Scene): void;
```

#### Parameters

| Parameter | Type    | Required | Description                |
| --------- | ------- | -------- | -------------------------- |
| `scene`   | `Scene` | Yes      | Babylon.js scene instance. |

#### Example

```typescript
import { disposeIfcScene } from "./ifcModel";

// Clean up before loading new model
disposeIfcScene(scene);
```

#### Console Output

```
✓ ifc-root node and all child meshes disposed
✓ 15 IFC materials disposed
```

---

### getModelBounds

Calculate bounding box for a set of meshes. Useful for camera positioning.

```typescript
function getModelBounds(meshes: AbstractMesh[]): BoundsInfo | null;
```

#### Parameters

| Parameter | Type             | Required | Description                              |
| --------- | ---------------- | -------- | ---------------------------------------- |
| `meshes`  | `AbstractMesh[]` | Yes      | Array of meshes to calculate bounds for. |

#### Returns

`BoundsInfo | null` - Bounding box information, or `null` if no valid meshes.

#### Example

```typescript
import { getModelBounds } from "./ifcModel";

const bounds = getModelBounds(meshes);

if (bounds) {
  console.log(`Center: ${bounds.center}`);
  console.log(`Size: ${bounds.size}`);
  console.log(`Diagonal: ${bounds.diagonal}`);

  // Position camera
  camera.target = bounds.center;
  camera.radius = bounds.diagonal * 1.5;
}
```

---

### centerModelAtOrigin

Manually center a model at the origin. Useful when `autoCenter` option is disabled.

```typescript
function centerModelAtOrigin(meshes: AbstractMesh[], rootNode?: TransformNode): Vector3;
```

#### Parameters

| Parameter  | Type             | Required | Description                   |
| ---------- | ---------------- | -------- | ----------------------------- |
| `meshes`   | `AbstractMesh[]` | Yes      | Array of meshes to center.    |
| `rootNode` | `TransformNode`  | No       | Root node to apply offset to. |

#### Returns

`Vector3` - The offset vector that was applied.

#### Example

```typescript
import { centerModelAtOrigin } from "./ifcModel";

const offset = centerModelAtOrigin(meshes, rootNode);
console.log(`Model centered with offset: ${offset}`);
```

---

### Types (ifcModel)

#### SceneBuildOptions

Configuration for scene building.

```typescript
interface SceneBuildOptions {
  mergeMeshes?: boolean; // Merge meshes with same material (default: true)
  autoCenter?: boolean; // Center model at origin (default: true)
  doubleSided?: boolean; // Disable backface culling (default: true)
  generateNormals?: boolean; // Generate normals if missing (default: false)
  verbose?: boolean; // Console logging (default: true)
  freezeAfterBuild?: boolean; // Freeze for performance (default: true)
}
```

#### SceneBuildResult

Result of building a scene.

```typescript
interface SceneBuildResult {
  meshes: AbstractMesh[]; // Created meshes
  rootNode: TransformNode; // Root transform node
  stats: BuildStats; // Build statistics
}
```

#### BuildStats

Statistics from scene building.

```typescript
interface BuildStats {
  originalPartCount: number; // Original geometry parts
  finalMeshCount: number; // Final mesh count after merging
  mergedGroupCount: number; // Successfully merged groups
  skippedGroupCount: number; // Groups that couldn't be merged
  materialCount: number; // Materials created
  buildTimeMs: number; // Build time in milliseconds
}
```

#### BoundsInfo

Bounds information for camera framing.

```typescript
interface BoundsInfo {
  min: Vector3; // Minimum corner
  max: Vector3; // Maximum corner
  center: Vector3; // Center point
  size: Vector3; // Size (width, height, depth)
  diagonal: number; // Diagonal length
}
```

---

## Complete Usage Example

```typescript
import { initializeWebIFC, loadIfcModel, closeIfcModel, getProjectInfo } from "./ifcInit";
import { buildIfcModel, disposeIfcScene, getModelBounds } from "./ifcModel";
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3 } from "@babylonjs/core";

// Step 1: Initialize web-ifc
const ifcAPI = await initializeWebIFC("./");

// Step 2: Create Babylon.js scene
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// Step 3: Setup camera and lighting
const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, Vector3.Zero(), scene);
camera.attachControl(canvas, true);
const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);

// Step 4: Load IFC model
const model = await loadIfcModel(ifcAPI, "/model.ifc", {
  coordinateToOrigin: true,
  verbose: true,
});

// Step 5: Get project info
const projectInfo = getProjectInfo(ifcAPI, model.modelID);
console.log(`Project: ${projectInfo.projectName}`);

// Step 6: Build Babylon.js scene
const { meshes, rootNode, stats } = buildIfcModel(model, scene, {
  autoCenter: true,
  mergeMeshes: true,
  doubleSided: true,
  verbose: true,
});

// Step 7: Position camera
const bounds = getModelBounds(meshes);
if (bounds) {
  camera.target = bounds.center;
  camera.radius = bounds.diagonal * 1.5;
}

// Step 8: Render loop
engine.runRenderLoop(() => scene.render());

// Cleanup when loading new model
function cleanup() {
  disposeIfcScene(scene);
  closeIfcModel(ifcAPI, model.modelID);
}
```

---

## Mesh Metadata

All meshes created by `buildIfcModel` have metadata attached:

```typescript
mesh.metadata = {
  expressID: number, // IFC element express ID
  modelID: number, // IFC model ID
};
```

Use this for element picking and querying:

```typescript
scene.onPointerDown = (evt, pickResult) => {
  if (pickResult.hit && pickResult.pickedMesh?.metadata) {
    const { expressID, modelID } = pickResult.pickedMesh.metadata;
    const element = ifcAPI.GetLine(modelID, expressID, true);
    const typeName = ifcAPI.GetNameFromTypeCode(element.type);
    console.log(`Picked: ${typeName} (ID: ${expressID})`);
  }
};
```

---

## Performance Notes

1. **Mesh Merging**: Enabled by default, significantly reduces draw calls
2. **Freezing**: Meshes and materials are frozen after build for optimal performance
3. **Memory**: Always call `closeIfcModel` when done with a model to free WASM memory
4. **Z-Fighting**: Materials have incremental `zOffset` to mitigate visual artifacts
5. **Coordinate System**: Z-axis flip is applied via root node scaling for IFC-to-Babylon conversion

---

## Error Handling

```typescript
try {
  const model = await loadIfcModel(ifcAPI, "/model.ifc");
} catch (error) {
  console.error("Failed to load IFC:", error);
  // Handle error (show user message, etc.)
}

// Check if model is open before closing
if (ifcAPI.IsModelOpen(modelID)) {
  closeIfcModel(ifcAPI, modelID);
}
```
