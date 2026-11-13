# CLI and Evidence

## Commands

### `macx doctor`

Check MACX readiness and provider availability.

```bash
macx doctor
```

### `macx analyze-javascript-application <path>`

Analyze an extracted JavaScript or Electron application directory. Discovers all JS/TS modules, extracts imports and exports, detects Electron entry points and IPC patterns, identifies frameworks, and builds an import graph.

```bash
# Human-readable summary
macx analyze-javascript-application /path/to/app

# Full JSON output
macx analyze-javascript-application /path/to/app --json

# Include source map detection
macx analyze-javascript-application /path/to/app --source-maps
```

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output full analysis result as JSON |
| `--source-maps` | Include source map detection in the analysis |

**Output includes:**
- Summary statistics (modules, lines, size, entry points, import edges)
- Electron detection (main process, renderer, preload, IPC channels)
- Entry point discovery (from package.json, Electron main, common names)
- Framework detection (React, Vue, Angular, Svelte, Next.js, Express, Electron)
- Top package dependencies
- Warnings and errors

### `macx setup`

Configure MACX with your agents and analysis providers.

```bash
macx setup
```

### `macx update`

Update MACX to the latest version.

```bash
macx update
```

### `macx version`

Print version information.

```bash
macx version
```

## Exit statuses

| Status | Meaning                           |
| ------ | --------------------------------- |
| 0      | Success                           |
| 1      | Analysis or configuration failure |
| 141    | Stdout pipe closed (SIGPIPE)      |

## Environment variables

| Variable                         | Description                  |
| -------------------------------- | ---------------------------- |
| `MACX_LOG_LEVEL`                 | Log level (trace–silent)     |
| `MACX_MCP_INPUT_SCHEMA_PROFILE`  | MCP input schema profile     |
| `MACX_MCP_OUTPUT_SCHEMA_PROFILE` | MCP output schema profile    |
| `MACX_MCP_TOOL_FAMILIES`         | Scoped tool family selection |
