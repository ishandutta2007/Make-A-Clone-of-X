# CLI and Evidence

## Commands

### `macx doctor`

Check MACX readiness and provider availability.

```bash
macx doctor
```

### `macx analyze-javascript-application <path>`

Analyze an extracted JavaScript or Electron application directory.

```bash
macx analyze-javascript-application /path/to/app --json
```

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
