import { SceneLoader, Scene, AbstractMesh, TransformNode, AssetContainer } from "@babylonjs/core";
import type { ISceneLoaderPluginAsync, ISceneLoaderProgressEvent } from "@babylonjs/core";
import * as WebIFC from "web-ifc";
import { initializeWebIFC, loadIfcModel, closeIfcModel, getProjectInfo } from "./ifcInit";
import type { RawIfcModel, IfcInitOptions, ProjectInfoResult } from "./ifcInit";
import { buildIfcModel, disposeIfcScene, getModelBounds } from "./ifcModel";
import type { SceneBuildOptions, SceneBuildResult, BoundsInfo } from "./ifcModel";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Result returned by the IFC loader */
export interface IfcLoaderResult {
  meshes: AbstractMesh[];
  rootNode: TransformNode;
  modelID: number;
  projectInfo: ProjectInfoResult;
  bounds: BoundsInfo | null;
  rawModel: RawIfcModel;
  stats: SceneBuildResult["stats"];
}

/** Options for the IFC loader */
export interface IfcLoaderOptions extends IfcInitOptions, SceneBuildOptions {
  /** Custom WASM path for web-ifc */
  wasmPath?: string;
  /** Log level for web-ifc */
  logLevel?: WebIFC.LogLevel;
}

/** Plugin options that can be set globally */
export interface IfcPluginOptions {
  wasmPath?: string;
  logLevel?: WebIFC.LogLevel;
  defaultLoadOptions?: Partial<IfcLoaderOptions>;
}

// ============================================================================
// SINGLETON WEB-IFC API MANAGER
// ============================================================================

/** Global web-ifc API instance (lazy initialized) */
let globalIfcAPI: WebIFC.IfcAPI | null = null;
let globalIfcAPIOptions: { wasmPath?: string; logLevel?: WebIFC.LogLevel } = {};

/**
 * Get or initialize the global web-ifc API instance
 */
async function getIfcAPI(): Promise<WebIFC.IfcAPI> {
  if (!globalIfcAPI) {
    globalIfcAPI = await initializeWebIFC(
      globalIfcAPIOptions.wasmPath,
      globalIfcAPIOptions.logLevel ?? WebIFC.LogLevel.LOG_LEVEL_ERROR,
    );
  }
  return globalIfcAPI;
}

/**
 * Configure the global web-ifc API options (call before loading any IFC files)
 */
export function configureIfcLoader(options: IfcPluginOptions): void {
  if (options.wasmPath !== undefined) {
    globalIfcAPIOptions.wasmPath = options.wasmPath;
  }
  if (options.logLevel !== undefined) {
    globalIfcAPIOptions.logLevel = options.logLevel;
  }
  if (options.defaultLoadOptions !== undefined) {
    IfcLoaderPlugin.defaultOptions = {
      ...IfcLoaderPlugin.defaultOptions,
      ...options.defaultLoadOptions,
    };
  }
}

/**
 * Reset the global web-ifc API (useful for testing or reconfiguration)
 */
export function resetIfcLoader(): void {
  globalIfcAPI = null;
  globalIfcAPIOptions = {};
}

// ============================================================================
// IFC LOADER PLUGIN
// ============================================================================

/**
 * Babylon.js SceneLoader plugin for IFC files
 *
 * Usage:
 * ```typescript
 * // Method 1: Using SceneLoader.ImportMeshAsync
 * const result = await SceneLoader.ImportMeshAsync("", "/", "model.ifc", scene);
 * const ifcResult = result.meshes[0].metadata._ifcLoaderResult as IfcLoaderResult;
 *
 * // Method 2: Using direct plugin import
 * import { IfcLoaderPlugin } from "./ifcLoader";
 * const result = await IfcLoaderPlugin.loadAsync("/model.ifc", scene);
 * ```
 */
class IfcLoaderPlugin implements ISceneLoaderPluginAsync {
  /** Plugin name */
  public readonly name = "ifc";

  /** Supported file extensions */
  public readonly extensions = ".ifc";

  /** Default options for loading */
  public static defaultOptions: IfcLoaderOptions = {
    coordinateToOrigin: true,
    verbose: true,
    mergeMeshes: true,
    autoCenter: true,
    doubleSided: true,
    generateNormals: false,
    freezeAfterBuild: true,
  };

  /** Options for this loader instance */
  private options: IfcLoaderOptions;

  /**
   * Create a new IFC loader plugin instance
   */
  constructor(options?: Partial<IfcLoaderOptions>) {
    this.options = {
      ...IfcLoaderPlugin.defaultOptions,
      ...options,
    };
  }

  /**
   * Check if this plugin can load the given file
   */
  public canDirectLoad(data: string): boolean {
    // Check if it's an IFC file by extension
    return data.toLowerCase().endsWith(".ifc");
  }

  /**
   * Load IFC file from URL or File object (internal method)
   */
  private async loadIfcFile(
    scene: Scene,
    source: string | File,
    onProgress?: (event: ISceneLoaderProgressEvent) => void,
  ): Promise<IfcLoaderResult> {
    const ifcAPI = await getIfcAPI();

    // Report progress
    onProgress?.({ loaded: 0, total: 100, lengthComputable: true });

    // Load raw IFC model
    const rawModel = await loadIfcModel(ifcAPI, source, {
      coordinateToOrigin: this.options.coordinateToOrigin,
      verbose: this.options.verbose,
    });

    onProgress?.({ loaded: 50, total: 100, lengthComputable: true });

    // Build Babylon.js scene
    const { meshes, rootNode, stats } = buildIfcModel(rawModel, scene, {
      mergeMeshes: this.options.mergeMeshes,
      autoCenter: this.options.autoCenter,
      doubleSided: this.options.doubleSided,
      generateNormals: this.options.generateNormals,
      verbose: this.options.verbose,
      freezeAfterBuild: this.options.freezeAfterBuild,
    });

    onProgress?.({ loaded: 90, total: 100, lengthComputable: true });

    // Get project info
    const projectInfo = getProjectInfo(ifcAPI, rawModel.modelID);

    // Calculate bounds
    const bounds = getModelBounds(meshes);

    // Store loader result in root node metadata for later access
    const result: IfcLoaderResult = {
      meshes,
      rootNode,
      modelID: rawModel.modelID,
      projectInfo,
      bounds,
      rawModel,
      stats,
    };

    // Attach result to root node for easy access
    rootNode.metadata = {
      ...rootNode.metadata,
      _ifcLoaderResult: result,
    };

    onProgress?.({ loaded: 100, total: 100, lengthComputable: true });

    return result;
  }

  /**
   * Import mesh into scene (ISceneLoaderPluginAsync interface)
   */
  public async importMeshAsync(
    _meshesNames: any,
    scene: Scene,
    data: any,
    _rootUrl: string,
    onProgress?: (event: ISceneLoaderProgressEvent) => void,
    _fileName?: string,
  ): Promise<{
    meshes: AbstractMesh[];
    particleSystems: any[];
    skeletons: any[];
    animationGroups: any[];
    transformNodes: TransformNode[];
    geometries: any[];
    lights: any[];
    spriteManagers: any[];
  }> {
    // data can be a URL string or File object
    const result = await this.loadIfcFile(scene, data, onProgress);

    return {
      meshes: result.meshes,
      particleSystems: [],
      skeletons: [],
      animationGroups: [],
      transformNodes: [result.rootNode],
      geometries: [],
      lights: [],
      spriteManagers: [],
    };
  }

  /**
   * Load scene (ISceneLoaderPluginAsync interface) - not used for IFC
   */
  public async loadSceneAsync(
    _scene: Scene,
    _data: any,
    _rootUrl: string,
    _onProgress?: (event: ISceneLoaderProgressEvent) => void,
  ): Promise<void> {
    // IFC files are loaded as meshes, not as complete scenes
    throw new Error("IFC loader does not support loadSceneAsync. Use importMeshAsync instead.");
  }

  /**
   * Load async (ISceneLoaderPluginAsync interface)
   */
  public async loadAsync(
    scene: Scene,
    data: string | File,
    _rootUrl: string,
    onProgress?: (event: ISceneLoaderProgressEvent) => void,
  ): Promise<void> {
    await this.loadIfcFile(scene, data, onProgress);
  }

  /**
   * Load into asset container (ISceneLoaderPluginAsync interface)
   */
  public async loadAssetContainerAsync(
    scene: Scene,
    data: string | File,
    _rootUrl: string,
    onProgress?: (event: ISceneLoaderProgressEvent) => void,
  ): Promise<AssetContainer> {
    const result = await this.loadIfcFile(scene, data, onProgress);

    const container = new AssetContainer(scene);
    container.meshes.push(...result.meshes);
    container.transformNodes.push(result.rootNode);

    return container;
  }

  /**
   * Get the loader result from a root node
   */
  public static getLoaderResult(rootNode: TransformNode): IfcLoaderResult | null {
    return rootNode.metadata?._ifcLoaderResult ?? null;
  }

  /**
   * Static method to load IFC file directly
   */
  public static async loadAsync(
    source: string | File,
    scene: Scene,
    options?: Partial<IfcLoaderOptions>,
  ): Promise<IfcLoaderResult> {
    const plugin = new IfcLoaderPlugin(options);
    return plugin.loadIfcFile(scene, source);
  }

  /**
   * Dispose an IFC model and free memory
   */
  public static disposeModel(scene: Scene, modelID: number): void {
    disposeIfcScene(scene);
    const ifcAPI = globalIfcAPI;
    if (ifcAPI) {
      closeIfcModel(ifcAPI, modelID);
    }
  }
}

// ============================================================================
// PLUGIN REGISTRATION
// ============================================================================

// Register the plugin with Babylon.js SceneLoader
SceneLoader.RegisterPlugin(new IfcLoaderPlugin());

// ============================================================================
// PUBLIC API EXPORTS
// ============================================================================

export { IfcLoaderPlugin };

/**
 * Convenience function to load an IFC file
 */
export async function loadIfc(
  source: string | File,
  scene: Scene,
  options?: Partial<IfcLoaderOptions>,
): Promise<IfcLoaderResult> {
  return IfcLoaderPlugin.loadAsync(source, scene, options);
}

/**
 * Convenience function to dispose an IFC model
 */
export function disposeIfc(scene: Scene, modelID: number): void {
  IfcLoaderPlugin.disposeModel(scene, modelID);
}

/**
 * Get the web-ifc API instance (for advanced usage)
 */
export async function getWebIfcAPI(): Promise<WebIFC.IfcAPI> {
  return getIfcAPI();
}

/**
 * Get project info from a loaded model
 */
export function getIfcProjectInfo(modelID: number): ProjectInfoResult | null {
  if (!globalIfcAPI) return null;
  return getProjectInfo(globalIfcAPI, modelID);
}
