# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
