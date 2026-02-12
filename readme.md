# How to Load and Render IFC Files with Babylon.js

## Overview

This project provides a complete IFC file viewer using web-ifc and Babylon.js. You can load IFC files from URLs or via drag-and-drop, with automatic metadata extraction and 3D rendering.

## Current Status

✅ **Babylon.js** - Fully working 3D scene with camera controls

✅ **web-ifc** - Initialized with proper WASM loading

✅ **IFC Loader** - Unified loading function for URLs and File objects

✅ **Metadata Extraction** - Project info, buildings, units, and property sets

✅ **Material Merging** - Intelligent mesh merging to reduce draw calls

✅ **Transparency Handling** - Proper rendering of transparent materials

✅ **Drag-and-Drop** - Drop .ifc files onto the canvas to load them

✅ **Automatic Cleanup** - Previous models are properly disposed when loading new files

## How to Load an IFC File

### From URL

```typescript
import { loadAndRenderIfc } from "./ifcLoader";

// Load from URL
const meshes = await loadAndRenderIfc(ifcAPI, "/test.ifc", scene);
console.log(`Loaded ${meshes.length} meshes from IFC file`);
```

### From File Object (Drag-and-Drop)

```typescript
// The unified function accepts both URL strings and File objects
const meshes = await loadAndRenderIfc(ifcAPI, fileObject, scene);
```

## Available Functions

### Core Loading Function

#### `loadAndRenderIfc(ifcAPI, source, scene)`

**Unified function** that loads an IFC file from either a URL or File object and creates Babylon.js meshes.

**Parameters:**

- `ifcAPI: WebIFC.IfcAPI` - The web-ifc API instance
- `source: string | File` - Either a URL string or a File object
- `scene: Scene` - The Babylon.js scene

**Returns:** `Promise<Mesh[]>` - Array of loaded meshes

**Features:**

- Automatic source type detection
- Metadata extraction and console logging
- Building information display
- Material merging for performance
- Transparency handling
- Coordinate system transformation

```typescript
// Load from URL
const meshes1 = await loadAndRenderIfc(ifcAPI, "/path/to/file.ifc", scene);

// Load from File object
const meshes2 = await loadAndRenderIfc(ifcAPI, fileObject, scene);
```

### Metadata Extraction Functions

#### `extractIfcMetadata(ifcAPI, modelID)`

Extracts project metadata including project name, description, software, author, and organization.

```typescript
const metadata = extractIfcMetadata(ifcAPI, modelID);
console.log(metadata.projectName);
console.log(metadata.software);
```

#### `getBuildingInfo(ifcAPI, modelID)`

Extracts building information from the IFC model.

```typescript
const buildings = await getBuildingInfo(ifcAPI, modelID);
buildings.forEach((building) => {
  console.log(building.name, building.elevation);
});
```

#### `getProjectUnits(ifcAPI, modelID)`

Extracts project units (length, area, volume, etc.).

```typescript
const units = await getProjectUnits(ifcAPI, modelID);
units.forEach((unit) => {
  console.log(unit.unitType, unit.name);
});
```

#### `getAllPropertySets(ifcAPI, modelID)`

Extracts all property sets from the IFC model.

```typescript
const propertySets = await getAllPropertySets(ifcAPI, modelID);
propertySets.forEach((propSet) => {
  console.log(propSet.name);
  propSet.properties.forEach((prop) => {
    console.log(`  ${prop.name}: ${prop.value}`);
  });
});
```

### Initialization

#### `initializeWebIFC()`

Initializes the web-ifc API with proper WASM loading.

```typescript
const ifcAPI = await initializeWebIFC();
```

## Features

### Drag-and-Drop Support

The application supports drag-and-drop for IFC files:

1. Simply drag an `.ifc` file from your file explorer
2. Drop it onto the canvas
3. The previous model is automatically cleaned up
4. The new model is loaded and displayed
5. Camera automatically adjusts to frame the model

### Metadata Console Output

When loading an IFC file, the following information is displayed in the console:

```
📋 IFC File Metadata:
  Project Name: My Building Project
  Description: Office Building Design
  Software: Autodesk Revit 2021
  Author: John Doe
  Organization: Architecture Firm

🏢 Building Information:
  Building 1:
    ID: 145
    Name: Building A
    Long Name: Main Office Building
    Description: Primary office structure
    Elevation: 0.0

✓ Loaded IFC file with 15 meshes
```

### Material Merging

The loader automatically merges meshes with identical materials to improve performance:

- Reduces draw calls significantly
- Maintains material properties
- Properly disposes unused materials
- Handles transparency correctly (alpha < 1.0 → alpha = 0.2)

### Memory Management

- Previous models are completely disposed when loading new files
- Both meshes and materials are cleaned up
- No memory leaks from accumulated models

## Console Output Control

Project units and property sets extraction is available but commented out by default to reduce console clutter. To enable them, uncomment the relevant sections in `src/ifcLoader.ts`:

```typescript
// Uncomment to show project units
// console.log("\n📏 Project Units:");
// const units = await getProjectUnits(ifcAPI, modelID);
// ...

// Uncomment to show property sets
// console.log("\n📦 Property Sets:");
// const propertySets = await getAllPropertySets(ifcAPI, modelID);
// ...
```

## Testing

1. Start the dev server: `npm run dev`
2. Open the browser console
3. You should see: "✓ web-ifc initialized successfully!"
4. The initial IFC file (`/test.ifc`) loads automatically
5. Try dragging and dropping your own `.ifc` files onto the canvas

## Technical Details

### Coordinate System

- Uses identity matrix transformation (no coordinate conversion)
- IFC coordinate system is used directly with Babylon.js

### Transparency Handling

- Materials with alpha < 1.0 are set to alpha = 0.2 for visibility
- Uses ALPHABLEND transparency mode
- Ensures glass and transparent elements are visible

### Vertex Data

- web-ifc provides interleaved vertex data: `[x, y, z, nx, ny, nz, ...]`
- 6 floats per vertex (position + normal)
- Properly extracted and converted to Babylon.js format

## Architecture

```
src/
├── main.ts              - Application entry point, scene setup, drag-and-drop
├── ifcLoader.ts         - IFC loading and metadata extraction utilities
└── style.css            - Basic styling

public/
├── test.ifc             - Example IFC file
└── web-ifc.wasm         - WebAssembly binary (copied by Vite)
```

## Next Steps

- ✅ ~~Implement IFC property extraction~~ (Done)
- ✅ ~~Add material/color mapping based on IFC data~~ (Done)
- ✅ ~~Add drag-and-drop support~~ (Done)
- ✅ ~~Implement proper cleanup when loading new files~~ (Done)
- 🔲 Add element selection and highlighting
- 🔲 Add UI controls for metadata display
- 🔲 Implement property panel for selected elements
- 🔲 Add spatial structure tree view
- 🔲 Implement filtering by IFC type
