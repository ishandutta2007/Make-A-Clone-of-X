# Installation and Setup

## Quick start

```bash
npx macx-agents setup
```

## Supported agents

MACX setup configures the following agents automatically:

- Claude Code
- Codex
- Cursor
- Gemini CLI
- Grok Build

Other clients can use manual MCP registration.

## Manual MCP registration

Add the following to your agent's MCP server configuration:

```json
{
  "macx": {
    "command": "npx",
    "args": ["-y", "macx-agents@latest", "mcp"]
  }
}
```

Restart your agent after registration.

## Requirements

- Node.js 22.x (>=22.23.4), 24.x (>=24.22.1), or 26.12.1+
- npm

## Analysis providers

For native binary analysis, configure one of:

- **Hopper** — macOS / Linux
- **Ghidra** — macOS / Linux / Windows
- **IDA** — macOS / Linux / Windows

Static JavaScript and .NET inspection work without a native analysis engine.

## Update

For a globally installed CLI:

```bash
macx update
```

For agent setup through npx:

```bash
npx macx-agents@latest setup
```
