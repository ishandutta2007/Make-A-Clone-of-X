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
import { discoverApplications, discoverSingleApp } from "./discovery/index.js";
import {
  detectAgents,
  registerWithAgent,
  registerWithAllAgents,
  SUPPORTED_AGENTS,
  buildMcpServerEntry,
} from "./setup/index.js";

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

  // --- discover-apps command ---
  cli.command(
    "discover-apps",
    "Scan the system for installed desktop applications.",
  )
    .option("--json", "Output results as JSON.", { default: false })
    .option("--type <type>", "Filter by app type (electron, native, nw.js, web-wrapper, pwa, unknown).")
    .option("--limit <count>", "Maximum number of apps to return.")
    .option("--no-user-apps", "Skip user-specific app directories.")
    .option("--path <path>", "Additional directory to scan.")
    .action(async (options: { json: boolean; type?: string; limit?: string; userApps?: boolean; path?: string }) => {
      logger.info({ options }, "discover-apps command invoked");

      try {
        const result = await discoverApplications({
          additionalPaths: options.path ? [options.path] : undefined,
          includeUserApps: options.userApps !== false,
          filterType: options.type as "electron" | "nw.js" | "native" | undefined,
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        } else {
          process.stdout.write(`\nMACX: Desktop Application Discovery\n`);
          process.stdout.write(`${"=".repeat(40)}\n\n`);
          process.stdout.write(`Platform:      ${result.platform}\n`);
          process.stdout.write(`Scanned:       ${result.scannedPaths.length} directories\n`);
          process.stdout.write(`Apps found:    ${result.totalApps}\n`);
          process.stdout.write(`Duration:      ${result.durationMs}ms\n\n`);

          if (result.apps.length === 0) {
            process.stdout.write(`  No applications found.\n`);
          } else {
            // Group by type
            const byType = new Map<string, typeof result.apps>();
            for (const app of result.apps) {
              const group = byType.get(app.type) ?? [];
              group.push(app);
              byType.set(app.type, group);
            }

            for (const [appType, apps] of byType) {
              process.stdout.write(`${appType.toUpperCase()} (${apps.length})\n`);
              process.stdout.write(`${"-".repeat(30)}\n`);
              for (const app of apps) {
                const sizeStr = app.size > 0
                  ? ` (${(app.size / 1024 / 1024).toFixed(1)} MiB)`
                  : "";
                const versionStr = app.version ? ` v${app.version}` : "";
                const jsTag = app.hasBundledJs ? " 📦JS" : "";
                const fwTag = app.frameworks.length > 0
                  ? ` [${app.frameworks.join(", ")}]`
                  : "";
                process.stdout.write(`  • ${app.name}${versionStr}${sizeStr}${jsTag}${fwTag}\n`);
                process.stdout.write(`    ${app.path}\n`);
              }
              process.stdout.write(`\n`);
            }
          }

          if (result.errors.length > 0) {
            process.stdout.write(`Warnings (${result.errors.length})\n${"-".repeat(30)}\n`);
            for (const err of result.errors.slice(0, 10)) process.stdout.write(`  ⚠ ${err}\n`);
            if (result.errors.length > 10) {
              process.stdout.write(`  ... and ${result.errors.length - 10} more\n`);
            }
            process.stdout.write(`\n`);
          }
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        process.stderr.write(`MACX error: ${message}\n`);
        process.exitCode = 1;
      }
    });

  // --- discover-app command (single app) ---
  cli.command(
    "discover-app <path>",
    "Analyze a single application at the given path.",
  )
    .option("--json", "Output results as JSON.", { default: false })
    .action(async (path: string, options: { json: boolean }) => {
      const absolutePath = resolve(path);
      logger.info({ path: absolutePath }, "discover-app command invoked");

      try {
        const app = await discoverSingleApp(absolutePath);

        if (!app) {
          process.stderr.write(`MACX: No application detected at ${absolutePath}\n`);
          process.exitCode = 1;
          return;
        }

        if (options.json) {
          process.stdout.write(`${JSON.stringify(app, null, 2)}\n`);
        } else {
          process.stdout.write(`\nMACX: Application Info\n`);
          process.stdout.write(`${"=".repeat(40)}\n\n`);
          process.stdout.write(`Name:          ${app.name}\n`);
          process.stdout.write(`Path:          ${app.path}\n`);
          if (app.executable) process.stdout.write(`Executable:    ${app.executable}\n`);
          if (app.version) process.stdout.write(`Version:       ${app.version}\n`);
          if (app.bundleId) process.stdout.write(`Bundle ID:     ${app.bundleId}\n`);
          process.stdout.write(`Type:          ${app.type}\n`);
          process.stdout.write(`Size:          ${(app.size / 1024 / 1024).toFixed(1)} MiB\n`);

          if (app.frameworks.length > 0) {
            process.stdout.write(`\nFrameworks\n${"-".repeat(30)}\n`);
            for (const fw of app.frameworks) process.stdout.write(`  • ${fw}\n`);
          }

          if (app.hasBundledJs) {
            process.stdout.write(`\nBundled JavaScript\n${"-".repeat(30)}\n`);
            for (const p of app.bundledJsPaths) process.stdout.write(`  → ${p}\n`);
          }

          process.stdout.write(`\n`);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        process.stderr.write(`MACX error: ${message}\n`);
        process.exitCode = 1;
      }
    });

  // --- setup command (INTERACTIVE WIZARD) ---
  cli.command("setup", "Configure MACX with your agents and analysis providers.")
    .option("--agent <id>", "Register with a specific agent only (e.g., claude-desktop, cursor, gemini-cli).")
    .option("--all", "Register with all detected agents at once.", { default: false })
    .option("--list", "List all supported agents and their config paths.", { default: false })
    .option("--detect", "Detect installed agents and their registration status.", { default: false })
    .option("--dry-run", "Show what would be changed without writing files.", { default: false })
    .option("--force", "Overwrite existing MACX registration.", { default: false })
    .option("--no-backup", "Skip creating a backup of existing config files.", { default: false })
    .option("--json", "Output results as JSON.", { default: false })
    .action(async (options: {
      agent?: string;
      all: boolean;
      list: boolean;
      detect: boolean;
      dryRun: boolean;
      force: boolean;
      backup?: boolean;
      json: boolean;
    }) => {
      logger.info({ options }, "setup command invoked");

      // --- List supported agents ---
      if (options.list) {
        if (options.json) {
          process.stdout.write(`${JSON.stringify(SUPPORTED_AGENTS, null, 2)}\n`);
        } else {
          process.stdout.write(`\nMACX: Supported Agents\n`);
          process.stdout.write(`${"=".repeat(40)}\n\n`);
          for (const agent of SUPPORTED_AGENTS) {
            process.stdout.write(`  ${agent.id.padEnd(20)} ${agent.displayName}\n`);
            if (agent.docsUrl) process.stdout.write(`  ${"".padEnd(20)} ${agent.docsUrl}\n`);
          }
          process.stdout.write(`\nUse \`macx setup --detect\` to see which are installed.\n\n`);
        }
        return;
      }

      // --- Detect installed agents ---
      if (options.detect) {
        const detected = await detectAgents();
        if (options.json) {
          process.stdout.write(`${JSON.stringify(detected, null, 2)}\n`);
        } else {
          process.stdout.write(`\nMACX: Agent Detection\n`);
          process.stdout.write(`${"=".repeat(40)}\n\n`);
          for (const d of detected) {
            const status = d.macxRegistered
              ? "✅ MACX registered"
              : d.configExists
                ? "⬜ Config found (MACX not registered)"
                : "❌ No config file";
            process.stdout.write(`  ${d.agent.displayName.padEnd(30)} ${status}\n`);
            process.stdout.write(`  ${"".padEnd(30)} ${d.configPath}\n\n`);
          }
          process.stdout.write(`Use \`macx setup --all\` to register MACX with all detected agents.\n`);
          process.stdout.write(`Use \`macx setup --agent <id>\` to register with a specific agent.\n\n`);
        }
        return;
      }

      // --- Register with a specific agent ---
      if (options.agent) {
        const detected = await detectAgents();
        const target = detected.find((d) => d.agent.id === options.agent);
        if (!target) {
          process.stderr.write(
            `MACX error: Unknown agent "${options.agent}". ` +
            `Use \`macx setup --list\` to see supported agents.\n`,
          );
          process.exitCode = 1;
          return;
        }

        if (options.dryRun) {
          process.stdout.write(`\nDRY RUN: Would register MACX with ${target.agent.displayName}\n`);
          process.stdout.write(`  Config: ${target.configPath}\n`);
          process.stdout.write(`  Exists: ${target.configExists ? "yes" : "no"}\n`);
          process.stdout.write(`  Already registered: ${target.macxRegistered ? "yes" : "no"}\n\n`);
          return;
        }

        const result = await registerWithAgent(target.agent, target.configPath, {
          noBackup: options.backup === false,
          force: options.force,
        });

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        } else {
          printSetupResult(result);
        }
        return;
      }

      // --- Register with all agents ---
      if (options.all) {
        const results = await registerWithAllAgents({
          noBackup: options.backup === false,
          force: options.force,
          dryRun: options.dryRun,
        });

        if (options.json) {
          process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
        } else {
          process.stdout.write(`\nMACX: Setup Results\n`);
          process.stdout.write(`${"=".repeat(40)}\n\n`);
          for (const result of results) {
            printSetupResult(result);
          }

          const successCount = results.filter((r) => r.success).length;
          const skipCount = results.filter((r) => r.alreadyRegistered && !options.force).length;
          process.stdout.write(`\nSummary: ${successCount} registered, ${skipCount} already set up\n`);
          process.stdout.write(`Restart your agents to activate MACX.\n\n`);
        }
        return;
      }

      // --- Default: show interactive help ---
      const detected = await detectAgents();
      const withConfig = detected.filter((d) => d.configExists);
      const registered = detected.filter((d) => d.macxRegistered);

      process.stdout.write(`\nMACX Setup Wizard\n`);
      process.stdout.write(`${"=".repeat(40)}\n\n`);
      process.stdout.write(`Detected ${detected.length} supported agents, ${withConfig.length} with config files, ${registered.length} with MACX registered.\n\n`);

      if (withConfig.length === 0) {
        process.stdout.write(`No agent config files found. MACX supports:\n\n`);
        for (const agent of SUPPORTED_AGENTS) {
          process.stdout.write(`  • ${agent.displayName} (${agent.id})\n`);
        }
        process.stdout.write(`\nInstall one of these agents, then run \`macx setup\` again.\n`);
        process.stdout.write(`\nManual MCP configuration:\n`);
        const entry = buildMcpServerEntry();
        process.stdout.write(`  Add to your agent's MCP server config:\n\n`);
        process.stdout.write(`  "macx": ${JSON.stringify(entry, null, 4).replace(/\n/g, "\n  ")}\n\n`);
      } else {
        for (const d of detected) {
          if (!d.configExists) continue;
          const status = d.macxRegistered ? "✅" : "⬜";
          process.stdout.write(`  ${status} ${d.agent.displayName} (${d.agent.id})\n`);
        }
        process.stdout.write(`\nQuick commands:\n`);
        process.stdout.write(`  macx setup --all         Register MACX with all detected agents\n`);
        process.stdout.write(`  macx setup --agent <id>  Register with a specific agent\n`);
        process.stdout.write(`  macx setup --detect      Show detailed detection status\n`);
        process.stdout.write(`  macx setup --dry-run     Preview changes without writing\n\n`);
      }
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

/** Print a single setup result in human-readable format. */
function printSetupResult(result: import("./setup/types.js").SetupResult): void {
  const icon = result.success ? (result.alreadyRegistered ? "⏭️" : "✅") : "❌";
  process.stdout.write(`  ${icon} ${result.agentName}\n`);
  if (result.alreadyRegistered && result.success) {
    process.stdout.write(`    Already registered — skipped.\n`);
  } else if (result.success) {
    process.stdout.write(`    Registered in ${result.configPath}\n`);
    if (result.backupPath) {
      process.stdout.write(`    Backup: ${result.backupPath}\n`);
    }
  } else {
    process.stdout.write(`    Error: ${result.error}\n`);
  }
  process.stdout.write(`\n`);
}
