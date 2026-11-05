import type { MacxEnvironment } from "../process/snapshotEnvironment.js";

/** Parsed MACX configuration. */
export interface MacxConfig {
  readonly logLevel: string | undefined;
  readonly inputSchemaProfile: string | undefined;
  readonly outputSchemaProfile: string | undefined;
}

export type ConfigResult =
  | { readonly ok: true; readonly value: MacxConfig }
  | { readonly ok: false; readonly error: string };

/** Parse configuration from the environment snapshot. */
export const parseConfig = (environment: MacxEnvironment): ConfigResult => {
  const logLevel = environment.MACX_LOG_LEVEL;
  if (logLevel !== undefined) {
    const normalized = logLevel.toLowerCase();
    const valid = [
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
      "silent",
    ];
    if (!valid.includes(normalized)) {
      return {
        ok: false,
        error: `MACX_LOG_LEVEL "${logLevel}" is not a valid log level. Use one of: ${valid.join(", ")}`,
      };
    }
  }

  return {
    ok: true,
    value: {
      logLevel: environment.MACX_LOG_LEVEL,
      inputSchemaProfile: environment.MACX_MCP_INPUT_SCHEMA_PROFILE,
      outputSchemaProfile: environment.MACX_MCP_OUTPUT_SCHEMA_PROFILE,
    },
  };
};
