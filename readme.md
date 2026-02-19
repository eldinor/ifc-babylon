# Babylon.js IFC Viewer

## Overview

Interactive IFC viewer built with Babylon.js and web-ifc. Features automatic loading of sample IFC files, drag-and-drop support, intelligent mesh merging, element picking with metadata display, and automatic camera framing. Uses Vite with static WASM copy for production deployment.

**Architecture:** Clean separation between IFC data layer (web-ifc only) and rendering layer (Babylon.js only) with a two-step loading API.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Open http://localhost:5173 and the sample IFC file `public/test.ifc` will load automatically.

## Features

- **Automatic Loading:** Sample IFC file loads on startup
- **Drag & Drop:** Drop `.ifc` files onto the canvas to load them
- **Element Picking:** Click on elements to view metadata and highlight them
- **Intelligent Merging:** Automatically merges meshes with same material while preserving metadata
- **Camera Framing:** Automatically positions camera to view the entire model
- **Inspector:** Built-in Babylon.js Inspector for debugging
- **Memory Management:** Proper cleanup when loading new files

## Architecture

The codebase follows a strict layered architecture with clear separation of concerns:

### src/ifcInit.ts — IFC Data Layer (web-ifc only)

All web-ifc interaction. **Zero Babylon.js dependencies.**

**Exports:**

- `initializeWebIFC(wasmPath?, logLevel?)` — initialize web-ifc API
- `loadIfcModel(ifcAPI, source, options?)` — load and extract raw geometry data
- `closeIfcModel(ifcAPI, modelID)` — free IFC model memory
- `getProjectInfo(ifcAPI, modelID)` — extract project metadata

**Types:**

- `RawIfcModel` — intermediate data format with no framework dependencies
- `RawGeometryPart` — single piece of geometry with transforms and colors
- `IfcInitOptions` — configuration for loading

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

App orchestration, camera control, picking, drag-and-drop, and scene management.

## Usage

### Two-Step Loading API

```typescript
// Step 1: Initialize web-ifc
const ifcAPI = await initializeWebIFC("./");

// Step 2: Load raw IFC data (web-ifc only)
const model = await loadIfcModel(ifcAPI, "/test.ifc", {
  coordinateToOrigin: true,
  verbose: true,
});

// Step 3: Extract metadata (optional)
const projectInfo = getProjectInfo(ifcAPI, model.modelID);

// Step 4: Build Babylon.js scene (Babylon only)
const { meshes, rootNode, stats } = buildScene(model, scene, {
  autoCenter: true,
  mergeMeshes: true,
  doubleSided: true,
  verbose: true,
});
```

### Load from URL or File

```typescript
// From URL
const model = await loadIfcModel(ifcAPI, "/path/to/file.ifc");

// From File object (drag-and-drop)
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

### ifcInit.ts (Data Layer)

#### `initializeWebIFC(wasmPath?, logLevel?)`

Initialize web-ifc API. Call once at startup.

#### `loadIfcModel(ifcAPI, source, options?)`

Load IFC file and extract raw geometry data.

- **Returns:** `RawIfcModel` with parts, storey map, and statistics
- **Options:** `coordinateToOrigin` (default: true), `verbose` (default: true)

#### `closeIfcModel(ifcAPI, modelID)`

Close model and free WASM memory.

#### `getProjectInfo(ifcAPI, modelID)`

Extract project metadata (name, description, application, author, organization).

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
  - `freezeAfterBuild` (default: true) — freeze scene for performance

#### `disposeIfcScene(scene)`

Dispose all IFC meshes, materials, and the ifc-root node.

#### `getModelBounds(meshes)`

Calculate bounding box for camera framing.

- **Returns:** `{ min, max, center, size, diagonal }` or `null`

#### `centerModelAtOrigin(meshes, rootNode?)`

Manually center model at origin.

- **Returns:** offset vector

## Picking and Highlighting

- Left-click a mesh to log full element data via `ifcAPI.GetLine(modelID, expressID, true)` and type name via `GetNameFromTypeCode`
- Highlight uses `renderOverlay` with teal color and alpha=0.3
- Upper text banner shows type, name, and ExpressID; clicking empty space clears it

## Materials, Merging, and Performance

- Materials are `StandardMaterial` per unique RGBA color, configurable `backFaceCulling`, incremental `zOffset` to mitigate z-fighting
- Meshes are merged per (expressID + color) when safe; safety check prevents merging across different storeys using spatial relations
- Metadata (`expressID`, `modelID`) preserved on merged meshes
- Stats for counts, triangles, materials, and build time are computed

## Coordinate System and Geometry

- web-ifc streams interleaved vertex data `[x,y,z,nx,ny,nz]`
- Optional normal generation when required
- Per-part transforms baked from placed geometry matrices
- Z-axis flip applied via root node scaling for IFC-to-Babylon coordinate conversion

## Project Structure

```
src/
├── main.ts          — app entry, scene, camera, picking, drag-and-drop
├── ifcInit.ts       — IFC data layer (web-ifc only)
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

## Console Output Examples

- `✓ Web-IFC initialized in Xms`
- `📦 Collected X geometry parts`
- `🏗️ Building Babylon.js scene from X raw parts...`
- `✅ Scene building complete: X final meshes, Y materials, Zms`

## Build and Deploy Notes

- The Vite config copies `node_modules/web-ifc/web-ifc.wasm` to `dist/`
- In production, `initializeWebIFC("./")` ensures the WASM is loaded from the dist root
- `optimizeDeps.exclude = ["web-ifc"]` prevents esbuild issues during dev

## Dependencies

- **@babylonjs/core:** ^8.51.2 - Core Babylon.js engine
- **@babylonjs/inspector:** ^8.51.2 - Built-in debugging inspector
- **web-ifc:** ^0.0.75 - IFC parsing and geometry extraction
- **vite:** ^7.3.1 - Build tool and dev server
- **vite-plugin-static-copy:** ^3.2.0 - Copy WASM files to dist

## Limitations and Future Improvements

- No spatial tree or filters yet
- No property panel UI
- No outline/edge rendering highlight option
- No UI controls for scene manipulation

## License

MIT
