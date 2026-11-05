/**
 * Snapshot of MACX-relevant environment variables.
 * All properties are read once during process startup.
 */
export interface MacxEnvironment {
  readonly MACX_LOG_LEVEL?: string;
  readonly MACX_MCP_INPUT_SCHEMA_PROFILE?: string;
  readonly MACX_MCP_OUTPUT_SCHEMA_PROFILE?: string;
  readonly MACX_MCP_TOOL_FAMILIES?: string;
  readonly MACX_PACKAGE_VERSION?: string;
  readonly HOME?: string;
  readonly USERPROFILE?: string;
  readonly XDG_CACHE_HOME?: string;
  readonly [key: string]: string | undefined;
}

/**
 * Snapshot the process environment into a read-only record.
 * Values are captured once so later mutations do not affect resolved config.
 */
export const snapshotEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): MacxEnvironment => ({ ...env });
