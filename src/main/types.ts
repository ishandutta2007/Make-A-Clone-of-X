/** Runtime dependencies injected into the MCP server entrypoint. */
export interface RuntimeDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdin: NodeJS.ReadableStream;
  readonly serve: (
    factory: (context: unknown) => Promise<unknown>,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  readonly writeStderr: (text: string) => void;
  readonly setExitCode: (code: number) => void;
  readonly registerShutdown: (request: () => void) => () => void;
  readonly transport?: "http";
  readonly createServer?: unknown;
  readonly loadOptionalProviders?: unknown;
}
