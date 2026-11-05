/** Log level for MACX logger configuration. */
export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "silent";

const VALID_LOG_LEVELS: readonly LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
];

/** Parse a log level string into a validated LogLevel. */
export const parseLogLevel = (
  value: string,
): { readonly ok: true; readonly value: LogLevel } | { readonly ok: false; readonly error: string } => {
  const normalized = value.toLowerCase() as LogLevel;
  if (VALID_LOG_LEVELS.includes(normalized)) {
    return { ok: true, value: normalized };
  }
  return {
    ok: false,
    error: `Invalid log level: "${value}". Valid levels: ${VALID_LOG_LEVELS.join(", ")}`,
  };
};
