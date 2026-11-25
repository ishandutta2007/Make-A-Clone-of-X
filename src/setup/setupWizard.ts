/**
 * MACX Interactive Setup Wizard
 *
 * Detects installed AI agents/clients, locates their MCP config files,
 * and registers the MACX MCP server with backup and validation.
 *
 * Supports: Claude Code (claude_desktop_config), Cursor, Windsurf,
 * VS Code (Copilot), Gemini CLI, Codex CLI, and custom paths.
 *
 * Uses only Node.js built-ins — no external dependencies required.
 */

import { readFile, writeFile, copyFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir, platform } from "node:os";

import type {
  AgentDefinition,
  McpServerEntry,
  SetupResult,
  DetectedAgent,
} from "./types.js";

import { PACKAGE_METADATA } from "../generatedPackageMetadata.js";

// ─── Agent Registry ────────────────────────────────────────────────

/** All supported agents and their config file locations. */
export const SUPPORTED_AGENTS: AgentDefinition[] = [
  {
    id: "claude-desktop",
    displayName: "Claude Desktop",
    configPaths: {
      darwin: "~/Library/Application Support/Claude/claude_desktop_config.json",
      win32: "%APPDATA%/Claude/claude_desktop_config.json",
      linux: "~/.config/Claude/claude_desktop_config.json",
    },
    mcpServersKey: "mcpServers",
    configFormat: "json",
    docsUrl: "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/mcp",
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    configPaths: {
      darwin: "~/.claude.json",
      win32: "~/.claude.json",
      linux: "~/.claude.json",
    },
    mcpServersKey: "mcpServers",
    configFormat: "json",
  },
  {
    id: "cursor",
    displayName: "Cursor",
    configPaths: {
      darwin: "~/.cursor/mcp.json",
      win32: "~/.cursor/mcp.json",
      linux: "~/.cursor/mcp.json",
    },
    mcpServersKey: "mcpServers",
    configFormat: "json",
    docsUrl: "https://docs.cursor.com/context/model-context-protocol",
  },
  {
    id: "windsurf",
    displayName: "Windsurf",
    configPaths: {
      darwin: "~/.codeium/windsurf/mcp_config.json",
      win32: "~/.codeium/windsurf/mcp_config.json",
      linux: "~/.codeium/windsurf/mcp_config.json",
    },
    mcpServersKey: "mcpServers",
    configFormat: "json",
    docsUrl: "https://docs.windsurf.com/windsurf/mcp",
  },
  {
    id: "vscode-copilot",
    displayName: "VS Code (GitHub Copilot)",
    configPaths: {
      darwin: "~/Library/Application Support/Code/User/settings.json",
      win32: "%APPDATA%/Code/User/settings.json",
      linux: "~/.config/Code/User/settings.json",
    },
    mcpServersKey: "github.copilot.chat.mcpServers",
    configFormat: "jsonc",
    docsUrl: "https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI (Antigravity)",
    configPaths: {
      darwin: "~/.gemini/settings.json",
      win32: "~/.gemini/settings.json",
      linux: "~/.gemini/settings.json",
    },
    mcpServersKey: "mcpServers",
    configFormat: "json",
  },
  {
    id: "codex-cli",
    displayName: "OpenAI Codex CLI",
    configPaths: {
      darwin: "~/.codex/config.json",
      win32: "~/.codex/config.json",
      linux: "~/.codex/config.json",
    },
    mcpServersKey: "mcpServers",
    configFormat: "json",
  },
  {
    id: "zed",
    displayName: "Zed",
    configPaths: {
      darwin: "~/.config/zed/settings.json",
      win32: "%APPDATA%/Zed/settings.json",
      linux: "~/.config/zed/settings.json",
    },
    mcpServersKey: "context_servers",
    configFormat: "jsonc",
    docsUrl: "https://zed.dev/docs/assistant/model-context-protocol",
  },
];

// ─── Path Resolution ───────────────────────────────────────────────

/**
 * Resolve a config path template to an absolute path.
 * Replaces ~ with home directory and %VAR% with env vars.
 */
export function resolveConfigPath(
  template: string,
  home: string = homedir(),
): string {
  let resolved = template;

  // Expand ~ to home directory
  if (resolved.startsWith("~/") || resolved.startsWith("~\\")) {
    resolved = join(home, resolved.slice(2));
  }

  // Expand %VAR% environment variables (Windows style)
  resolved = resolved.replace(/%([^%]+)%/g, (_, name: string) => {
    return process.env[name] ?? `%${name}%`;
  });

  return resolved;
}

/**
 * Get the config path for an agent on the current platform.
 */
export function getAgentConfigPath(
  agent: AgentDefinition,
  plat: NodeJS.Platform = platform(),
  home: string = homedir(),
): string | undefined {
  const template = agent.configPaths[plat as "darwin" | "win32" | "linux"];
  if (!template) return undefined;
  return resolveConfigPath(template, home);
}

// ─── Agent Detection ───────────────────────────────────────────────

/**
 * Detect which agents have config files on this system.
 */
export async function detectAgents(
  plat: NodeJS.Platform = platform(),
  home: string = homedir(),
): Promise<DetectedAgent[]> {
  const detected: DetectedAgent[] = [];

  for (const agent of SUPPORTED_AGENTS) {
    const configPath = getAgentConfigPath(agent, plat, home);
    if (!configPath) continue;

    let configExists = false;
    let macxRegistered = false;

    try {
      await access(configPath);
      configExists = true;

      // Check if MACX is already registered
      const content = await readFile(configPath, "utf-8");
      const config = parseJsonSafe(content);
      if (config) {
        const servers = getNestedValue(config, agent.mcpServersKey);
        if (servers && typeof servers === "object" && servers !== null) {
          macxRegistered = "macx" in (servers as Record<string, unknown>);
        }
      }
    } catch {
      // Config doesn't exist or can't be read
    }

    detected.push({
      agent,
      configPath,
      configExists,
      macxRegistered,
    });
  }

  return detected;
}

// ─── Registration ──────────────────────────────────────────────────

/**
 * Build the MACX MCP server entry for config registration.
 */
export function buildMcpServerEntry(): McpServerEntry {
  return {
    command: "npx",
    args: ["-y", `${PACKAGE_METADATA.name}@latest`, "mcp"],
  };
}

/**
 * Register MACX with a specific agent's config file.
 * Creates the config file if it doesn't exist.
 * Backs up existing config before modifying.
 */
export async function registerWithAgent(
  agent: AgentDefinition,
  configPath: string,
  options: {
    /** Skip creating a backup. */
    noBackup?: boolean;
    /** Force overwrite even if already registered. */
    force?: boolean;
    /** Dry run — don't write files. */
    dryRun?: boolean;
  } = {},
): Promise<SetupResult> {
  const serverEntry = buildMcpServerEntry();
  let existed = false;
  let backupPath: string | undefined;
  let alreadyRegistered = false;

  try {
    // Read existing config or create empty one
    let config: Record<string, unknown> = {};

    try {
      await access(configPath);
      existed = true;
      const content = await readFile(configPath, "utf-8");
      const parsed = parseJsonSafe(content);
      if (parsed && typeof parsed === "object") {
        config = parsed as Record<string, unknown>;
      }
    } catch {
      // File doesn't exist — will create new
    }

    // Check if already registered
    const servers = getNestedValue(config, agent.mcpServersKey) as
      | Record<string, unknown>
      | undefined;
    if (servers && "macx" in servers) {
      alreadyRegistered = true;
      if (!options.force) {
        return {
          agentId: agent.id,
          agentName: agent.displayName,
          configPath,
          existed,
          backupPath: undefined,
          success: true,
          alreadyRegistered: true,
          error: undefined,
        };
      }
    }

    if (options.dryRun) {
      return {
        agentId: agent.id,
        agentName: agent.displayName,
        configPath,
        existed,
        backupPath: undefined,
        success: true,
        alreadyRegistered,
        error: undefined,
      };
    }

    // Backup existing config
    if (existed && !options.noBackup) {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      backupPath = `${configPath}.macx-backup-${timestamp}`;
      await copyFile(configPath, backupPath);
    }

    // Set the macx server entry
    setNestedValue(config, agent.mcpServersKey, {
      ...(servers ?? {}),
      macx: serverEntry,
    });

    // Ensure parent directory exists
    await mkdir(dirname(configPath), { recursive: true });

    // Write the config
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    return {
      agentId: agent.id,
      agentName: agent.displayName,
      configPath,
      existed,
      backupPath,
      success: true,
      alreadyRegistered,
      error: undefined,
    };
  } catch (cause) {
    return {
      agentId: agent.id,
      agentName: agent.displayName,
      configPath,
      existed,
      backupPath,
      success: false,
      alreadyRegistered,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/**
 * Register MACX with all detected agents.
 */
export async function registerWithAllAgents(
  options: {
    noBackup?: boolean;
    force?: boolean;
    dryRun?: boolean;
    agentIds?: string[];
  } = {},
): Promise<SetupResult[]> {
  const detected = await detectAgents();
  const results: SetupResult[] = [];

  for (const d of detected) {
    // Filter by agent IDs if specified
    if (options.agentIds && !options.agentIds.includes(d.agent.id)) continue;

    const result = await registerWithAgent(d.agent, d.configPath, options);
    results.push(result);
  }

  return results;
}

// ─── JSON Helpers ──────────────────────────────────────────────────

/** Safely parse JSON, stripping JSONC comments first. */
function parseJsonSafe(content: string): unknown | undefined {
  try {
    // Strip single-line comments (// ...)
    const stripped = content.replace(/\/\/.*$/gm, "");
    // Strip block comments (/* ... */)
    const stripped2 = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
    return JSON.parse(stripped2);
  } catch {
    return undefined;
  }
}

/** Get a nested value from an object using dot-separated key path. */
function getNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
): unknown {
  const keys = keyPath.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Set a nested value in an object using dot-separated key path. */
function setNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown,
): void {
  const keys = keyPath.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}
