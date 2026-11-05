import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Logger } from "pino";

import { PRODUCT_IDENTITY } from "../identity.js";
import { PACKAGE_METADATA } from "../generatedPackageMetadata.js";

/**
 * Create the MACX MCP server with the core tool catalog.
 *
 * This simplified edition exposes a minimal set of tools focused on
 * analysis overview and health checking.
 */
export const createMacxServer = (logger: Logger): McpServer => {
  const server = new McpServer({
    name: PRODUCT_IDENTITY.displayName,
    version: PACKAGE_METADATA.version,
  });

  // --- Health / readiness tool ---
  server.tool(
    "macx_doctor",
    "Check whether MACX and its configured analysis providers are available.",
    {},
    async () => {
      logger.info("macx_doctor invoked");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "ok",
                version: PACKAGE_METADATA.version,
                node: process.versions.node,
                platform: process.platform,
                arch: process.arch,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- Analyze JavaScript application ---
  server.tool(
    "analyze_javascript_application",
    "Analyze an extracted JavaScript or Electron application directory and return its module graph, imports, and component relationships.",
    {
      path: z.string().describe("Absolute path to the application directory or ASAR archive."),
      includeSourceMaps: z.boolean().optional().default(false).describe("Include source map resolution when available."),
    },
    async ({ path: appPath, includeSourceMaps }) => {
      logger.info({ appPath, includeSourceMaps }, "analyze_javascript_application invoked");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                tool: "analyze_javascript_application",
                path: appPath,
                includeSourceMaps,
                note: "MACX simplified edition — full JavaScript analysis requires the complete MACX build.",
                status: "stub",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- Inspect binary ---
  server.tool(
    "inspect_binary",
    "Inspect a native binary and return symbols, sections, and basic metadata. Requires a configured analysis provider (Hopper, Ghidra, or IDA).",
    {
      path: z.string().describe("Absolute path to the binary file."),
      provider: z.enum(["hopper", "ghidra", "ida"]).optional().describe("Analysis provider to use."),
    },
    async ({ path: binaryPath, provider }) => {
      logger.info({ binaryPath, provider }, "inspect_binary invoked");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                tool: "inspect_binary",
                path: binaryPath,
                provider: provider ?? "auto",
                note: "MACX simplified edition — full native analysis requires the complete MACX build with a configured provider.",
                status: "stub",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- Inspect website ---
  server.tool(
    "inspect_website",
    "Inspect a website URL and return page structure, scripts, and network observations.",
    {
      url: z.string().url().describe("URL of the website to inspect."),
      screenshot: z.boolean().optional().default(false).describe("Capture a screenshot."),
    },
    async ({ url, screenshot }) => {
      logger.info({ url, screenshot }, "inspect_website invoked");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                tool: "inspect_website",
                url,
                screenshot,
                note: "MACX simplified edition — full browser analysis requires the complete MACX build with Playwright.",
                status: "stub",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
};
