import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { analyzeJavaScriptApplication } from "../../src/javascript/analyzeApplication.js";

/** Create a temporary directory with test fixtures. */
async function createFixtureDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "macx-test-"));

  // index.ts — entry point with ES imports and exports
  await writeFile(
    join(root, "index.ts"),
    [
      'import { helper } from "./utils.js";',
      'import express from "express";',
      "",
      "export const main = () => helper();",
      "export default main;",
    ].join("\n"),
  );

  // utils.ts — named exports
  await writeFile(
    join(root, "utils.ts"),
    [
      "export function helper() { return 42; }",
      "export const VERSION = '1.0.0';",
    ].join("\n"),
  );

  // dynamic.js — dynamic import
  await writeFile(
    join(root, "dynamic.js"),
    [
      'const mod = await import("./utils.js");',
      'const fs = require("fs");',
      "module.exports = mod;",
    ].join("\n"),
  );

  // react-component.tsx — React framework detection
  await writeFile(
    join(root, "component.tsx"),
    [
      'import React from "react";',
      "export const App = () => <div>Hello</div>;",
      "export default App;",
    ].join("\n"),
  );

  // package.json
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "test-app",
        version: "1.0.0",
        main: "index.ts",
        dependencies: { express: "^4.18.0" },
      },
      null,
      2,
    ),
  );

  // Nested directory — src/lib/deep.js
  await mkdir(join(root, "src", "lib"), { recursive: true });
  await writeFile(
    join(root, "src", "lib", "deep.js"),
    ['import { helper } from "../../utils.js";', "export const deep = helper;"].join("\n"),
  );

  // node_modules directory (should be skipped)
  await mkdir(join(root, "node_modules", "express"), { recursive: true });
  await writeFile(
    join(root, "node_modules", "express", "index.js"),
    "module.exports = {};",
  );

  // .git directory (should be skipped)
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, ".git", "config.js"), "// should be skipped");

  // Source map file for index.ts
  await writeFile(join(root, "index.ts.map"), "{}");

  return root;
}

/** Create an Electron-like fixture directory. */
async function createElectronFixtureDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "macx-electron-test-"));

  // main.js — Electron main process
  await writeFile(
    join(root, "main.js"),
    [
      'const { app, BrowserWindow } = require("electron");',
      "",
      "app.on('ready', () => {",
      "  const win = new BrowserWindow({",
      '    webPreferences: { preload: __dirname + "/preload.js" }',
      "  });",
      "  win.loadFile('index.html');",
      "});",
    ].join("\n"),
  );

  // preload.js — Electron preload script
  await writeFile(
    join(root, "preload.js"),
    [
      'const { contextBridge, ipcRenderer } = require("electron");',
      "",
      "contextBridge.exposeInMainWorld('api', {",
      "  send: (channel, data) => ipcRenderer.send(channel, data),",
      "  on: (channel, callback) => ipcRenderer.on(channel, callback),",
      "});",
    ].join("\n"),
  );

  // renderer.js — Electron renderer
  await writeFile(
    join(root, "renderer.js"),
    [
      'const { ipcRenderer } = require("electron");',
      "",
      "ipcRenderer.send('message', { type: 'hello' });",
    ].join("\n"),
  );

  // package.json with electron dep
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "test-electron-app",
        version: "1.0.0",
        main: "main.js",
        devDependencies: { electron: "^28.0.0" },
      },
      null,
      2,
    ),
  );

  return root;
}

describe("analyzeJavaScriptApplication", () => {
  let fixtureDir: string;
  let electronDir: string;

  beforeAll(async () => {
    fixtureDir = await createFixtureDir();
    electronDir = await createElectronFixtureDir();
  });

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
    await rm(electronDir, { recursive: true, force: true });
  });

  // ─── Basic Analysis ────────────────────────────────────────────

  it("should discover all JS/TS modules", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    // Should find: index.ts, utils.ts, dynamic.js, component.tsx, src/lib/deep.js = 5 modules
    expect(result.summary.totalModules).toBe(5);
  });

  it("should calculate correct total lines", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    expect(result.summary.totalLines).toBeGreaterThan(0);
  });

  it("should return the correct path", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    expect(result.path).toBe(fixtureDir);
  });

  // ─── Import Extraction ─────────────────────────────────────────

  it("should extract ES imports", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const indexModule = result.modules.find((m) => m.path === "index.ts");
    expect(indexModule).toBeDefined();
    expect(indexModule!.imports.length).toBeGreaterThanOrEqual(2);

    const relativeImport = indexModule!.imports.find((i) => i.specifier === "./utils.js");
    expect(relativeImport).toBeDefined();
    expect(relativeImport!.type).toBe("relative");
    expect(relativeImport!.isDynamic).toBe(false);

    const packageImport = indexModule!.imports.find((i) => i.specifier === "express");
    expect(packageImport).toBeDefined();
    expect(packageImport!.type).toBe("package");
  });

  it("should extract dynamic imports", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const dynModule = result.modules.find((m) => m.path === "dynamic.js");
    expect(dynModule).toBeDefined();

    const dynamicImport = dynModule!.imports.find((i) => i.isDynamic);
    expect(dynamicImport).toBeDefined();
    expect(dynamicImport!.specifier).toBe("./utils.js");
  });

  it("should extract CommonJS requires", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const dynModule = result.modules.find((m) => m.path === "dynamic.js");
    expect(dynModule).toBeDefined();

    const fsImport = dynModule!.imports.find((i) => i.specifier === "fs");
    expect(fsImport).toBeDefined();
    expect(fsImport!.type).toBe("package");
  });

  // ─── Export Extraction ─────────────────────────────────────────

  it("should extract named exports", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const utilsModule = result.modules.find((m) => m.path === "utils.ts");
    expect(utilsModule).toBeDefined();
    expect(utilsModule!.exports).toContain("helper");
    expect(utilsModule!.exports).toContain("VERSION");
  });

  it("should extract default exports", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const indexModule = result.modules.find((m) => m.path === "index.ts");
    expect(indexModule).toBeDefined();
    expect(indexModule!.exports).toContain("default");
  });

  it("should extract CJS module.exports", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const dynModule = result.modules.find((m) => m.path === "dynamic.js");
    expect(dynModule).toBeDefined();
    expect(dynModule!.exports).toContain("default (CJS)");
  });

  // ─── Framework Detection ───────────────────────────────────────

  it("should detect React framework", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const component = result.modules.find((m) => m.path === "component.tsx");
    expect(component).toBeDefined();
    expect(component!.framework).toBe("react");
  });

  it("should detect Express framework", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const indexModule = result.modules.find((m) => m.path === "index.ts");
    expect(indexModule).toBeDefined();
    expect(indexModule!.framework).toBe("express");
  });

  // ─── Skip Directories ─────────────────────────────────────────

  it("should skip node_modules", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const inNodeModules = result.modules.find((m) =>
      m.path.includes("node_modules"),
    );
    expect(inNodeModules).toBeUndefined();
  });

  it("should skip .git directory", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const inGit = result.modules.find((m) => m.path.includes(".git"));
    expect(inGit).toBeUndefined();
  });

  // ─── Nested Directories ────────────────────────────────────────

  it("should discover modules in nested directories", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    const deepModule = result.modules.find((m) =>
      m.path.replace(/\\/g, "/").includes("src/lib/deep.js"),
    );
    expect(deepModule).toBeDefined();
    expect(deepModule!.imports.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Import Graph ─────────────────────────────────────────────

  it("should build import graph edges", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    expect(result.importGraph.length).toBeGreaterThan(0);
    expect(result.summary.importEdges).toBe(result.importGraph.length);
  });

  it("should have correct edge structure", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    for (const edge of result.importGraph) {
      expect(edge).toHaveProperty("from");
      expect(edge).toHaveProperty("to");
      expect(edge).toHaveProperty("isDynamic");
    }
  });

  // ─── Entry Points ─────────────────────────────────────────────

  it("should detect entry points from package.json main", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    expect(result.entryPoints).toContain("index.ts");
  });

  // ─── Source Maps ───────────────────────────────────────────────

  it("should detect source map files when includeSourceMaps is true", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir, {
      includeSourceMaps: true,
    });
    const indexModule = result.modules.find((m) => m.path === "index.ts");
    expect(indexModule).toBeDefined();
    expect(indexModule!.hasSourceMap).toBe(true);
    expect(result.summary.sourceMapCount).toBeGreaterThanOrEqual(1);
  });

  it("should not count source maps when includeSourceMaps is false", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir, {
      includeSourceMaps: false,
    });
    expect(result.summary.sourceMapCount).toBe(0);
  });

  // ─── Package Info ──────────────────────────────────────────────

  it("should read package.json", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    expect(result.packageInfo).toBeDefined();
    expect(result.packageInfo!.name).toBe("test-app");
    expect(result.packageInfo!.version).toBe("1.0.0");
  });

  // ─── Non-Electron App ─────────────────────────────────────────

  it("should return undefined electronInfo for non-Electron apps", async () => {
    const result = await analyzeJavaScriptApplication(fixtureDir);
    expect(result.electronInfo).toBeUndefined();
  });

  // ─── Electron Detection ────────────────────────────────────────

  it("should detect Electron application", async () => {
    const result = await analyzeJavaScriptApplication(electronDir);
    expect(result.electronInfo).toBeDefined();
    expect(result.electronInfo!.isElectron).toBe(true);
  });

  it("should detect Electron main process modules", async () => {
    const result = await analyzeJavaScriptApplication(electronDir);
    expect(result.electronInfo).toBeDefined();
    expect(result.electronInfo!.mainProcess.length).toBeGreaterThanOrEqual(1);
    expect(result.electronInfo!.mainProcess).toContain("main.js");
  });

  it("should detect Electron preload scripts", async () => {
    const result = await analyzeJavaScriptApplication(electronDir);
    expect(result.electronInfo).toBeDefined();
    expect(result.electronInfo!.preload.length).toBeGreaterThanOrEqual(1);
    expect(result.electronInfo!.preload).toContain("preload.js");
  });

  it("should detect Electron renderer modules", async () => {
    const result = await analyzeJavaScriptApplication(electronDir);
    expect(result.electronInfo).toBeDefined();
    expect(result.electronInfo!.renderer.length).toBeGreaterThanOrEqual(1);
    expect(result.electronInfo!.renderer).toContain("renderer.js");
  });

  it("should detect IPC usage", async () => {
    const result = await analyzeJavaScriptApplication(electronDir);
    expect(result.electronInfo).toBeDefined();
    expect(result.electronInfo!.ipcChannels.length).toBeGreaterThanOrEqual(2);
  });

  // ─── Error Handling ────────────────────────────────────────────

  it("should throw on non-existent path", async () => {
    await expect(
      analyzeJavaScriptApplication("/nonexistent/path/to/app"),
    ).rejects.toThrow();
  });

  it("should throw when path is a file, not a directory", async () => {
    const filePath = join(fixtureDir, "index.ts");
    await expect(analyzeJavaScriptApplication(filePath)).rejects.toThrow(
      "not a directory",
    );
  });

  // ─── Empty Directory ──────────────────────────────────────────

  it("should handle empty directory gracefully", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "macx-empty-"));
    try {
      const result = await analyzeJavaScriptApplication(emptyDir);
      expect(result.summary.totalModules).toBe(0);
      expect(result.modules).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  // ─── No package.json ──────────────────────────────────────────

  it("should handle missing package.json gracefully", async () => {
    const noPkgDir = await mkdtemp(join(tmpdir(), "macx-nopkg-"));
    await writeFile(join(noPkgDir, "app.js"), "console.log('hello');");
    try {
      const result = await analyzeJavaScriptApplication(noPkgDir);
      expect(result.packageInfo).toBeUndefined();
      expect(result.summary.totalModules).toBe(1);
    } finally {
      await rm(noPkgDir, { recursive: true, force: true });
    }
  });
});
