/**
 * Process shutdown helpers for the MACX MCP server and CLI.
 */

type ShutdownCallback = (exitStatus: number) => void;

/** Register a process shutdown handler on SIGINT and SIGTERM. */
export const registerProcessShutdown = (
  request: () => void,
): (() => void) => {
  const handler = () => {
    request();
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return () => {
    process.removeListener("SIGINT", handler);
    process.removeListener("SIGTERM", handler);
  };
};

/** Register signal-based shutdown. */
export const registerSignalShutdown = (
  callback: ShutdownCallback,
): (() => void) => {
  const handler = () => callback(0);
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return () => {
    process.removeListener("SIGINT", handler);
    process.removeListener("SIGTERM", handler);
  };
};

export interface SignalLatch {
  release: () => number | undefined;
}

/** Create a signal latch that captures an early signal for deferred handling. */
export const latchSignalShutdown = (): SignalLatch => {
  let pending: number | undefined;
  const handler = () => {
    pending = 0;
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return {
    release: () => {
      process.removeListener("SIGINT", handler);
      process.removeListener("SIGTERM", handler);
      const result = pending;
      pending = undefined;
      return result;
    },
  };
};

export interface ExitStatus {
  set: (code: number) => void;
  signal: (status: number) => void;
}

/** Create an exit status tracker. */
export const createExitStatus = (
  setExitCode: (code: number) => void,
): ExitStatus => ({
  set: setExitCode,
  signal: (status) => setExitCode(status),
});
