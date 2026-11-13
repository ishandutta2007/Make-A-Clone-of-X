/**
 * MACX: Make A Clone of X — CLI entrypoint.
 *
 * Simplified CLI with core commands. The full MACX CLI registers 50+ command
 * families; this minimal edition keeps the essential ones.
 */

import { Cli, z } from "incur";
import { resolve } from "node:path";

import { snapshotEnvironment } from "./process/snapshotEnvironment.js";
import { createLogger } from "./logger.js";
import { parseLogLevel } from "./config/processStart.js";
import { PRODUCT_IDENTITY } from "./identity.js";
import { PACKAGE_METADATA } from "./generatedPackageMetadata.js";
import { analyzeJavaScriptApplication } from "./javascript/index.js";

export interface CliInstance {
  serve: (
    args: readonly string[],
    options: {
      stdout?: (output: string) => void;
      exit?: (code: number) => void;
    },
  ) => Promise<void>;
}

/**
 * Build the one-shot Incur CLI without starting analysis providers at import time.
 * Analysis commands acquire and close their own sessions; bare `mcp` and
 * `--mcp` are intercepted by the executable dispatcher before this module loads.
 */
export const createCli = (
  selectedEnvironment: Readonly<Record<string, string | undefined>> = process.env,
): CliInstance => {
  const environment = snapshotEnvironment(selectedEnvironment);

  // The executable reports an invalid level before every command except doctor.
  const level =
    environment.MACX_LOG_LEVEL === undefined
      ? undefined
      : parseLogLevel(environment.MACX_LOG_LEVEL);
  const logger = createLogger(
    "cli",
    level?.ok === true ? level.value : "silent",
  );

  const cli = Cli.create(PRODUCT_IDENTITY.cliBinary, {
    version: PRODUCT_IDENTITY.packageVersion,
    description: "Make a clone of X — analyze apps from your terminal or agent.",
    sync: false,
  });

  // --- doctor command ---
  cli.command("doctor", "Check MACX readiness and provider availability.")
    .action(async () => {
      logger.info("doctor command invoked");
      const report = {
        macx: {
          version: PACKAGE_METADATA.version,
          node: process.versions.node,
          platform: process.platform,
          arch: process.arch,
        },
        providers: {
          hopper: "not configured",
          ghidra: "not configured",
          ida: "not configured",
        },
        status: "ok",
      };
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    });

  // --- version command ---
  cli.command("version", "Print MACX version information.")
    .action(async () => {
      const info = {
        name: PACKAGE_METADATA.name,
        version: PACKAGE_METADATA.version,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      };
      process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
    });

  // --- analyze-javascript-application command (REAL IMPLEMENTATION) ---
  cli.command(
    "analyze-javascript-application <path>",
    "Analyze an extracted JavaScript or Electron application directory.",
  )
    .option("--json", "Output results as JSON.", { default: false })
    .option("--source-maps", "Include source map resolution.", { default: false })
    .action(async (path: string, options: { json: boolean; sourceMaps: boolean }) => {
      const absolutePath = resolve(path);
      logger.info({ path: absolutePath, json: options.json, sourceMaps: options.sourceMaps }, "analyze-javascript-application");

      try {
        const analysis = await analyzeJavaScriptApplication(absolutePath, {
          includeSourceMaps: options.sourceMaps,
        });

        if (options.json) {
          process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
        } else {
          // Human-readable output
          process.stdout.write(`\nMACX: JavaScript Application Analysis\n`);
          process.stdout.write(`${"=".repeat(40)}\n\n`);
          process.stdout.write(`Path:         ${analysis.path}\n`);

          if (analysis.packageInfo) {
            const pkg = analysis.packageInfo as Record<string, unknown>;
            if (pkg.name) process.stdout.write(`Package:      ${pkg.name}@${pkg.version ?? "unknown"}\n`);
            if (pkg.description) process.stdout.write(`Description:  ${pkg.description}\n`);
          }

          process.stdout.write(`\nSummary\n${"-".repeat(30)}\n`);
          process.stdout.write(`  Modules:      ${analysis.summary.totalModules}\n`);
          process.stdout.write(`  Total lines:  ${analysis.summary.totalLines.toLocaleString()}\n`);
          process.stdout.write(`  Total size:   ${(analysis.summary.totalSize / 1024).toFixed(1)} KiB\n`);
          process.stdout.write(`  Entry points: ${analysis.summary.entryPoints}\n`);
          process.stdout.write(`  Import edges: ${analysis.summary.importEdges}\n`);
          if (analysis.summary.sourceMapCount > 0) {
            process.stdout.write(`  Source maps:  ${analysis.summary.sourceMapCount}\n`);
          }

          if (analysis.electronInfo) {
            process.stdout.write(`\nElectron Application\n${"-".repeat(30)}\n`);
            process.stdout.write(`  Main process:  ${analysis.electronInfo.mainProcess.length} file(s)\n`);
            for (const f of analysis.electronInfo.mainProcess) process.stdout.write(`    → ${f}\n`);
            process.stdout.write(`  Renderer:      ${analysis.electronInfo.renderer.length} file(s)\n`);
            for (const f of analysis.electronInfo.renderer) process.stdout.write(`    → ${f}\n`);
            process.stdout.write(`  Preload:       ${analysis.electronInfo.preload.length} file(s)\n`);
            for (const f of analysis.electronInfo.preload) process.stdout.write(`    → ${f}\n`);
            process.stdout.write(`  IPC modules:   ${analysis.electronInfo.ipcChannels.length} file(s)\n`);
          }

          if (analysis.entryPoints.length > 0) {
            process.stdout.write(`\nEntry Points\n${"-".repeat(30)}\n`);
            for (const ep of analysis.entryPoints) process.stdout.write(`  → ${ep}\n`);
          }

          // Show frameworks detected
          const frameworks = new Set(
            analysis.modules.map((m) => m.framework).filter(Boolean),
          );
          if (frameworks.size > 0) {
            process.stdout.write(`\nFrameworks Detected\n${"-".repeat(30)}\n`);
            for (const fw of frameworks) process.stdout.write(`  • ${fw}\n`);
          }

          // Show top package dependencies
          const packageImports = new Map<string, number>();
          for (const mod of analysis.modules) {
            for (const imp of mod.imports) {
              if (imp.type === "package") {
                const pkgName = imp.specifier.startsWith("@")
                  ? imp.specifier.split("/").slice(0, 2).join("/")
                  : imp.specifier.split("/")[0]!;
                packageImports.set(pkgName, (packageImports.get(pkgName) ?? 0) + 1);
              }
            }
          }
          if (packageImports.size > 0) {
            const sorted = [...packageImports.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
            process.stdout.write(`\nTop Package Dependencies\n${"-".repeat(30)}\n`);
            for (const [pkg, count] of sorted) {
              process.stdout.write(`  ${pkg} (${count} import${count > 1 ? "s" : ""})\n`);
            }
          }

          if (analysis.errors.length > 0) {
            process.stdout.write(`\nWarnings (${analysis.errors.length})\n${"-".repeat(30)}\n`);
            for (const err of analysis.errors.slice(0, 10)) process.stdout.write(`  ⚠ ${err}\n`);
            if (analysis.errors.length > 10) {
              process.stdout.write(`  ... and ${analysis.errors.length - 10} more\n`);
            }
          }

          process.stdout.write(`\n`);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        process.stderr.write(`MACX error: ${message}\n`);
        process.exitCode = 1;
      }
    });

  // --- setup command ---
  cli.command("setup", "Configure MACX with your agents and analysis providers.")
    .action(async () => {
      logger.info("setup command invoked");
      process.stdout.write(
        `MACX Setup\n` +
        `==========\n\n` +
        `MACX simplified edition — setup wizard is available in the complete MACX build.\n` +
        `\n` +
        `Manual MCP configuration:\n` +
        `  Add the following to your agent's MCP server configuration:\n\n` +
        `  "macx": {\n` +
        `    "command": "npx",\n` +
        `    "args": ["-y", "${PACKAGE_METADATA.name}@${PACKAGE_METADATA.version}", "mcp"]\n` +
        `  }\n\n` +
        `Then restart your agent.\n`,
      );
    });

  // --- update command ---
  cli.command("update", "Update MACX to the latest version.")
    .action(async () => {
      logger.info("update command invoked");
      process.stdout.write(
        `To update MACX, run:\n\n` +
        `  npm install --global ${PACKAGE_METADATA.name}@latest\n\n` +
        `Then run \`macx setup\` to refresh agent registrations.\n`,
      );
    });

  return cli as unknown as CliInstance;
};
