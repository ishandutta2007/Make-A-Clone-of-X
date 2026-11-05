#!/usr/bin/env node

/**
 * MACX: Make A Clone of X — MCP server entrypoint.
 *
 * This is the main runtime entry for the MCP server. It creates the MACX
 * MCP server, connects it to stdio transport, and handles graceful shutdown.
 */

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { snapshotEnvironment } from "./process/snapshotEnvironment.js";
import { parseConfig } from "./config/parseConfig.js";
import { parseLogLevel } from "./config/processStart.js";
import { projectAnalysisError } from "./domain/analysisErrorProjection.js";
import { createLogger } from "./logger.js";
import { createMacxServer } from "./server/createServer.js";
import { registerProcessShutdown } from "./main/processShutdown.js";
import { SERVER_START_FAILED } from "./main/messages.js";

/**
 * Start the MACX MCP server over stdio.
 * Returns the exit code (0 for success, 1 for failure).
 */
export const run = async (): Promise<number> => {
  const environment = snapshotEnvironment(process.env);
  const config = parseConfig(environment);

  if (!config.ok) {
    process.stderr.write(
      `${projectAnalysisError(config.error).message}\n`,
    );
    return 1;
  }

  const logLevel = config.value.logLevel;
  const parsedLevel =
    logLevel !== undefined ? parseLogLevel(logLevel) : undefined;
  const level =
    parsedLevel !== undefined && parsedLevel.ok ? parsedLevel.value : "info";

  const logger = createLogger("mcp", level);
  const server = createMacxServer(logger);

  const transport = new StdioServerTransport();
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    logger.info("MACX MCP server shutting down");
  };

  registerProcessShutdown(cleanup);

  logger.info(
    { version: (await import("./generatedPackageMetadata.js")).PACKAGE_METADATA.version },
    "MACX MCP server starting",
  );

  await server.connect(transport);

  return 0;
};

/** Run the executable boundary without exposing an unexpected startup cause. */
export const runEntrypoint = async (
  start: () => Promise<number> = () => run(),
  writeStderr: (text: string) => void = (text) => process.stderr.write(text),
  setExitCode: (code: number) => void = (code) => {
    process.exitCode = code;
  },
): Promise<void> => {
  try {
    setExitCode(await start());
  } catch (cause: unknown) {
    // Intentionally redact the startup cause from caller-visible output;
    // unexpected failures must not leak internal details.
    void cause;
    writeStderr(`${SERVER_START_FAILED}\n`);
    setExitCode(1);
  }
};

// Direct entrypoint detection: run if invoked directly.
const entryPath = process.argv[1];
if (entryPath !== undefined) {
  const { pathToFileURL } = await import("node:url");
  const { realpathSync } = await import("node:fs");
  try {
    if (pathToFileURL(realpathSync(entryPath)).href === import.meta.url) {
      void runEntrypoint();
    }
  } catch {
    // Not a direct entrypoint — skip.
  }
}
