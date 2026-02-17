# Babylon.js IFC Viewer (web-ifc)

## Overview
Interactive IFC viewer built with Babylon.js and web-ifc. Supports URL or drag-and-drop loading, automatic metadata extraction, intelligent mesh merging, picking/highlighting, cleanup, and camera framing. Uses Vite with static WASM copy for production.

**Architecture:** Clean 3-file separation between IFC data layer (web-ifc only) and rendering layer (Babylon.js only).

## Quick start
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build` (copies `web-ifc.wasm` to `dist/` via vite-plugin-static-copy)
- Preview build: `npm run preview`

Open http://localhost:5173 and the sample IFC `public/test.ifc` will load automatically if web-ifc initializes.

## Current capabilities
- Babylon.js scene with ArcRotateCamera, HemisphericLight, and Inspector
- web-ifc initialization with configurable WASM path `initializeWebIFC("./")`
- Two-step loading API: `loadIfcModel()` (data) + `buildScene()` (rendering)
- Drag-and-drop `.ifc` onto the canvas with validation
- Automatic cleanup when loading a new file: `disposeIfcScene(scene)` + `closeIfcModel(ifcAPI, modelID)`
- Metadata extraction: project name/description, software, author, organization
- Intelligent merging by element and material while preserving `expressID` and `modelID`
- Camera auto-framing to loaded content
- Element picking and highlight overlay with type/name banner

## Architecture

The codebase follows a strict layered architecture with clear separation of concerns:

### src/ifcLoader.ts — IFC Data Layer (web-ifc only)
All web-ifc interaction. **Zero Babylon.js dependencies.**

**Exports:**
- `initializeWebIFC(wasmPath?, logLevel?)` — initialize web-ifc API
- `loadIfcModel(ifcAPI, source, options?)` — load and extract raw geometry data
- `closeIfcModel(ifcAPI, modelID)` — free IFC model memory
- `extractMetadata(ifcAPI, modelID)` — get project/author/software metadata
- `getBuildingInfo(ifcAPI, modelID)` — get building information
- `getProjectUnits(ifcAPI, modelID)` — get units
- `getAllPropertySets(ifcAPI, modelID)` — get property sets

**Types:**
- `RawIfcModel` — intermediate data format with no framework dependencies
- `RawGeometryPart` — single piece of geometry with transforms and colors
- `IfcLoaderOptions` — configuration for loading

### src/sceneBuilder.ts — Rendering Layer (Babylon.js only)
All Babylon.js scene construction. **Zero web-ifc dependencies.**

**Exports:**
- `buildScene(model, scene, options?)` — create meshes, materials, merge, center
- `disposeIfcScene(scene)` — dispose all IFC meshes and materials
- `getModelBounds(meshes)` — calculate bounding box
- `centerModelAtOrigin(meshes, rootNode?)` — center model at origin

**Types:**
- `SceneBuildOptions` — configuration for scene building
- `SceneBuildResult` — meshes, root node, and statistics
- `BuildStats` — performance and mesh statistics

### src/main.ts — Application Layer
App orchestration, camera control, picking, drag-and-drop.

## Usage

### Initialization and Loading (two-step API)
```typescript
// Step 1: Initialize web-ifc
const ifcAPI = await initializeWebIFC("./");

// Step 2: Load raw IFC data (web-ifc only)
const model = await loadIfcModel(ifcAPI, "/test.ifc", {
  coordinateToOrigin: true,
  verbose: true
});

// Step 3: Extract metadata (optional)
const metadata = extractMetadata(ifcAPI, model.modelID);

// Step 4: Build Babylon.js scene (Babylon only)
const { meshes, rootNode, stats } = buildScene(model, scene, {
  autoCenter: true,
  mergeMeshes: true,
  doubleSided: true,
  verbose: true
});
```

### Load from URL or File
```typescript
// From URL
const model = await loadIfcModel(ifcAPI, "/path/to/file.ifc");

// From File object
const model = await loadIfcModel(ifcAPI, fileObject);
```

### Cleanup before loading a new model
```typescript
// Dispose Babylon.js scene (meshes, materials, root node)
disposeIfcScene(scene);

// Close IFC model and free WASM memory
closeIfcModel(ifcAPI, modelID);
```

## API Reference

### ifcLoader.ts (Data Layer)

#### `initializeWebIFC(wasmPath?, logLevel?)`
Initialize web-ifc API. Call once at startup.

#### `loadIfcModel(ifcAPI, source, options?)`
Load IFC file and extract raw geometry data.
- **Returns:** `RawIfcModel` with parts, storey map, and statistics
- **Options:** `coordinateToOrigin` (default: true), `verbose` (default: true)

#### `closeIfcModel(ifcAPI, modelID)`
Close model and free WASM memory.

#### `extractMetadata(ifcAPI, modelID)`
Extract project metadata (name, description, software, author, organization).

#### `getBuildingInfo(ifcAPI, modelID)`
Get building information (id, name, longName, description, elevation).

#### `getProjectUnits(ifcAPI, modelID)`
Get project units assignment.

#### `getAllPropertySets(ifcAPI, modelID)`
Get all IFCPROPERTYSET entities and their properties.

### sceneBuilder.ts (Rendering Layer)

#### `buildScene(model, scene, options?)`
Build Babylon.js scene from raw IFC model data.
- **Returns:** `{ meshes, rootNode, stats }`
- **Options:**
  - `mergeMeshes` (default: true) — merge meshes with same material
  - `autoCenter` (default: true) — center model at origin
  - `doubleSided` (default: true) — disable backface culling
  - `generateNormals` (default: false) — generate normals if missing
  - `verbose` (default: true) — console logging

#### `disposeIfcScene(scene)`
Dispose all IFC meshes, materials, and the ifc-root node.

#### `getModelBounds(meshes)`
Calculate bounding box for camera framing.
- **Returns:** `{ min, max, center, size, diagonal }` or `null`

#### `centerModelAtOrigin(meshes, rootNode?)`
Manually center model at origin.
- **Returns:** offset vector

## Picking and highlighting
- Left-click a mesh to log full element data via `ifcAPI.GetLine(modelID, expressID, true)` and type name via `GetNameFromTypeCode`
- Highlight uses `renderOverlay` with teal color and alpha=0.3
- Upper text banner shows type, name, and ExpressID; clicking empty space clears it

## Materials, merging, and performance
- Materials are `StandardMaterial` per unique RGBA color, configurable `backFaceCulling`, incremental `zOffset` to mitigate z-fighting
- Meshes are merged per (expressID + color) when safe; safety check prevents merging across different storeys using spatial relations
- Metadata (`expressID`, `modelID`) preserved on merged meshes
- Stats for counts, triangles, materials, and build time are computed

## Coordinate system and geometry
- web-ifc streams interleaved vertex data `[x,y,z,nx,ny,nz]`
- Optional normal generation when required
- Per-part transforms baked from placed geometry matrices
- Z-axis flip applied via root node scaling for IFC-to-Babylon coordinate conversion

## Project structure
```
src/
├── main.ts          — app entry, scene, camera, picking, drag-and-drop
├── ifcLoader.ts     — IFC data layer (web-ifc only)
├── sceneBuilder.ts  — rendering layer (Babylon.js only)
└── style.css        — basic styling

public/
├── test.ifc         — sample IFC file loaded at startup
├── example.ifc      — additional sample
└── bplogo.svg       — asset

Root
├── index.html       — canvas and UI scaffolding
├── vite.config.ts   — copies web-ifc.wasm to dist/, sets WASM handling
├── tsconfig.json    — TypeScript config
└── package.json     — scripts and deps
```

## Console output examples
- `✓ Web-IFC initialized in Xms`
- `📦 Collected X geometry parts`
- `📍 Built storey map with X element-storey relationships`
- `🏗️ Building Babylon.js scene from X raw parts...`
- `✅ Scene building complete: X final meshes, Y materials, Zms`
- `📋 IFC File Metadata:` project, description, software, author, organization

## Build and deploy notes
- The Vite config copies `node_modules/web-ifc/web-ifc.wasm` to `dist/`
- In production, `initializeWebIFC("./")` ensures the WASM is loaded from the dist root
- `optimizeDeps.exclude = ["web-ifc"]` prevents esbuild issues during dev

## Benefits of the new architecture

### For the codebase
- `ifcLoader.ts` has zero Babylon imports — testable without a rendering context
- `sceneBuilder.ts` has zero web-ifc imports — could be swapped for a different renderer
- All IFC data access goes through one module
- One fewer file (ifcMetadata.ts eliminated)

### For future features
- **Properties panel:** call `getAllPropertySets()` from ifcLoader, render in main.ts
- **Spatial tree:** use `storeyMap` from `RawIfcModel` + `getBuildingInfo()` from ifcLoader
- **Storey isolation:** sceneBuilder already receives storeyMap, can filter meshes
- **Instancing:** detect shared `geometryExpressID` in `RawGeometryPart[]` before mesh creation
- **Multi-model:** call `loadIfcModel()` + `buildScene()` per file, each gets its own rootNode
- **Color-by-property:** reassign materials in sceneBuilder using metadata from ifcLoader

## Limitations and backlog
- No spatial tree or filters yet
- Overlay highlight only; no outline/edge highlights
- No UI property panel

Planned improvements:
- UI controls and property panel
- Spatial structure tree and type filters
- Outline/edge rendering highlight option
- Batching/progress for very large models
