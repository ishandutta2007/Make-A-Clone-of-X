/**
 * MACX JavaScript/Electron Static Analysis Engine
 *
 * Scans an application directory to discover JavaScript modules, parse their
 * imports/exports, detect Electron IPC boundaries, and build a module graph.
 * Works without any external provider — only Node.js built-ins are needed.
 */

import { readdir, readFile, stat, access } from "node:fs/promises";
import { join, relative, extname, basename, dirname } from "node:path";

import type { ModuleInfo, ImportInfo, ApplicationAnalysis, ElectronInfo } from "./types.js";

/** File extensions recognized as JavaScript modules. */
const JS_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"]);

/** Maximum file size to analyze (2 MiB). */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Maximum directory depth to prevent runaway traversals. */
const MAX_DEPTH = 20;

/** Directories to skip during traversal. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "__pycache__",
  ".cache",
  "coverage",
]);

/**
 * Analyze a JavaScript or Electron application directory.
 *
 * Walks the file tree, parses JS/TS modules for imports and exports, detects
 * Electron entry points and IPC patterns, and returns a structured analysis.
 */
export const analyzeJavaScriptApplication = async (
  appPath: string,
  options: { includeSourceMaps?: boolean } = {},
): Promise<ApplicationAnalysis> => {
  const appStat = await stat(appPath);
  if (!appStat.isDirectory()) {
    throw new Error(`Path is not a directory: ${appPath}`);
  }

  const modules: ModuleInfo[] = [];
  const errors: string[] = [];

  // Walk the directory tree
  await walkDirectory(appPath, appPath, modules, errors, 0);

  // Detect Electron
  const electronInfo = await detectElectron(appPath, modules);

  // Detect package.json metadata
  const packageInfo = await readPackageJson(appPath);

  // Detect source maps if requested
  const sourceMapCount = options.includeSourceMaps
    ? modules.filter((m) => m.hasSourceMap).length
    : 0;

  // Build the module graph edges
  const importGraph = buildImportGraph(modules);

  // Detect entry points
  const entryPoints = detectEntryPoints(modules, packageInfo, electronInfo);

  // Compute summary stats
  const totalLines = modules.reduce((sum, m) => sum + m.lineCount, 0);
  const totalSize = modules.reduce((sum, m) => sum + m.size, 0);

  return {
    path: appPath,
    summary: {
      totalModules: modules.length,
      totalLines,
      totalSize,
      sourceMapCount,
      entryPoints: entryPoints.length,
      importEdges: importGraph.length,
      errors: errors.length,
    },
    packageInfo,
    electronInfo,
    entryPoints,
    modules,
    importGraph,
    errors,
  };
};

/** Recursively walk a directory, collecting JS module info. */
async function walkDirectory(
  rootPath: string,
  currentPath: string,
  modules: ModuleInfo[],
  errors: string[],
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch (cause) {
    errors.push(`Cannot read directory: ${relative(rootPath, currentPath)}`);
    return;
  }

  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);
    const relativePath = relative(rootPath, fullPath);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        await walkDirectory(rootPath, fullPath, modules, errors, depth + 1);
      }
    } else if (entry.isFile() && JS_EXTENSIONS.has(extname(entry.name))) {
      try {
        const fileStat = await stat(fullPath);
        if (fileStat.size > MAX_FILE_SIZE) {
          errors.push(`File too large (${fileStat.size} bytes), skipped: ${relativePath}`);
          continue;
        }

        const content = await readFile(fullPath, "utf-8");
        const moduleInfo = parseModule(relativePath, content, fileStat.size);

        // Check for companion source map
        const mapPath = `${fullPath}.map`;
        try {
          await access(mapPath);
          moduleInfo.hasSourceMap = true;
        } catch {
          moduleInfo.hasSourceMap = false;
        }

        modules.push(moduleInfo);
      } catch (cause) {
        errors.push(`Cannot read file: ${relativePath}`);
      }
    }
  }
}

/** Parse a single JavaScript/TypeScript module for imports, exports, and metadata. */
function parseModule(
  relativePath: string,
  content: string,
  size: number,
): ModuleInfo {
  const lines = content.split("\n");
  const imports = extractImports(content);
  const exports = extractExports(content);
  const isElectronMain = detectElectronMainProcess(content);
  const isElectronRenderer = detectElectronRenderer(content);
  const isElectronPreload = detectElectronPreload(content);
  const hasIpc = detectIpcUsage(content);
  const framework = detectFramework(content, relativePath);

  return {
    path: relativePath,
    size,
    lineCount: lines.length,
    imports,
    exports,
    isElectronMain,
    isElectronRenderer,
    isElectronPreload,
    hasIpc,
    hasSourceMap: false,
    framework,
  };
}

/** Extract import statements from source content using regex patterns. */
function extractImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // ES module imports: import X from 'Y', import { X } from 'Y', import 'Y'
  const esImportRe = /import\s+(?:(?:(\{[^}]*\})|(\*\s+as\s+\w+)|([\w$]+))(?:\s*,\s*(?:(\{[^}]*\})|(\*\s+as\s+\w+)))?(?:\s+from\s+)?)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = esImportRe.exec(content)) !== null) {
    const specifier = match[6]!;
    imports.push({
      specifier,
      type: specifier.startsWith(".") ? "relative" : "package",
      isDynamic: false,
    });
  }

  // Dynamic imports: import('X'), import("X")
  const dynamicImportRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRe.exec(content)) !== null) {
    const specifier = match[1]!;
    imports.push({
      specifier,
      type: specifier.startsWith(".") ? "relative" : "package",
      isDynamic: true,
    });
  }

  // CommonJS requires: require('X'), require("X")
  const requireRe = /(?:^|[^.\w])require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRe.exec(content)) !== null) {
    const specifier = match[1]!;
    imports.push({
      specifier,
      type: specifier.startsWith(".") ? "relative" : "package",
      isDynamic: false,
    });
  }

  return deduplicateImports(imports);
}

/** Extract export declarations from source content. */
function extractExports(content: string): string[] {
  const exports: string[] = [];

  // Named exports: export { X }, export const X, export function X, export class X
  const namedExportRe = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
  let match;
  while ((match = namedExportRe.exec(content)) !== null) {
    exports.push(match[1]!);
  }

  // Default export
  if (/export\s+default\s+/.test(content)) {
    exports.push("default");
  }

  // module.exports
  if (/module\.exports\s*=/.test(content)) {
    exports.push("default (CJS)");
  }

  return [...new Set(exports)];
}

/** Detect if a file is an Electron main process module. */
function detectElectronMainProcess(content: string): boolean {
  return (
    /require\(\s*['"]electron['"]\s*\)/.test(content) &&
    (/BrowserWindow/.test(content) || /app\.on\(/.test(content) || /app\.whenReady/.test(content))
  );
}

/** Detect if a file is an Electron renderer module. */
function detectElectronRenderer(content: string): boolean {
  return (
    /(?:require\(\s*['"]electron['"]\s*\)|from\s+['"]electron['"])/.test(content) &&
    /ipcRenderer/.test(content)
  );
}

/** Detect if a file is an Electron preload script. */
function detectElectronPreload(content: string): boolean {
  return (
    /contextBridge/.test(content) ||
    (/preload/i.test(content) && /ipcRenderer/.test(content))
  );
}

/** Detect IPC usage (Electron or Node.js). */
function detectIpcUsage(content: string): boolean {
  return (
    /ipcMain/.test(content) ||
    /ipcRenderer/.test(content) ||
    /contextBridge\.exposeInMainWorld/.test(content) ||
    /\.on\(\s*['"]message['"]/.test(content) ||
    /\.send\(\s*['"]/.test(content)
  );
}

/** Detect which framework a file belongs to. */
function detectFramework(
  content: string,
  path: string,
): string | undefined {
  if (/from\s+['"]react['"]|require\(\s*['"]react['"]\)/.test(content)) return "react";
  if (/from\s+['"]vue['"]|require\(\s*['"]vue['"]\)/.test(content)) return "vue";
  if (/from\s+['"]@angular\//.test(content)) return "angular";
  if (/from\s+['"]svelte['"]/.test(content)) return "svelte";
  if (/from\s+['"]next['"]|from\s+['"]next\//.test(content)) return "next.js";
  if (/from\s+['"]express['"]|require\(\s*['"]express['"]\)/.test(content)) return "express";
  if (/from\s+['"]electron['"]|require\(\s*['"]electron['"]\)/.test(content)) return "electron";
  return undefined;
}

/** Deduplicate import entries by specifier. */
function deduplicateImports(imports: ImportInfo[]): ImportInfo[] {
  const seen = new Map<string, ImportInfo>();
  for (const imp of imports) {
    if (!seen.has(imp.specifier)) {
      seen.set(imp.specifier, imp);
    }
  }
  return [...seen.values()];
}

/** Detect Electron in the application. */
async function detectElectron(
  appPath: string,
  modules: ModuleInfo[],
): Promise<ElectronInfo | undefined> {
  const mainProcessModules = modules.filter((m) => m.isElectronMain);
  const rendererModules = modules.filter((m) => m.isElectronRenderer);
  const preloadModules = modules.filter((m) => m.isElectronPreload);
  const ipcModules = modules.filter((m) => m.hasIpc);

  if (mainProcessModules.length === 0 && rendererModules.length === 0) {
    // Check package.json for electron dependency
    const pkg = await readPackageJson(appPath);
    if (!pkg?.dependencies?.electron && !pkg?.devDependencies?.electron) {
      return undefined;
    }
  }

  return {
    isElectron: true,
    mainProcess: mainProcessModules.map((m) => m.path),
    renderer: rendererModules.map((m) => m.path),
    preload: preloadModules.map((m) => m.path),
    ipcChannels: ipcModules.map((m) => m.path),
  };
}

/** Read and parse package.json from the app directory. */
async function readPackageJson(
  appPath: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await readFile(join(appPath, "package.json"), "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Build the import graph from module information. */
function buildImportGraph(
  modules: ModuleInfo[],
): Array<{ from: string; to: string; isDynamic: boolean }> {
  const edges: Array<{ from: string; to: string; isDynamic: boolean }> = [];

  for (const mod of modules) {
    for (const imp of mod.imports) {
      if (imp.type === "relative") {
        // Resolve relative import to a module path
        const resolvedDir = dirname(mod.path);
        const resolved = join(resolvedDir, imp.specifier).replace(/\\/g, "/");
        edges.push({
          from: mod.path,
          to: resolved,
          isDynamic: imp.isDynamic,
        });
      } else {
        edges.push({
          from: mod.path,
          to: imp.specifier,
          isDynamic: imp.isDynamic,
        });
      }
    }
  }

  return edges;
}

/** Detect entry points from package.json and Electron main process. */
function detectEntryPoints(
  modules: ModuleInfo[],
  packageInfo: Record<string, unknown> | undefined,
  electronInfo: ElectronInfo | undefined,
): string[] {
  const entryPoints: string[] = [];

  // package.json "main" field
  if (packageInfo?.main && typeof packageInfo.main === "string") {
    entryPoints.push(packageInfo.main);
  }

  // package.json "module" field
  if (packageInfo?.module && typeof packageInfo.module === "string") {
    entryPoints.push(packageInfo.module as string);
  }

  // Electron main process files
  if (electronInfo?.mainProcess) {
    entryPoints.push(...electronInfo.mainProcess);
  }

  // Common entry point names
  const commonEntries = ["index.js", "index.ts", "main.js", "main.ts", "app.js", "app.ts", "src/index.js", "src/index.ts", "src/main.js", "src/main.ts"];
  for (const entry of commonEntries) {
    if (modules.some((m) => m.path === entry || m.path === entry.replace(/\//g, "\\"))) {
      if (!entryPoints.includes(entry)) {
        entryPoints.push(entry);
      }
    }
  }

  return [...new Set(entryPoints)];
}
