// ============================================================================
// babylon-ifc-loader - NPM Package Entry Point
// ============================================================================

// Low-level IFC Data Layer (web-ifc only, zero Babylon.js dependencies)
export { initializeWebIFC, loadIfcModel, closeIfcModel, getProjectInfo } from "./ifcInit";
export { IfcWorkerClient } from "./ifcWorkerClient";
export { createIfcLoader } from "./ifcLoader";

export type { RawIfcModel, RawGeometryPart, IfcInitOptions, ProjectInfoResult } from "./ifcInit";
export type { IfcLoader, CreateIfcLoaderOptions } from "./ifcLoader";
export type { ElementDataResult } from "./ifcWorkerClient";
export { prepareIfcModelGeometry } from "./ifcModelPreparation";
export type { GeometryPreparationOptions, PreparedIfcModel, PreparedIfcMeshData } from "./ifcModelPreparation";

// Rendering Layer (Babylon.js only, zero web-ifc dependencies)
export { buildIfcModel, disposeIfcModel, getModelBounds, centerModelAtOrigin } from "./ifcModel";

export type { SceneBuildOptions, SceneBuildResult, BuildStats, BoundsInfo } from "./ifcModel";
