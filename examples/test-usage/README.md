# Test Usage

This directory contains test scripts to verify the `babylon-ifc-loader` package works correctly after being packed.

## Prerequisites

1. Build and pack the main package first:

   ```bash
   cd ../..  # Go to project root
   npm run build:lib
   npm pack
   ```

2. Install the packed package:
   ```bash
   cd examples/test-usage
   npm install
   npm install ../../babylon-ifc-loader-1.0.0.tgz
   ```

## Running Tests

### Command Line Tests (ESM/CJS imports)

```bash
# Test ESM import
npm run test:esm

# Test CJS import
npm run test:cjs

# Test both
npm run test:all
```

### Visual Test (Full Application)

```bash
# Start the dev server
npm run dev
```

Then open http://localhost:5174/ in your browser to test:

- IFC file loading via the NPM package
- Element picking and highlighting
- Drag-and-drop IFC file loading
- Camera controls

## Expected Output

### Command Line Tests

```
=== ESM Import Test ===
✓ loadIfc function: function
✓ configureIfcLoader function: function
✓ IfcLoaderPlugin class: function
✓ IfcLoaderPlugin.name: IfcLoaderPlugin
✓ IfcLoaderPlugin.defaultOptions: object
✓ configureIfcLoader called successfully

=== ESM Test Complete ===
```

### Visual Test

The browser should display:

- A 3D canvas with the loaded IFC model
- Project info in the top banner
- Element info when clicking on IFC elements
- Console logs showing successful import from `babylon-ifc-loader`
