# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

 - No changes yet.

## [2.2.0]

### Added

- Prepared geometry tuning and profiles:
  - `loadPreparedIfcModel(...)` flow in unified loader.
  - `GeometryMergeMode`: `none`, `by-express-color`, `by-color`, `two-material`.
  - Auto tier strategy with `lowMaxParts` / `mediumMaxParts`.
  - `renderOnly` profile forcing:
    - `mergeMode: "two-material"`
    - `keepModelOpen: false`
    - `includeElementMap: false`
- Telemetry fields for prepared models:
  - `tier`, `opaqueMeshCount`, `transparentMeshCount`
  - `elementRangeCount`, `elementMapBytes`, `geometryBytes`, `transferBytes`
  - `includeElementMap`
- Picking helper for merged prepared meshes:
  - `resolveExpressIDFromMeshPick(mesh, faceId)`

### Changed

- `test-speed` benchmark now compares both backends:
  - `main-thread` and `worker`
  - across merge modes: `by-express-color`, `by-color`, `two-material`
  - with tabular output including filename/filesize and memory/transfer/map metrics.
- App/benchmark presentation updates:
  - dark theme styling applied to app overlays and benchmark page.
  - benchmark panel width increased for full table visibility.
- Inspector usage in app is dev-only via dynamic import (`@babylonjs/inspector` excluded from production bundle).

### Tests

- Added `src/__tests__/ifcModelPreparation.test.ts`:
  - tier resolution, renderOnly behavior, merge grouping, and element-map telemetry.
- Added `src/__tests__/ifcLoader.test.ts`:
  - unified loader behavior, `renderOnly`, `keepModelOpen`, and worker/main loader selection.

### Docs

- Updated `readme.md`:
  - worker/main benchmark page, prepared geometry usage, renderOnly notes, and new tests list.
- Updated `API.md`:
  - `loadPreparedIfcModel`, worker progress options, geometry preparation layer, telemetry, and merged-picking docs.

## [2.1.0]

### Exposed API Changes

- Added `createIfcLoader(options?: { useWorker?: boolean })`:
  - Unified loader facade for choosing worker or main-thread mode with one flag.
- Added `IfcLoader` interface export:
  - Common async methods: `init`, `loadIfcModel`, `closeIfcModel`, `getProjectInfo`, `getElementData`, `dispose`.
- Added `CreateIfcLoaderOptions` export.
- Added `ElementDataResult` export.
- Exported `IfcWorkerClient` in npm package entry.

### Packaging / Build

- Included worker-related outputs in npm build:
  - `ifc.worker.*`
  - `ifcWorkerClient.*`
  - `ifcLoader.*`
  - `web-ifc.wasm`

## [2.0.0]

### Exposed API Changes

- `RawIfcModel`:
  - Removed `storeyMap: Map<number, number>`.
- `IfcInitOptions` (used by `loadIfcModel`):
  - Added `signal?: AbortSignal`.
- `SceneBuildOptions` (used by `buildIfcModel`):
  - Added `usePBRMaterials?: boolean`.
  - Added `releaseRawPartsAfterBuild?: boolean` (default is `true`).

### Behavior Changes With API Impact

- `buildIfcModel` now clears `model.parts` by default (`releaseRawPartsAfterBuild=true`) unless explicitly disabled.
- Storey-based merge restrictions were removed; merge strategy is now element/material-group based.

### Changed

- Added PBR rendering support:
  - `usePBRMaterials` scene option.
  - PBR material defaults/handling (`metallic`, `roughness`).
  - Viewer environment texture flow updates for PBR usage.
- Updated model build behavior:
  - Added `releaseRawPartsAfterBuild` (default `true`).
  - Removed storey-based merge blocking logic.
  - Added stronger raw-part validation before mesh creation.
- Improved loader robustness:
  - Added `AbortSignal` support in `loadIfcModel`/fetch/streaming paths.
  - Added explicit abort helpers and safer geometry disposal.
  - Removed `storeyMap` from `RawIfcModel`.
- Improved performance in geometry/build hot paths:
  - Reduced array-copy allocations by using typed arrays directly where supported.
  - Kept `flatTransform` as `ArrayLike<number>` instead of forcing new arrays.
- Updated tests and docs to align with branch behavior:
  - Expanded/adjusted build and loader test coverage.
  - Updated `readme.md` and `API.md`.

### Branch Commits

- `664a468` - `pbr`
- `cc68bb8` - `envTex`
- `a9db44c` - `small update`
- `4b0f0ec` - `types etc`
