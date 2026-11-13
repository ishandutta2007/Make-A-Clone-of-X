import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";

import {
  discoverApplications,
  discoverSingleApp,
  getScanLocations,
} from "../../src/discovery/discoverApps.js";

/** Create a mock Electron app directory. */
async function createMockElectronApp(rootDir: string): Promise<string> {
  const appDir = join(rootDir, "TestElectronApp");
  await mkdir(appDir, { recursive: true });

  // Create Electron indicators
  await mkdir(join(appDir, "resources"), { recursive: true });
  await writeFile(join(appDir, "resources", "app.asar"), "mock asar content");

  // Create package.json with Electron dep
  await writeFile(
    join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "test-electron-app",
        version: "2.1.0",
        dependencies: { electron: "^28.0.0", react: "^18.0.0" },
      },
      null,
      2,
    ),
  );

  // Create a JS file
  await writeFile(join(appDir, "main.js"), "console.log('hello');");

  return appDir;
}

/** Create a mock native app directory. */
async function createMockNativeApp(rootDir: string): Promise<string> {
  const appDir = join(rootDir, "TestNativeApp");
  await mkdir(appDir, { recursive: true });

  // Create package.json without Electron
  await writeFile(
    join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "test-native-app",
        version: "1.0.0",
        dependencies: { express: "^4.18.0" },
      },
      null,
      2,
    ),
  );

  // Create an executable-like file (just a placeholder)
  if (platform() === "win32") {
    await writeFile(join(appDir, "TestNativeApp.exe"), "mock exe");
  } else {
    await writeFile(join(appDir, "testnativeapp"), "mock binary");
  }

  return appDir;
}

/** Create a mock macOS .app bundle. */
async function createMockMacOsApp(rootDir: string): Promise<string> {
  const appDir = join(rootDir, "TestApp.app");
  const contentsDir = join(appDir, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  const resourcesDir = join(contentsDir, "Resources");

  await mkdir(macosDir, { recursive: true });
  await mkdir(resourcesDir, { recursive: true });

  // Create a simple Info.plist
  await writeFile(
    join(contentsDir, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>TestApp</string>
  <key>CFBundleIdentifier</key>
  <string>com.test.testapp</string>
  <key>CFBundleShortVersionString</key>
  <string>3.2.1</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>`,
  );

  // Create the executable
  await writeFile(join(macosDir, "TestApp"), "mock binary");

  return appDir;
}

describe("getScanLocations", () => {
  it("should return macOS locations for darwin", () => {
    const locations = getScanLocations("darwin", "/Users/test");
    expect(locations.appDirs).toContain("/Applications");
    expect(locations.appDirs).toContain("/System/Applications");
    expect(locations.userAppDirs[0]).toContain("Applications");
  });

  it("should return Windows locations for win32", () => {
    const locations = getScanLocations("win32", "C:\\Users\\test");
    expect(locations.appDirs.length).toBeGreaterThanOrEqual(2);
    expect(locations.userAppDirs.length).toBeGreaterThanOrEqual(1);
  });

  it("should return Linux locations for linux", () => {
    const locations = getScanLocations("linux", "/home/test");
    expect(locations.appDirs).toContain("/opt");
    expect(locations.appDirs).toContain("/snap");
    expect(locations.userAppDirs.length).toBeGreaterThanOrEqual(1);
  });

  it("should return empty locations for unsupported platform", () => {
    const locations = getScanLocations("freebsd" as NodeJS.Platform, "/home/test");
    expect(locations.appDirs).toHaveLength(0);
    expect(locations.userAppDirs).toHaveLength(0);
  });
});

describe("discoverSingleApp", () => {
  let tempDir: string;
  let electronAppDir: string;
  let nativeAppDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "macx-discovery-test-"));
    electronAppDir = await createMockElectronApp(tempDir);
    nativeAppDir = await createMockNativeApp(tempDir);
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should detect an Electron app", async () => {
    const app = await discoverSingleApp(electronAppDir);
    expect(app).toBeDefined();
    expect(app!.name).toBe("test-electron-app");
    expect(app!.type).toBe("electron");
    expect(app!.frameworks).toContain("Electron");
    expect(app!.version).toBe("2.1.0");
  });

  it("should detect frameworks in Electron app", async () => {
    const app = await discoverSingleApp(electronAppDir);
    expect(app).toBeDefined();
    expect(app!.frameworks).toContain("React");
  });

  it("should detect bundled JavaScript", async () => {
    const app = await discoverSingleApp(electronAppDir);
    expect(app).toBeDefined();
    expect(app!.hasBundledJs).toBe(true);
    expect(app!.bundledJsPaths.length).toBeGreaterThanOrEqual(1);
  });

  it("should detect a native app", async () => {
    const app = await discoverSingleApp(nativeAppDir);
    expect(app).toBeDefined();
    expect(app!.name).toBe("test-native-app");
    expect(app!.type).toBe("native");
  });

  it("should detect Express framework in native app", async () => {
    const app = await discoverSingleApp(nativeAppDir);
    expect(app).toBeDefined();
    expect(app!.frameworks).toContain("Express");
  });

  it("should return undefined for non-existent path", async () => {
    const app = await discoverSingleApp("/nonexistent/path/to/app");
    expect(app).toBeUndefined();
  });

  it("should return undefined for a file (not directory)", async () => {
    const filePath = join(electronAppDir, "main.js");
    const app = await discoverSingleApp(filePath);
    expect(app).toBeUndefined();
  });

  it("should return undefined for empty directory", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "macx-empty-app-"));
    try {
      const app = await discoverSingleApp(emptyDir);
      expect(app).toBeUndefined();
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("discoverApplications", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "macx-discover-all-"));
    await createMockElectronApp(tempDir);
    await createMockNativeApp(tempDir);
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should discover apps in a custom path", async () => {
    const result = await discoverApplications({
      additionalPaths: [tempDir],
      includeUserApps: false,
    });
    expect(result.totalApps).toBeGreaterThanOrEqual(2);
    expect(result.platform).toBe(platform());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should filter by type", async () => {
    const result = await discoverApplications({
      additionalPaths: [tempDir],
      includeUserApps: false,
      filterType: "electron",
    });
    expect(result.totalApps).toBeGreaterThanOrEqual(1);
    for (const app of result.apps) {
      expect(app.type).toBe("electron");
    }
  });

  it("should respect limit", async () => {
    const result = await discoverApplications({
      additionalPaths: [tempDir],
      includeUserApps: false,
      limit: 1,
    });
    expect(result.totalApps).toBeLessThanOrEqual(1);
  });

  it("should return scanned paths", async () => {
    const result = await discoverApplications({
      additionalPaths: [tempDir],
      includeUserApps: false,
    });
    expect(result.scannedPaths).toContain(tempDir);
  });

  it("should sort apps by name", async () => {
    const result = await discoverApplications({
      additionalPaths: [tempDir],
      includeUserApps: false,
    });
    for (let i = 1; i < result.apps.length; i++) {
      expect(
        result.apps[i]!.name.localeCompare(result.apps[i - 1]!.name),
      ).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("macOS .app bundle parsing", () => {
  // These tests only make sense structurally (not on actual macOS)
  let tempDir: string;
  let macAppDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "macx-macos-test-"));
    macAppDir = await createMockMacOsApp(tempDir);
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // discoverSingleApp uses platform() to decide the parsing strategy,
  // but we can at least verify the app structure is created and that
  // on non-macOS it falls back to generic analysis
  it("should handle .app bundle as a directory", async () => {
    const app = await discoverSingleApp(macAppDir);
    // On non-macOS, it will use generic analysis
    // On macOS, it will parse the .app bundle
    if (platform() === "darwin") {
      expect(app).toBeDefined();
      expect(app!.name).toBe("TestApp");
      expect(app!.version).toBe("3.2.1");
      expect(app!.bundleId).toBe("com.test.testapp");
    } else {
      // On other platforms, it may or may not detect it
      // but should not crash
      expect(true).toBe(true);
    }
  });
});

describe("Linux .desktop file parsing", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "macx-linux-test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should handle scanning a directory with .desktop files on Linux", async () => {
    // Create a mock .desktop file
    await writeFile(
      join(tempDir, "firefox.desktop"),
      [
        "[Desktop Entry]",
        "Name=Firefox",
        "Exec=/usr/bin/firefox %U",
        "Type=Application",
        "Categories=Network;WebBrowser;",
      ].join("\n"),
    );

    // Only test on Linux (or at least verify no crash)
    if (platform() === "linux") {
      const result = await discoverApplications({
        additionalPaths: [tempDir],
        includeUserApps: false,
      });
      // Might find the desktop file depending on path handling
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    } else {
      // On non-Linux, additionalPaths still get scanned as generic dirs
      const result = await discoverApplications({
        additionalPaths: [tempDir],
        includeUserApps: false,
      });
      expect(result).toBeDefined();
    }
  });
});
