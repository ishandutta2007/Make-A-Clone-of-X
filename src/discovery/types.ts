/**
 * Type definitions for the MACX Desktop Application Discovery engine.
 */

/** A single discovered desktop application. */
export interface DiscoveredApp {
  /** Display name of the application. */
  readonly name: string;
  /** Absolute path to the application bundle or directory. */
  readonly path: string;
  /** Absolute path to the main executable. */
  readonly executable: string | undefined;
  /** Application version, if detected. */
  readonly version: string | undefined;
  /** Application bundle identifier (e.g., com.company.app), if available. */
  readonly bundleId: string | undefined;
  /** Detected application type. */
  readonly type: AppType;
  /** Detected frameworks (Electron, React Native, Flutter, Qt, etc.). */
  readonly frameworks: string[];
  /** Whether bundled JavaScript was detected. */
  readonly hasBundledJs: boolean;
  /** Paths to bundled JavaScript directories, if any. */
  readonly bundledJsPaths: string[];
  /** Size of the application in bytes (approximate). */
  readonly size: number;
}

/** Application type classification. */
export type AppType =
  | "electron"
  | "nw.js"
  | "native"
  | "web-wrapper"
  | "pwa"
  | "unknown";

/** Platform-specific scan locations. */
export interface ScanLocations {
  /** Primary application directories to scan. */
  readonly appDirs: string[];
  /** User-specific application directories. */
  readonly userAppDirs: string[];
}

/** Discovery result for the entire scan. */
export interface DiscoveryResult {
  /** Platform the scan was run on. */
  readonly platform: NodeJS.Platform;
  /** Directories that were scanned. */
  readonly scannedPaths: string[];
  /** Total number of apps found. */
  readonly totalApps: number;
  /** Discovered applications. */
  readonly apps: DiscoveredApp[];
  /** Errors encountered during scanning. */
  readonly errors: string[];
  /** Duration of the scan in milliseconds. */
  readonly durationMs: number;
}
