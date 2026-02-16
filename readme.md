# Babylon.js IFC Viewer (web-ifc)

## Overview
Interactive IFC viewer built with Babylon.js and web-ifc. Supports URL or drag-and-drop loading, automatic metadata extraction, intelligent mesh merging, picking/highlighting, cleanup, and camera framing. Uses Vite with static WASM copy for production.

## Quick start
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build` (copies `web-ifc.wasm` to `dist/` via vite-plugin-static-copy)
- Preview build: `npm run preview`

Open http://localhost:5173 and the sample IFC `public/test.ifc` will load automatically if web-ifc initializes.

## Current capabilities
- Babylon.js scene with ArcRotateCamera, HemisphericLight, and Inspector
- web-ifc initialization with configurable WASM path `initializeWebIFC("./")`
- Unified loader: `loadAndRenderIfc(ifcAPI, source, scene[, options])` for URL string or File
- Drag-and-drop `.ifc` onto the canvas with validation
- Automatic cleanup when loading a new file: `disposeIfcScene(scene)` + `cleanupIfcModel(ifcAPI, modelID)`
- Metadata extraction: project name/description, software, author, organization
- Intelligent merging by element and material while preserving `expressID` and `modelID`
- Camera auto-framing to loaded content
- Element picking and highlight overlay with type/name banner

## Usage
Initialization (src/main.ts):
- Initialize web-ifc with WASM path `"./"` so `dist/web-ifc.wasm` is found in production
- Create engine/scene/camera/light
- Load default IFC:
  - `const { meshes, modelID } = await loadAndRenderIfc(ifcAPI, "/test.ifc", scene)`
- Frame camera to meshes
- Enable Babylon Inspector
- Set up picking and drag-and-drop

Load from URL or File:
- `await loadAndRenderIfc(ifcAPI, "/path/to/file.ifc", scene)`
- `await loadAndRenderIfc(ifcAPI, fileObject, scene)`

Cleanup before loading a new model:
- `disposeIfcScene(scene)` // disposes ifc-root and IFC materials
- `cleanupIfcModel(ifcAPI, modelID)` // closes model and frees WASM memory

## Public API (src/ifcLoader.ts)
- `initializeWebIFC(wasmPath? = undefined, logLevel = LOG_LEVEL_ERROR): Promise<IfcAPI>`
- `loadAndRenderIfc(ifcAPI, source: string | File, scene, options?): Promise<{ meshes, stats, modelID }>`
- `disposeIfcScene(scene): void`
- `cleanupIfcModel(ifcAPI, modelID): void`
- `getModelBounds(meshes): { min, max, center, size, diagonal } | null`

Loader options (partial):
- `coordinateToOrigin` (default true)
- `generateNormals` (default false)
- `verbose` (default true)

## Metadata utilities (src/ifcMetadata.ts)
- `extractIfcMetadata(ifcAPI, modelID)` — project name/description, software, author, organization
- `getBuildingInfo(ifcAPI, modelID)` — list buildings (id, names, elevation)
- `getProjectUnits(ifcAPI, modelID)` — units assignment
- `getAllPropertySets(ifcAPI, modelID)` — all IFCPROPERTYSET and properties

## Picking and highlighting
- Left-click a mesh to log full element data via `ifcAPI.GetLine(modelID, expressID, true)` and type name via `GetNameFromTypeCode`
- Highlight uses `renderOverlay` with teal color and alpha=0.3
- Upper text banner shows type, name, and ExpressID; clicking empty space clears it

## Materials, merging, and performance
- Materials are `StandardMaterial` per unique RGBA color, `backFaceCulling=false`, incremental `zOffset` to mitigate z-fighting
- Meshes are merged per (expressID + color) when safe; safety check prevents merging across different storeys using spatial relations
- Metadata (`expressID`, `modelID`) preserved on merged meshes
- Stats for counts, triangles, materials, and load time are computed

## Coordinate system and geometry
- web-ifc streams interleaved vertex data `[x,y,z,nx,ny,nz]`
- Optional normal generation when required
- Per-part transforms baked from placed geometry matrices

## Project structure
src/
- main.ts — entry, scene setup, default load, picking, drag-and-drop, camera framing, inspector
- ifcLoader.ts — initialization, IFC loading, geometry conversion, merging, cleanup helpers
- ifcMetadata.ts — metadata utilities
- style.css — basic styling and upper text

public/
- test.ifc — sample IFC file loaded at startup
- example.ifc — additional sample
- bplogo.svg — asset

Root
- index.html — canvas and UI scaffolding
- vite.config.ts — copies `web-ifc.wasm` to `dist/`, sets WASM handling
- tsconfig.json — TypeScript config
- package.json — scripts and deps

## Console output examples
- `✓ web-ifc initialized successfully!`
- `✓ IFC loaded successfully in Xms` — shows mesh/triangle counts
- `📋 IFC File Metadata:` project, description, software, author, organization
- Grouping/merging and storey map stats

## Build and deploy notes
- The Vite config copies `node_modules/web-ifc/web-ifc.wasm` to `dist/`
- In production, `initializeWebIFC("./")` ensures the WASM is loaded from the dist root
- `optimizeDeps.exclude = ["web-ifc"]` prevents esbuild issues during dev

## Limitations and backlog
- UI property panel function exists but is commented out by default
- No spatial tree or filters yet
- Overlay highlight only; no outline/edge highlights

Planned improvements:
- UI controls and property panel
- Spatial structure tree and type filters
- Outline/edge rendering highlight option
- Batching/progress for very large models
