import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Logger } from "pino";

import { PRODUCT_IDENTITY } from "../identity.js";
import { PACKAGE_METADATA } from "../generatedPackageMetadata.js";
import { analyzeJavaScriptApplication } from "../javascript/index.js";

/**
 * Create the MACX MCP server with the core tool catalog.
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

  // --- Analyze JavaScript application (REAL IMPLEMENTATION) ---
  server.tool(
    "analyze_javascript_application",
    "Analyze an extracted JavaScript or Electron application directory and return its module graph, imports, entry points, Electron IPC boundaries, and framework detection.",
    {
      path: z.string().describe("Absolute path to the application directory."),
      includeSourceMaps: z.boolean().optional().default(false).describe("Include source map resolution when available."),
    },
    async ({ path: appPath, includeSourceMaps }) => {
      logger.info({ appPath, includeSourceMaps }, "analyze_javascript_application invoked");
      try {
        const analysis = await analyzeJavaScriptApplication(appPath, {
          includeSourceMaps,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(analysis, null, 2),
            },
          ],
        };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        logger.error({ appPath, error: message }, "analyze_javascript_application failed");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  tool: "analyze_javascript_application",
                  path: appPath,
                  error: message,
                  status: "error",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // --- Inspect binary (stub — requires external provider) ---
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
                note: "Native binary analysis requires a configured provider (Hopper, Ghidra, or IDA). Run `macx doctor` to check provider availability.",
                status: "not_configured",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- Inspect website (stub — requires Playwright) ---
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
                note: "Website analysis requires Playwright. Install with `npx playwright install chromium`.",
                status: "not_configured",
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
