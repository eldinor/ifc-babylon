# Babylon.js IFC Loader

IFC Loader built with Babylon.js and web-ifc. Features automatic loading of sample IFC files, drag-and-drop support, intelligent mesh merging, element picking with metadata display, and automatic camera framing.

While providing the minimal viewer experience, this repo is dedicated to developing and testing the IFC Babylon.js Loader. The viewer is provided for testing and demonstration purposes only. Full-featured Babylon.js IFC Babylon.js Viewer will be available in a separate repo later.

## Installation

```bash
npm install babylon-ifc-loader
```

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

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Dev Server URL

After running `npm run dev`, open:

| URL                    | Entry Point | Description                                      |
| ---------------------- | ----------- | ------------------------------------------------ |
| http://localhost:5173/ | `main.ts`   | Uses low-level two-step API (ifcInit + ifcModel) |

## Features

- **Automatic Loading:** Sample IFC file loads on startup
- **Drag & Drop:** Drop `.ifc` files onto the canvas to load them
- **Element Picking:** Click on elements to view metadata and highlight them
- **Intelligent Merging:** Automatically merges meshes with same material while preserving metadata
- **Camera Framing:** Automatically positions camera to view the entire model
- **Inspector:** Built-in Babylon.js Inspector for debugging
- **Keyboard Shortcuts:** Ctrl+I (or Cmd+I on Mac) toggles the inspector, works across all keyboard layouts
- **Memory Management:** Proper cleanup when loading new files

## Architecture

The codebase follows a strict layered architecture with clear separation of concerns:

### IFC Data Layer (`src/ifcInit.ts`)

All web-ifc interaction. **Zero Babylon.js dependencies.**

- `initializeWebIFC(wasmPath?, logLevel?)` — initialize web-ifc API
- `loadIfcModel(ifcAPI, source, options?)` — load and extract raw geometry data
- `closeIfcModel(ifcAPI, modelID)` — free IFC model memory
- `getProjectInfo(ifcAPI, modelID)` — extract project metadata

### Rendering Layer (`src/ifcModel.ts`)

All Babylon.js scene construction. **Zero web-ifc dependencies.**

- `buildIfcModel(model, scene, options?)` — create meshes, materials, merge, center
- `disposeIfcModel(scene)` — dispose all IFC meshes and materials
- `getModelBounds(meshes)` — calculate bounding box
- `centerModelAtOrigin(meshes, rootNode?)` — center model at origin

### Application Layer

- `src/main.ts` — uses low-level two-step API (ifcInit + ifcModel)

## Usage

### Two-Step Loading API

For more control, use the two-step API directly:

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
const { meshes, rootNode, stats } = buildIfcModel(model, scene, {
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
disposeIfcModel(scene);

// Close IFC model and free WASM memory
closeIfcModel(ifcAPI, modelID);
```

## API Reference

See [API.md](./API.md) for complete API documentation with all types, parameters, and examples.

## NPM Package

The package is published as `babylon-ifc-loader` and exports:

```typescript
// Low-level IFC Data Layer (web-ifc only)
import { initializeWebIFC, loadIfcModel, closeIfcModel, getProjectInfo } from "babylon-ifc-loader";

// Rendering Layer (Babylon.js only)
import { buildIfcModel, disposeIfcModel, getModelBounds, centerModelAtOrigin } from "babylon-ifc-loader";
```

### Testing NPM Package Locally

To test the npm package locally before publishing:

```bash
# 1. Build the npm package
npm run build:npm

# 2. Run Vite dev server with the test-npm entry point
npx vite . --open test-npm/index.html
```

The `test-npm/` folder contains a test page that imports from `babylon-ifc-loader`. Since the package's `main` entry points to `dist-npm/index.js`, Vite resolves the import from the built output.

**Testing from another project:**

To test the package in a different project:

```bash
# In ifc-babylon root
npm link

# In the other project
npm link babylon-ifc-loader
```

## Testing

The project uses [Vitest](https://vitest.dev/) for unit testing with the following setup:

- **Test Runner:** Vitest v4 with `jsdom` environment
- **Coverage:** `@vitest/coverage-v8` for code coverage reports
- **Location:** Test files are in `src/__tests__/`

### Test Files

| File                       | Description                           |
| -------------------------- | ------------------------------------- |
| `initializeWebIFC.test.ts` | Tests for web-ifc initialization      |
| `loadIfcModel.test.ts`     | Tests for IFC model loading           |
| `closeIfcModel.test.ts`    | Tests for model cleanup               |
| `getProjectInfo.test.ts`   | Tests for project metadata extraction |
| `buildIfcModel.test.ts`    | Tests for Babylon.js scene building   |
| `zOffset.test.ts`          | Tests for z-offset material handling  |

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm test -- --run

# Run tests with coverage report
npm run test:coverage
```

### Writing Tests

Tests follow the standard Vitest pattern with mocked dependencies:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("myFunction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should do something", async () => {
    const result = await myFunction();
    expect(result).toBe(expected);
  });
});
```

## Project Structure

```
src/
├── main.ts          — app entry (two-step API: ifcInit + ifcModel)
├── ifcInit.ts       — IFC data layer (web-ifc only)
├── ifcModel.ts      — rendering layer (Babylon.js only)
├── style.css        — basic styling
└── __tests__/       — unit tests

public/
├── test.ifc         — sample IFC file loaded at startup
├── example.ifc      — additional sample
└── bplogo.svg       — asset

Root
├── index.html       — HTML entry
├── vite.config.ts   — copies web-ifc.wasm to dist/, sets WASM handling
├── tsconfig.json    — TypeScript config
└── package.json     — scripts and deps
```

## Picking and Highlighting

- Left-click a mesh to log full element data via `ifcAPI.GetLine(modelID, expressID, true)` and type name via `GetNameFromTypeCode`
- Highlight uses `renderOverlay` with teal color and alpha=0.3
- Upper text banner shows type, name, and ExpressID; clicking empty space clears it

## Materials, Merging, and Performance

- Materials are `StandardMaterial` per unique RGBA color, configurable `backFaceCulling`, incremental `zOffset` to mitigate z-fighting
- Meshes are merged per (expressID + color)
- Metadata (`expressID`, `modelID`) preserved on merged meshes
- Stats for counts, triangles, materials, and build time are computed

### Custom Merging Strategy

When `mergeMeshes = false`, each geometry part remains as a separate mesh with full metadata. This lets you implement your own merging strategy based on:

- Mesh metadata (`expressID`, `modelID`) for element identification
- IFC queries via `ifcAPI.GetLine()` for property-based grouping
- Spatial relationships for storey/zone-based organization
- Material or color-based batching

Example:

```typescript
const { meshes } = buildIfcModel(model, scene, { mergeMeshes: false });

// Custom grouping by IFC type
for (const mesh of meshes) {
  const element = ifcAPI.GetLine(modelID, mesh.metadata.expressID, true);
  const typeName = ifcAPI.GetNameFromTypeCode(element.type);
  // Group or merge meshes by typeName, storey, etc.
}
```

## Coordinate System and Geometry

- web-ifc streams interleaved vertex data `[x,y,z,nx,ny,nz]`
- Optional normal generation when required
- Per-part transforms baked from placed geometry matrices
- Z-axis flip applied via root node scaling for IFC-to-Babylon coordinate conversion

## Build and Deploy Notes

- The Vite config copies `node_modules/web-ifc/web-ifc.wasm` to `dist/`
- In production, `initializeWebIFC("./")` ensures the WASM is loaded from the dist root
- `optimizeDeps.exclude = ["web-ifc"]` prevents esbuild issues during dev

## Dependencies

| Package                 | Version | Description                         |
| ----------------------- | ------- | ----------------------------------- |
| @babylonjs/core         | ^8.52.0 | Core Babylon.js engine              |
| @babylonjs/inspector    | ^8.52.0 | Built-in debugging inspector        |
| web-ifc                 | ^0.0.75 | IFC parsing and geometry extraction |
| vite                    | ^7.3.1  | Build tool and dev server           |
| vite-plugin-static-copy | ^3.2.0  | Copy WASM files to dist             |

## Limitations and Future Improvements

- No spatial tree or filters yet
- No property panel UI
- No outline/edge rendering highlight option
- No UI controls for scene manipulation

## License

Apache-2.0 - See [LICENSE](./LICENSE) for details.
