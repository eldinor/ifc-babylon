# Web-IFC API Documentation

This document provides comprehensive documentation for the web-ifc library API methods used in this project. Web-IFC is a high-performance IFC (Industry Foundation Classes) parser and geometry extractor built on WebAssembly.

## Table of Contents

- [Core API](#core-api)
  - [IfcAPI Class](#ifcapi-class)
  - [Initialization](#initialization)
  - [Model Management](#model-management)
- [Geometry Processing](#geometry-processing)
  - [Mesh Streaming](#mesh-streaming)
  - [Geometry Data](#geometry-data)
- [Element Querying](#element-querying)
  - [Line Access](#line-access)
  - [Type Filtering](#type-filtering)
- [Constants and Types](#constants-and-types)
  - [Log Levels](#log-levels)
  - [IFC Entity Types](#ifc-entity-types)
  - [Loader Settings](#loader-settings)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)

---

## Core API

### IfcAPI Class

The main class for interacting with web-ifc. All operations are performed through an instance of this class.

```typescript
import * as WebIFC from "web-ifc";

const ifcAPI = new WebIFC.IfcAPI();
```

### Initialization

#### `Init()`

Initialize the web-ifc API. Must be called once before any other operations.

```typescript
async function Init(): Promise<void>;
```

**Example:**

```typescript
await ifcAPI.Init();
console.log("Web-IFC initialized successfully");
```

#### `SetWasmPath(path: string)`

Set the path to the web-ifc.wasm file. This should point to where the WASM file is located.

```typescript
function SetWasmPath(path: string): void;
```

**Parameters:**

- `path` (string): Path to the web-ifc.wasm file

**Example:**

```typescript
// For production builds
ifcAPI.SetWasmPath("./");

// For development
ifcAPI.SetWasmPath("/node_modules/web-ifc/");
```

#### `SetLogLevel(level: LogLevel)`

Set the logging level for web-ifc operations.

```typescript
function SetLogLevel(level: LogLevel): void;
```

**Parameters:**

- `level` (LogLevel): Logging level constant

**Example:**

```typescript
import * as WebIFC from "web-ifc";

// Set error level only (default)
ifcAPI.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_ERROR);

// Set debug level for detailed logging
ifcAPI.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_DEBUG);
```

### Model Management

#### `OpenModel(data: Uint8Array, settings: LoaderSettings): number`

Open an IFC model from binary data.

```typescript
function OpenModel(data: Uint8Array, settings: LoaderSettings): number;
```

**Parameters:**

- `data` (Uint8Array): Binary IFC file data
- `settings` (LoaderSettings): Loading configuration

**Returns:**

- `number`: Model ID (positive integer) or -1 on failure

**Example:**

```typescript
const settings: WebIFC.LoaderSettings = {
  COORDINATE_TO_ORIGIN: true,
  CIRCLE_SEGMENTS: 24,
  MEMORY_LIMIT: 2147483648,
  TAPE_SIZE: 67108864,
};

const modelID = ifcAPI.OpenModel(new Uint8Array(data), settings);
if (modelID === -1) {
  throw new Error("Failed to open IFC model");
}
```

#### `CloseModel(modelID: number): void`

Close an IFC model and free associated memory.

```typescript
function CloseModel(modelID: number): void;
```

**Parameters:**

- `modelID` (number): Model ID returned from OpenModel

**Example:**

```typescript
ifcAPI.CloseModel(modelID);
```

#### `IsModelOpen(modelID: number): boolean`

Check if a model is currently open.

```typescript
function IsModelOpen(modelID: number): boolean;
```

**Parameters:**

- `modelID` (number): Model ID to check

**Returns:**

- `boolean`: true if model is open, false otherwise

**Example:**

```typescript
if (ifcAPI.IsModelOpen(modelID)) {
  ifcAPI.CloseModel(modelID);
}
```

---

## Geometry Processing

### Mesh Streaming

#### `StreamAllMeshes(modelID: number, callback: (mesh: FlatMesh) => void): void`

Stream all meshes from an IFC model. This is the most efficient way to process large models.

```typescript
function StreamAllMeshes(modelID: number, callback: (mesh: FlatMesh) => void): void;
```

**Parameters:**

- `modelID` (number): Open model ID
- `callback` (function): Callback function called for each mesh

**Example:**

```typescript
ifcAPI.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
  const expressID = flatMesh.expressID;
  const geometries = flatMesh.geometries;

  for (let i = 0; i < geometries.size(); i++) {
    const placedGeometry = geometries.get(i);
    // Process each placed geometry
  }
});
```

### Geometry Data

#### `GetGeometry(modelID: number, geometryExpressID: number): FlatGeometry`

Get geometry data for a specific geometry element.

```typescript
function GetGeometry(modelID: number, geometryExpressID: number): FlatGeometry;
```

**Parameters:**

- `modelID` (number): Open model ID
- `geometryExpressID` (number): Geometry element ID

**Returns:**

- `FlatGeometry`: Geometry data object

**Example:**

```typescript
const geometry = ifcAPI.GetGeometry(modelID, geometryExpressID);
if (geometry) {
  const vertexData = geometry.GetVertexData();
  const vertexDataSize = geometry.GetVertexDataSize();
  const indexData = geometry.GetIndexData();
  const indexDataSize = geometry.GetIndexDataSize();
}
```

#### `GetVertexArray(data: number, size: number): Float32Array`

Extract vertex array from raw geometry data.

```typescript
function GetVertexArray(data: number, size: number): Float32Array;
```

**Parameters:**

- `data` (number): Pointer to vertex data
- `size` (number): Size of vertex data

**Returns:**

- `Float32Array`: Vertex array in format [x,y,z,nx,ny,nz,...]

**Example:**

```typescript
const geometry = ifcAPI.GetGeometry(modelID, geometryExpressID);
const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());

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
```

#### `GetIndexArray(data: number, size: number): Uint32Array`

Extract index array from raw geometry data.

```typescript
function GetIndexArray(data: number, size: number): Uint32Array;
```

**Parameters:**

- `data` (number): Pointer to index data
- `size` (number): Size of index data

**Returns:**

- `Uint32Array`: Triangle index array

**Example:**

```typescript
const geometry = ifcAPI.GetGeometry(modelID, geometryExpressID);
const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

// Process triangles
for (let i = 0; i < indices.length; i += 3) {
  const v1 = indices[i];
  const v2 = indices[i + 1];
  const v3 = indices[i + 2];
  // Process triangle
}
```

---

## Element Querying

### Line Access

#### `GetLine(modelID: number, expressID: number, includeAllData?: boolean): any`

Get complete element data for a specific IFC element.

```typescript
function GetLine(modelID: number, expressID: number, includeAllData?: boolean): any;
```

**Parameters:**

- `modelID` (number): Open model ID
- `expressID` (number): Element express ID
- `includeAllData` (boolean, optional): Include all properties (default: false)

**Returns:**

- `any`: Element data object with all properties

**Example:**

```typescript
// Get basic element data
const element = ifcAPI.GetLine(modelID, expressID);

// Get full element data with all properties
const fullElement = ifcAPI.GetLine(modelID, expressID, true);

console.log("Element type:", element.type);
console.log("Element name:", element.Name?.value);
console.log("Element description:", element.Description?.value);
```

#### `GetNameFromTypeCode(type: number): string`

Get the IFC type name from a type code.

```typescript
function GetNameFromTypeCode(type: number): string;
```

**Parameters:**

- `type` (number): IFC type code

**Returns:**

- `string`: Type name (e.g., "IFCWALL", "IFCDOOR", "IFCWINDOW")

**Example:**

```typescript
const element = ifcAPI.GetLine(modelID, expressID);
const typeName = ifcAPI.GetNameFromTypeCode(element.type);
console.log(`Element type: ${typeName}`);
```

### Type Filtering

#### `GetLineIDsWithType(modelID: number, type: number): number[]`

Get all element IDs of a specific IFC type.

```typescript
function GetLineIDsWithType(modelID: number, type: number): number[];
```

**Parameters:**

- `modelID` (number): Open model ID
- `type` (number): IFC type constant

**Returns:**

- `number[]`: Array of element IDs

**Example:**

```typescript
// Get all walls
const wallIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCWALL);

// Get all doors
const doorIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCDOOR);

// Get all windows
const windowIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCWINDOW);

// Process all walls
for (const wallID of wallIDs) {
  const wall = ifcAPI.GetLine(modelID, wallID);
  console.log(`Wall ${wallID}: ${wall.Name?.value}`);
}
```

---

## Constants and Types

### Log Levels

```typescript
enum LogLevel {
  LOG_LEVEL_ERROR = 0, // Error messages only
  LOG_LEVEL_WARNING = 1, // Warnings and errors
  LOG_LEVEL_INFO = 2, // Info, warnings, and errors
  LOG_LEVEL_DEBUG = 3, // All messages
}
```

### IFC Entity Types

Common IFC entity type constants:

```typescript
// Building elements
WebIFC.IFCWALL;
WebIFC.IFCDOOR;
WebIFC.IFCWINDOW;
WebIFC.IFCSLAB;
WebIFC.IFCROOF;
WebIFC.IFCSTAIR;
WebIFC.IFCCOLUMN;
WebIFC.IFCBEAM;

// Spatial elements
WebIFC.IFCPROJECT;
WebIFC.IFCBUILDING;
WebIFC.IFCBUILDINGSTOREY;
WebIFC.IFCSPACE;

// Structural elements
WebIFC.IFCSTRUCTURALMEMBER;
WebIFC.IFCSTRUCTURALCURVEMEMBER;
WebIFC.IFCSTRUCTURALSURFACEMEMBER;

// MEP elements
WebIFC.IFCPIPEFITTING;
WebIFC.IFCPIPESEGMENT;
WebIFC.IFCDUCTFITTING;
WebIFC.IFCDUCTSEGMENT;

// People and organizations
WebIFC.IFCPERSON;
WebIFC.IFCORGANIZATION;
WebIFC.IFCAPPLICATION;

// Relationships
WebIFC.IFCRELAGGREGATES;
WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE;
WebIFC.IFCRELASSIGNSTO;
```

### Loader Settings

Configuration options for model loading:

```typescript
interface LoaderSettings {
  COORDINATE_TO_ORIGIN?: boolean; // Move model to origin (default: true)
  CIRCLE_SEGMENTS?: number; // Circle approximation segments (default: 24)
  MEMORY_LIMIT?: number; // Memory limit in bytes (default: 2GB)
  TAPE_SIZE?: number; // Tape size for parsing (default: 64MB)
}
```

---

## Error Handling

### Common Error Scenarios

1. **Failed Model Opening**

```typescript
const modelID = ifcAPI.OpenModel(data, settings);
if (modelID === -1) {
  throw new Error("Failed to open IFC model - invalid file or insufficient memory");
}
```

2. **Invalid Model ID**

```typescript
if (!ifcAPI.IsModelOpen(modelID)) {
  throw new Error("Model is not open or has been closed");
}
```

3. **Memory Management**

```typescript
// Always close models when done
ifcAPI.CloseModel(modelID);

// Check if model is still open before operations
if (ifcAPI.IsModelOpen(modelID)) {
  // Safe to use model
}
```

4. **Geometry Processing Errors**

```typescript
try {
  const geometry = ifcAPI.GetGeometry(modelID, geometryExpressID);
  if (!geometry) {
    console.warn(`No geometry found for ID: ${geometryExpressID}`);
    return;
  }

  const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
  const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

  // Process geometry...
} catch (error) {
  console.error("Error processing geometry:", error);
}
```

---

## Performance Considerations

### Memory Management

1. **Always Close Models**

```typescript
// Good practice
const modelID = ifcAPI.OpenModel(data, settings);
// ... use model
ifcAPI.CloseModel(modelID); // Free memory
```

2. **Use Streaming for Large Models**

```typescript
// Efficient for large models
ifcAPI.StreamAllMeshes(modelID, (mesh) => {
  // Process each mesh individually
});

// Less efficient for large models
const allMeshes = getAllMeshes(modelID); // Loads everything at once
```

3. **Clean Up Geometry Objects**

```typescript
const geometry = ifcAPI.GetGeometry(modelID, geometryExpressID);
// ... use geometry
(geometry as any)?.delete?.(); // Free WASM memory
```

### Optimization Tips

1. **Batch Operations**

```typescript
// Instead of individual calls
for (const id of elementIDs) {
  const element = ifcAPI.GetLine(modelID, id);
  // process element
}

// Use type filtering when possible
const elements = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCWALL);
for (const id of elements) {
  const element = ifcAPI.GetLine(modelID, id);
  // process element
}
```

2. **Selective Data Loading**

```typescript
// Load only what you need
const element = ifcAPI.GetLine(modelID, expressID, false); // Basic data only

// Load full data only when necessary
const fullElement = ifcAPI.GetLine(modelID, expressID, true); // All properties
```

3. **Coordinate System Optimization**

```typescript
// Enable coordinate transformation for better performance
const settings: WebIFC.LoaderSettings = {
  COORDINATE_TO_ORIGIN: true, // Move model to origin
  // ... other settings
};
```

---

## Complete Usage Example

```typescript
import * as WebIFC from "web-ifc";

async function processIFCFile(file: File) {
  // Initialize API
  const ifcAPI = new WebIFC.IfcAPI();
  await ifcAPI.Init();
  ifcAPI.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_ERROR);

  // Read file data
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // Configure loading
  const settings: WebIFC.LoaderSettings = {
    COORDINATE_TO_ORIGIN: true,
    CIRCLE_SEGMENTS: 24,
    MEMORY_LIMIT: 2147483648,
    TAPE_SIZE: 67108864,
  };

  // Open model
  const modelID = ifcAPI.OpenModel(data, settings);
  if (modelID === -1) {
    throw new Error("Failed to open IFC model");
  }

  try {
    // Get project information
    const projectIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    if (projectIDs.size() > 0) {
      const project = ifcAPI.GetLine(modelID, projectIDs.get(0));
      console.log("Project:", project.Name?.value);
    }

    // Stream and process geometry
    const geometryCount = 0;
    ifcAPI.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
      const expressID = flatMesh.expressID;
      const typeName = ifcAPI.GetNameFromTypeCode(ifcAPI.GetLine(modelID, expressID).type);

      for (let i = 0; i < flatMesh.geometries.size(); i++) {
        const placedGeometry = flatMesh.geometries.get(i);
        const geometry = ifcAPI.GetGeometry(modelID, placedGeometry.geometryExpressID);

        if (geometry) {
          const verts = ifcAPI.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
          const indices = ifcAPI.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

          // Process geometry...
          geometryCount++;

          // Clean up
          (geometry as any)?.delete?.();
        }
      }
    });

    console.log(`Processed ${geometryCount} geometry elements`);

    // Get all walls
    const wallIDs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCWALL);
    console.log(`Found ${wallIDs.size()} walls`);

    // Process walls
    for (let i = 0; i < wallIDs.size(); i++) {
      const wallID = wallIDs.get(i);
      const wall = ifcAPI.GetLine(modelID, wallID);
      console.log(`Wall ${wallID}: ${wall.Name?.value || "Unnamed"}`);
    }
  } finally {
    // Always close the model
    ifcAPI.CloseModel(modelID);
  }
}
```

This documentation covers the essential web-ifc API methods used in the project. For more detailed information about specific methods or additional functionality, refer to the official web-ifc documentation or source code.
