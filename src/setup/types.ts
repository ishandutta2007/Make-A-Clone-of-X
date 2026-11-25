/**
 * Type definitions for the MACX Interactive Setup Wizard.
 */

/** A supported AI agent/client. */
export interface AgentDefinition {
  /** Unique identifier for the agent. */
  readonly id: string;
  /** Display name. */
  readonly displayName: string;
  /** Where the MCP config file lives on each platform. */
  readonly configPaths: {
    readonly darwin?: string;
    readonly win32?: string;
    readonly linux?: string;
  };
  /** JSON key path where MCP servers are registered. */
  readonly mcpServersKey: string;
  /** Whether the config is JSON or JSONC (JSON with comments). */
  readonly configFormat: "json" | "jsonc";
  /** Optional URL for documentation. */
  readonly docsUrl?: string;
}

/** The MACX MCP server registration block. */
export interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
}

/** Result of a setup operation for one agent. */
export interface SetupResult {
  /** Agent that was set up. */
  readonly agentId: string;
  /** Agent display name. */
  readonly agentName: string;
  /** Path to the config file. */
  readonly configPath: string;
  /** Whether the config file existed before setup. */
  readonly existed: boolean;
  /** Path to the backup file, if one was created. */
  readonly backupPath: string | undefined;
  /** Whether the setup was successful. */
  readonly success: boolean;
  /** Whether MACX was already registered. */
  readonly alreadyRegistered: boolean;
  /** Error message if setup failed. */
  readonly error: string | undefined;
}

/** Result of an agent detection scan. */
export interface DetectedAgent {
  /** Agent definition. */
  readonly agent: AgentDefinition;
  /** Resolved config file path for the current platform. */
  readonly configPath: string;
  /** Whether the config file already exists. */
  readonly configExists: boolean;
  /** Whether MACX is already registered in the config. */
  readonly macxRegistered: boolean;
}
