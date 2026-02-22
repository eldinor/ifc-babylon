// ============================================================================
// babylon-ifc-loader - NPM Package Entry Point
// ============================================================================

// High-level API (recommended for most users)
export {
  loadIfc,
  disposeIfc,
  configureIfcLoader,
  getWebIfcAPI,
  getIfcProjectInfo,
  resetIfcLoader,
  IfcLoaderPlugin,
} from "./ifcLoader";

export type { IfcLoaderResult, IfcLoaderOptions, IfcPluginOptions } from "./ifcLoader";

// Low-level IFC Data Layer (web-ifc only, zero Babylon.js dependencies)
export { initializeWebIFC, loadIfcModel, closeIfcModel, getProjectInfo } from "./ifcInit";

export type { RawIfcModel, RawGeometryPart, IfcInitOptions, ProjectInfoResult } from "./ifcInit";

// Rendering Layer (Babylon.js only, zero web-ifc dependencies)
export { buildIfcModel, disposeIfcModel, getModelBounds, centerModelAtOrigin } from "./ifcModel";

export type { SceneBuildOptions, SceneBuildResult, BuildStats, BoundsInfo } from "./ifcModel";
