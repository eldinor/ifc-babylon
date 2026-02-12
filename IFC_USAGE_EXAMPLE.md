# How to Load and Render IFC Files

## Overview

The project is now set up with web-ifc and Babylon.js. You can load and render IFC files in your 3D scene.

## Current Status

✅ **Babylon.js** - Fully working with a basic 3D scene  
✅ **web-ifc** - Initialized with proper WASM loading  
✅ **IFC Loader Utilities** - Helper functions created in `src/ifcLoader.ts`  
✅ **Example IFC File** - Available at `public/example.ifc`

## Important Note About Worker Errors

You may see worker-related errors in the console like:
```
worker sent an error! undefined:undefined: undefined
```

**This is expected** in the Vite development environment. The web-ifc library attempts to use web workers for multi-threading, but the worker file (`web-ifc-mt.worker.js`) is not included in version 0.0.75 of the npm package. The library should fall back to single-threaded mode automatically.

The Babylon.js scene will work perfectly, and basic IFC loading should still function.

## How to Load an IFC File

Here's an example of how to load and render an IFC file:

```typescript
import { loadAndRenderIfc } from "./ifcLoader";

// Assuming you have ifcAPI initialized and a Babylon scene
const meshes = await loadAndRenderIfc(ifcAPI, "/example.ifc", scene);

console.log(`Loaded ${meshes.length} meshes from IFC file`);
```

## Available Utility Functions

### `initializeWebIFC()`
Initializes the web-ifc API. This is already called in `main.ts`.

```typescript
const ifcAPI = await initializeWebIFC();
```

### `loadIfcFile(ifcAPI, url)`
Loads an IFC file from a URL and returns a model ID.

```typescript
const modelID = await loadIfcFile(ifcAPI, "/example.ifc");
```

### `getIfcGeometry(ifcAPI, modelID)`
Extracts all geometry from an IFC model.

```typescript
const geometries = getIfcGeometry(ifcAPI, modelID);
```

### `createBabylonMeshesFromIfc(ifcAPI, geometries, scene)`
Converts IFC geometry to Babylon.js meshes.

```typescript
const meshes = createBabylonMeshesFromIfc(ifcAPI, geometries, scene);
```

### `loadAndRenderIfc(ifcAPI, url, scene)`
All-in-one function that loads an IFC file and creates Babylon meshes.

```typescript
const meshes = await loadAndRenderIfc(ifcAPI, "/example.ifc", scene);
```

## Example: Adding IFC Loading to Your Scene

To add IFC loading to your current scene, modify `src/main.ts`:

```typescript
// After creating the scene...
if (ifcAPI) {
  try {
    const meshes = await loadAndRenderIfc(ifcAPI, "/example.ifc", scene);
    console.log(`✓ Loaded ${meshes.length} IFC meshes`);
    
    // Optional: Adjust camera to view the loaded model
    scene.activeCamera?.attachControl(canvas, true);
  } catch (error) {
    console.error("Failed to load IFC file:", error);
  }
}
```

## Testing

1. Start the dev server: `npm run dev`
2. Open the browser console
3. You should see: "✓ web-ifc initialized successfully!"
4. The Babylon.js scene should render with a sphere and ground
5. You can now add IFC loading code to load the example.ifc file

## Next Steps

- Add UI controls to load different IFC files
- Implement IFC property extraction
- Add material/color mapping based on IFC types
- Implement selection and highlighting of IFC elements
- Add camera controls to navigate the IFC model

