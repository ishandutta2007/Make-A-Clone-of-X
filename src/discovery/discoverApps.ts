/**
 * MACX Desktop Application Discovery Engine
 *
 * Scans common OS install locations to find installed desktop applications,
 * detect their type (Electron, native, web-wrapper), find bundled JavaScript,
 * and identify frameworks. Works cross-platform (macOS, Windows, Linux).
 *
 * Uses only Node.js built-ins — no external dependencies required.
 */

import { readdir, readFile, stat, access } from "node:fs/promises";
import { join, basename, extname, resolve } from "node:path";
import { homedir, platform } from "node:os";

import type {
  DiscoveredApp,
  DiscoveryResult,
  ScanLocations,
  AppType,
} from "./types.js";

/** Maximum depth for recursion inside an app bundle. */
const MAX_APP_DEPTH = 6;

/** Directories to skip when looking for JS bundles. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".cache",
  "coverage",
  "logs",
  "log",
  "tmp",
  "temp",
]);

/** Known Electron indicator files. */
const ELECTRON_INDICATORS = [
  "electron.asar",
  "electron",
  "resources/electron.asar",
  "resources/app.asar",
  "resources/app",
];

/** Known NW.js indicator files. */
const NWJS_INDICATORS = ["nw.exe", "nw", "package.nw"];

/** Framework detection patterns for package.json dependencies. */
const FRAMEWORK_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^electron$/, name: "Electron" },
  { pattern: /^nw$/, name: "NW.js" },
  { pattern: /^react$/, name: "React" },
  { pattern: /^react-native$/, name: "React Native" },
  { pattern: /^vue$/, name: "Vue" },
  { pattern: /^@angular\/core$/, name: "Angular" },
  { pattern: /^svelte$/, name: "Svelte" },
  { pattern: /^next$/, name: "Next.js" },
  { pattern: /^express$/, name: "Express" },
  { pattern: /^flutter/, name: "Flutter" },
  { pattern: /^@electron-forge/, name: "Electron Forge" },
  { pattern: /^electron-builder$/, name: "electron-builder" },
  { pattern: /^tauri/, name: "Tauri" },
];

/**
 * Get platform-specific scan locations.
 */
export function getScanLocations(
  plat: NodeJS.Platform = platform(),
  home: string = homedir(),
): ScanLocations {
  switch (plat) {
    case "darwin":
      return {
        appDirs: ["/Applications", "/System/Applications"],
        userAppDirs: [join(home, "Applications")],
      };
    case "win32": {
      const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
      const programFilesX86 =
        process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
      const localAppData =
        process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
      return {
        appDirs: [programFiles, programFilesX86],
        userAppDirs: [
          join(localAppData, "Programs"),
          join(home, "AppData", "Local"),
        ],
      };
    }
    case "linux":
      return {
        appDirs: [
          "/usr/share/applications",
          "/usr/local/share/applications",
          "/opt",
          "/snap",
          "/var/lib/flatpak/app",
        ],
        userAppDirs: [
          join(home, ".local", "share", "applications"),
          join(home, ".config"),
        ],
      };
    default:
      return { appDirs: [], userAppDirs: [] };
  }
}

/**
 * Discover installed desktop applications.
 *
 * Scans platform-appropriate directories, identifies application bundles,
 * detects their type (Electron, NW.js, native, etc.), finds bundled
 * JavaScript, and identifies frameworks.
 */
export async function discoverApplications(
  options: {
    /** Additional directories to scan beyond the platform defaults. */
    additionalPaths?: string[];
    /** Scan user-specific directories in addition to system ones. */
    includeUserApps?: boolean;
    /** Filter by application type. */
    filterType?: AppType;
    /** Maximum number of apps to return. */
    limit?: number;
  } = {},
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const plat = platform();
  const locations = getScanLocations(plat);

  const pathsToScan = [
    ...locations.appDirs,
    ...(options.includeUserApps !== false ? locations.userAppDirs : []),
    ...(options.additionalPaths ?? []),
  ];

  const apps: DiscoveredApp[] = [];
  const errors: string[] = [];
  const scannedPaths: string[] = [];

  for (const scanPath of pathsToScan) {
    try {
      await access(scanPath);
      scannedPaths.push(scanPath);

      if (plat === "darwin") {
        await scanMacOsApps(scanPath, apps, errors);
      } else if (plat === "win32") {
        await scanWindowsApps(scanPath, apps, errors);
      } else if (plat === "linux") {
        await scanLinuxApps(scanPath, apps, errors);
      }
    } catch {
      // Directory doesn't exist or isn't accessible — skip silently
    }
  }

  // Apply filters
  let filteredApps = apps;
  if (options.filterType) {
    filteredApps = filteredApps.filter((a) => a.type === options.filterType);
  }

  // Sort by name
  filteredApps.sort((a, b) => a.name.localeCompare(b.name));

  // Apply limit
  if (options.limit && options.limit > 0) {
    filteredApps = filteredApps.slice(0, options.limit);
  }

  return {
    platform: plat,
    scannedPaths,
    totalApps: filteredApps.length,
    apps: filteredApps,
    errors,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Discover a single application at a specific path.
 * Useful for targeted analysis when you already know the app location.
 */
export async function discoverSingleApp(
  appPath: string,
): Promise<DiscoveredApp | undefined> {
  const absolutePath = resolve(appPath);
  const plat = platform();

  try {
    const s = await stat(absolutePath);
    if (!s.isDirectory()) return undefined;

    if (plat === "darwin" && absolutePath.endsWith(".app")) {
      return await analyzeMacOsApp(absolutePath);
    }

    // Try as a generic app directory (Windows/Linux)
    return await analyzeGenericAppDir(absolutePath);
  } catch {
    return undefined;
  }
}

// ─── macOS ─────────────────────────────────────────────────────────

async function scanMacOsApps(
  dirPath: string,
  apps: DiscoveredApp[],
  errors: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    errors.push(`Cannot read directory: ${dirPath}`);
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      try {
        const app = await analyzeMacOsApp(join(dirPath, entry.name));
        if (app) apps.push(app);
      } catch (cause) {
        errors.push(
          `Error analyzing ${entry.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
  }
}

async function analyzeMacOsApp(
  appBundlePath: string,
): Promise<DiscoveredApp | undefined> {
  const name = basename(appBundlePath, ".app");
  const contentsPath = join(appBundlePath, "Contents");

  let plistData: Record<string, unknown> | undefined;
  try {
    const plistContent = await readFile(
      join(contentsPath, "Info.plist"),
      "utf-8",
    );
    plistData = parseSimplePlist(plistContent);
  } catch {
    // No Info.plist
  }

  const executable = plistData?.CFBundleExecutable
    ? join(contentsPath, "MacOS", String(plistData.CFBundleExecutable))
    : undefined;

  const version = plistData?.CFBundleShortVersionString
    ? String(plistData.CFBundleShortVersionString)
    : undefined;

  const bundleId = plistData?.CFBundleIdentifier
    ? String(plistData.CFBundleIdentifier)
    : undefined;

  // Detect app type and frameworks
  const resourcesPath = join(contentsPath, "Resources");
  const { type, frameworks } = await detectAppTypeAndFrameworks(
    appBundlePath,
    resourcesPath,
  );

  // Find bundled JS
  const bundledJsPaths = await findBundledJavascript(appBundlePath);

  // Get approximate size
  const size = await getDirectorySize(appBundlePath);

  return {
    name,
    path: appBundlePath,
    executable,
    version,
    bundleId,
    type,
    frameworks,
    hasBundledJs: bundledJsPaths.length > 0,
    bundledJsPaths,
    size,
  };
}

// ─── Windows ───────────────────────────────────────────────────────

async function scanWindowsApps(
  dirPath: string,
  apps: DiscoveredApp[],
  errors: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    errors.push(`Cannot read directory: ${dirPath}`);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fullPath = join(dirPath, entry.name);
    try {
      const app = await analyzeGenericAppDir(fullPath);
      if (app) apps.push(app);
    } catch (cause) {
      errors.push(
        `Error analyzing ${entry.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
}

// ─── Linux ─────────────────────────────────────────────────────────

async function scanLinuxApps(
  dirPath: string,
  apps: DiscoveredApp[],
  errors: string[],
): Promise<void> {
  // For /opt and /snap, scan subdirectories as app bundles
  const base = basename(dirPath);
  if (base === "opt" || base === "snap" || dirPath.includes("flatpak")) {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      errors.push(`Cannot read directory: ${dirPath}`);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(dirPath, entry.name);
      try {
        const app = await analyzeGenericAppDir(fullPath);
        if (app) apps.push(app);
      } catch (cause) {
        errors.push(
          `Error analyzing ${entry.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
    return;
  }

  // For .desktop file directories, parse .desktop files
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    errors.push(`Cannot read directory: ${dirPath}`);
    return;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".desktop")) {
      try {
        const desktopContent = await readFile(
          join(dirPath, entry.name),
          "utf-8",
        );
        const app = parseDesktopFile(desktopContent, entry.name);
        if (app) apps.push(app);
      } catch {
        // Skip unparseable .desktop files
      }
    }
  }
}

// ─── Generic App Directory Analysis ────────────────────────────────

async function analyzeGenericAppDir(
  appPath: string,
): Promise<DiscoveredApp | undefined> {
  const name = basename(appPath);

  // Read package.json if available
  let packageInfo: Record<string, unknown> | undefined;
  try {
    const content = await readFile(join(appPath, "package.json"), "utf-8");
    packageInfo = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // No package.json
  }

  // Look for executable files
  const executable = await findExecutable(appPath, name);

  // If no executable and no package.json, this isn't really an app
  if (!executable && !packageInfo) {
    // Check if there's at least a resources folder (Electron pattern)
    try {
      await access(join(appPath, "resources"));
    } catch {
      return undefined;
    }
  }

  const version = packageInfo?.version ? String(packageInfo.version) : undefined;

  // Detect app type and frameworks
  const { type, frameworks } = await detectAppTypeAndFrameworks(
    appPath,
    join(appPath, "resources"),
  );

  // Find bundled JS
  const bundledJsPaths = await findBundledJavascript(appPath);

  // Get size
  const size = await getDirectorySize(appPath);

  return {
    name: packageInfo?.name ? String(packageInfo.name) : name,
    path: appPath,
    executable,
    version,
    bundleId: undefined,
    type,
    frameworks,
    hasBundledJs: bundledJsPaths.length > 0,
    bundledJsPaths,
    size,
  };
}

// ─── Detection Helpers ─────────────────────────────────────────────

async function detectAppTypeAndFrameworks(
  appPath: string,
  resourcesPath: string,
): Promise<{ type: AppType; frameworks: string[] }> {
  const frameworks: string[] = [];
  let type: AppType = "unknown";

  // Check Electron indicators
  for (const indicator of ELECTRON_INDICATORS) {
    try {
      await access(join(appPath, indicator));
      type = "electron";
      frameworks.push("Electron");
      break;
    } catch {
      // Not found
    }
    try {
      await access(join(resourcesPath, indicator));
      type = "electron";
      frameworks.push("Electron");
      break;
    } catch {
      // Not found
    }
  }

  // Check NW.js indicators
  if (type === "unknown") {
    for (const indicator of NWJS_INDICATORS) {
      try {
        await access(join(appPath, indicator));
        type = "nw.js";
        frameworks.push("NW.js");
        break;
      } catch {
        // Not found
      }
    }
  }

  // Check package.json for framework deps
  let packageInfo: Record<string, unknown> | undefined;
  const pkgPaths = [
    join(appPath, "package.json"),
    join(resourcesPath, "app", "package.json"),
    join(appPath, "resources", "app", "package.json"),
  ];

  for (const pkgPath of pkgPaths) {
    try {
      const content = await readFile(pkgPath, "utf-8");
      packageInfo = JSON.parse(content) as Record<string, unknown>;
      break;
    } catch {
      // Try next
    }
  }

  if (packageInfo) {
    const allDeps = {
      ...(typeof packageInfo.dependencies === "object" && packageInfo.dependencies !== null
        ? (packageInfo.dependencies as Record<string, string>)
        : {}),
      ...(typeof packageInfo.devDependencies === "object" && packageInfo.devDependencies !== null
        ? (packageInfo.devDependencies as Record<string, string>)
        : {}),
    };

    for (const depName of Object.keys(allDeps)) {
      for (const fp of FRAMEWORK_PATTERNS) {
        if (fp.pattern.test(depName) && !frameworks.includes(fp.name)) {
          frameworks.push(fp.name);
          if (fp.name === "Electron") type = "electron";
          if (fp.name === "NW.js") type = "nw.js";
        }
      }
    }
  }

  // If we found frameworks but no type, mark as native
  if (type === "unknown") {
    type = "native";
  }

  return { type, frameworks };
}

async function findBundledJavascript(
  appPath: string,
  depth = 0,
): Promise<string[]> {
  if (depth > MAX_APP_DEPTH) return [];
  const jsPaths: string[] = [];

  let entries;
  try {
    entries = await readdir(appPath, { withFileTypes: true });
  } catch {
    return [];
  }

  let hasJsFiles = false;
  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = extname(entry.name);
      if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
        hasJsFiles = true;
      }
      // .asar files contain bundled JS
      if (ext === ".asar") {
        jsPaths.push(join(appPath, entry.name));
      }
    } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      const subPaths = await findBundledJavascript(
        join(appPath, entry.name),
        depth + 1,
      );
      jsPaths.push(...subPaths);
    }
  }

  if (hasJsFiles) {
    jsPaths.push(appPath);
  }

  return [...new Set(jsPaths)];
}

async function findExecutable(
  appPath: string,
  appName: string,
): Promise<string | undefined> {
  const plat = platform();

  // Platform-specific executable names to check
  const candidates: string[] = [];

  if (plat === "win32") {
    candidates.push(
      `${appName}.exe`,
      `${appName.toLowerCase()}.exe`,
      `${appName.replace(/\s+/g, "")}.exe`,
    );
  } else {
    candidates.push(appName, appName.toLowerCase(), appName.replace(/\s+/g, "-").toLowerCase());
  }

  let entries;
  try {
    entries = await readdir(appPath, { withFileTypes: true });
  } catch {
    return undefined;
  }

  // Check direct matches
  for (const candidate of candidates) {
    const match = entries.find(
      (e) => e.isFile() && e.name.toLowerCase() === candidate.toLowerCase(),
    );
    if (match) return join(appPath, match.name);
  }

  // On Windows, find any .exe file
  if (plat === "win32") {
    const exeEntry = entries.find(
      (e) => e.isFile() && e.name.endsWith(".exe"),
    );
    if (exeEntry) return join(appPath, exeEntry.name);
  }

  return undefined;
}

async function getDirectorySize(
  dirPath: string,
  depth = 0,
): Promise<number> {
  if (depth > 3) return 0; // Only check a few levels for performance
  let totalSize = 0;

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isFile()) {
      try {
        const s = await stat(fullPath);
        totalSize += s.size;
      } catch {
        // Skip
      }
    } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
      totalSize += await getDirectorySize(fullPath, depth + 1);
    }
  }

  return totalSize;
}

// ─── Parsers ───────────────────────────────────────────────────────

/**
 * Simple Info.plist parser (XML format).
 * Extracts key-value pairs from a basic plist structure using regex.
 * Does not handle all plist features — just enough for app metadata.
 */
function parseSimplePlist(
  content: string,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};

  // Match <key>...</key> followed by <string>...</string>
  const keyValueRe =
    /<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g;
  let match;
  while ((match = keyValueRe.exec(content)) !== null) {
    result[match[1]!] = match[2]!;
  }

  // Match <key>...</key> followed by <true/> or <false/>
  const boolRe = /<key>([^<]+)<\/key>\s*<(true|false)\s*\/>/g;
  while ((match = boolRe.exec(content)) !== null) {
    result[match[1]!] = match[2] === "true";
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Parse a Linux .desktop file into a DiscoveredApp.
 */
function parseDesktopFile(
  content: string,
  fileName: string,
): DiscoveredApp | undefined {
  const lines = content.split("\n");
  let name: string | undefined;
  let exec: string | undefined;
  let appType: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Name=") && !name) {
      name = trimmed.slice(5);
    } else if (trimmed.startsWith("Exec=")) {
      exec = trimmed.slice(5).split(/\s+/)[0]; // First token
    } else if (trimmed.startsWith("Type=")) {
      appType = trimmed.slice(5);
    }
  }

  if (!name || appType !== "Application") return undefined;

  // Clean up exec path (remove %U, %F, etc.)
  const cleanExec = exec?.replace(/%[a-zA-Z]/g, "").trim();

  return {
    name,
    path: cleanExec ?? fileName,
    executable: cleanExec,
    version: undefined,
    bundleId: fileName.replace(".desktop", ""),
    type: "native",
    frameworks: [],
    hasBundledJs: false,
    bundledJsPaths: [],
    size: 0,
  };
}
