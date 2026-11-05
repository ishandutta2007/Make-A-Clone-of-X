/**
 * MACX: Make A Clone of X — CLI entrypoint.
 *
 * Simplified CLI with core commands. The full MACX CLI registers 50+ command
 * families; this minimal edition keeps the essential ones.
 */

import { Cli, z } from "incur";

import { snapshotEnvironment } from "./process/snapshotEnvironment.js";
import { createLogger } from "./logger.js";
import { parseLogLevel } from "./config/processStart.js";
import { PRODUCT_IDENTITY } from "./identity.js";
import { PACKAGE_METADATA } from "./generatedPackageMetadata.js";

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

  // --- analyze-javascript-application command ---
  cli.command(
    "analyze-javascript-application <path>",
    "Analyze an extracted JavaScript or Electron application directory.",
  )
    .option("--json", "Output results as JSON.", { default: false })
    .action(async (path: string, options: { json: boolean }) => {
      logger.info({ path, json: options.json }, "analyze-javascript-application");
      const result = {
        tool: "analyze-javascript-application",
        path,
        note: "MACX simplified edition — full JavaScript analysis requires the complete MACX build.",
        status: "stub",
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(`MACX: Analyzing JavaScript application at ${path}\n`);
        process.stdout.write(`Status: stub (simplified edition)\n`);
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
