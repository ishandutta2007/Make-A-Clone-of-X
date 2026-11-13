/**
 * Type definitions for the MACX JavaScript/Electron analysis engine.
 */

/** Information about a single import in a module. */
export interface ImportInfo {
  /** The import specifier (e.g., "./utils", "react", "electron"). */
  readonly specifier: string;
  /** Whether this is a relative import or a package import. */
  readonly type: "relative" | "package";
  /** Whether this is a dynamic import (import() or lazy require). */
  readonly isDynamic: boolean;
}

/** Information about a single JavaScript/TypeScript module. */
export interface ModuleInfo {
  /** Relative path from the application root. */
  readonly path: string;
  /** File size in bytes. */
  readonly size: number;
  /** Number of lines. */
  readonly lineCount: number;
  /** Import statements found in the module. */
  readonly imports: ImportInfo[];
  /** Export names declared by the module. */
  readonly exports: string[];
  /** Whether this module is an Electron main process module. */
  readonly isElectronMain: boolean;
  /** Whether this module is an Electron renderer module. */
  readonly isElectronRenderer: boolean;
  /** Whether this module is an Electron preload script. */
  readonly isElectronPreload: boolean;
  /** Whether this module uses IPC. */
  readonly hasIpc: boolean;
  /** Whether a companion .map source map file exists. */
  hasSourceMap: boolean;
  /** Detected framework (react, vue, angular, express, electron, etc.). */
  readonly framework: string | undefined;
}

/** Information about Electron-specific structure. */
export interface ElectronInfo {
  /** Whether the application is an Electron app. */
  readonly isElectron: boolean;
  /** Paths of main process modules. */
  readonly mainProcess: string[];
  /** Paths of renderer process modules. */
  readonly renderer: string[];
  /** Paths of preload scripts. */
  readonly preload: string[];
  /** Paths of modules using IPC. */
  readonly ipcChannels: string[];
}

/** Complete analysis result for a JavaScript/Electron application. */
export interface ApplicationAnalysis {
  /** Absolute path to the analyzed application. */
  readonly path: string;
  /** Summary statistics. */
  readonly summary: {
    readonly totalModules: number;
    readonly totalLines: number;
    readonly totalSize: number;
    readonly sourceMapCount: number;
    readonly entryPoints: number;
    readonly importEdges: number;
    readonly errors: number;
  };
  /** Parsed package.json contents, if available. */
  readonly packageInfo: Record<string, unknown> | undefined;
  /** Electron-specific information, if the app is an Electron app. */
  readonly electronInfo: ElectronInfo | undefined;
  /** Detected entry points. */
  readonly entryPoints: string[];
  /** All discovered modules with their metadata. */
  readonly modules: ModuleInfo[];
  /** Import graph edges (from → to). */
  readonly importGraph: Array<{
    readonly from: string;
    readonly to: string;
    readonly isDynamic: boolean;
  }>;
  /** Errors encountered during analysis. */
  readonly errors: string[];
}
