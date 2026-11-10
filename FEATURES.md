# MACX Features

## Current Features (v1.0.0)

### MCP Server

| Feature | Status | Details |
|---------|--------|---------|
| **Stdio transport** | ✅ Working | MCP server over stdin/stdout for agent integration |
| **`macx_doctor` tool** | ✅ Working | Reports MACX version, Node.js version, platform, and arch |
| **`analyze_javascript_application` tool** | 🟡 Stub | Accepts path and options; returns stub response (analysis engine not yet wired) |
| **`inspect_binary` tool** | 🟡 Stub | Accepts binary path and provider selection; returns stub response |
| **`inspect_website` tool** | 🟡 Stub | Accepts URL and screenshot flag; returns stub response |
| **Zod input validation** | ✅ Working | All MCP tool inputs validated via Zod schemas |
| **Structured JSON responses** | ✅ Working | All tools return structured JSON content |

### CLI

| Feature | Status | Details |
|---------|--------|---------|
| **`macx doctor`** | ✅ Working | Readiness check; reports version, Node.js, platform, provider status |
| **`macx version`** | ✅ Working | Prints package name, version, Node.js, platform, arch as JSON |
| **`macx setup`** | 🟡 Manual | Prints manual MCP registration instructions (no interactive wizard yet) |
| **`macx update`** | 🟡 Manual | Prints `npm install --global` instructions (no automated updater yet) |
| **`macx analyze-javascript-application <path>`** | 🟡 Stub | Accepts path with `--json` flag; returns stub response |
| **`macx --help`** | ✅ Working | Built-in help via Incur CLI framework |
| **`macx --version`** | ✅ Working | Version output via Incur |

### Infrastructure

| Feature | Status | Details |
|---------|--------|---------|
| **TypeScript strict mode** | ✅ Working | Full strict compiler options, ESM modules, NodeNext resolution |
| **Pino structured logging** | ✅ Working | JSON logger on stderr with configurable log levels via `MACX_LOG_LEVEL` |
| **Environment snapshot** | ✅ Working | Immutable env snapshot at startup; prevents config drift |
| **Config validation** | ✅ Working | Validates `MACX_LOG_LEVEL`, rejects invalid values |
| **Graceful shutdown** | ✅ Working | SIGINT/SIGTERM handlers for clean MCP server shutdown |
| **SIGPIPE handling** | ✅ Working | Exits with status 141 when stdout pipe closes (`macx ... | head`) |
| **Vitest test suite** | ✅ Working | Unit tests for identity, config, process snapshot, and error projection |
| **MIT license** | ✅ Done | Clean MIT license |
| **English-only docs** | ✅ Done | README, installation guide, CLI reference, disclaimer, security policy |
| **Bash installer** | ✅ Done | `install.sh` with Node.js version validation and `--dry-run` support |

---

## Planned Features (Roadmap)

### 🔴 Critical — Required for Useful Analysis

| Feature | Priority | Description |
|---------|----------|-------------|
| **JavaScript/Electron static analysis engine** | 🔴 P0 | Actual module graph extraction, import resolution, source map parsing, and Electron IPC tracing for JS apps. This is the most impactful feature since it requires **no external provider** (Hopper/Ghidra/IDA) and can work standalone. |
| **Desktop application discovery** | 🔴 P0 | Scan common install locations on macOS/Windows/Linux to find installed apps, their executables, bundled JS, and frameworks. Enables the core "see a feature → clone it" workflow. |
| **Interactive setup wizard** | 🔴 P0 | Walk the user through agent registration (Claude Code, Codex, Cursor, Gemini CLI, etc.) with config file detection, backup, and write — replacing the current manual instructions. |

### 🟠 High — Important for Production Use

| Feature | Priority | Description |
|---------|----------|-------------|
| **Ghidra headless analysis bridge** | 🟠 P1 | Launch Ghidra in headless mode, load a binary, and return decompiled pseudocode, symbols, cross-references, and strings. Most popular free native analysis provider. |
| **Hopper analysis bridge** | 🟠 P1 | Connect to Hopper's scripting API to decompile and inspect native binaries on macOS/Linux. |
| **Website/browser analysis** | 🟠 P1 | Playwright-based page inspection: DOM structure, script inventory, network observations, and optional screenshots. |
| **Automated `macx update`** | 🟠 P1 | Self-update via npm with version verification, followed by automated `macx setup` refresh. |
| **HAR/network capture analysis** | 🟠 P1 | Parse HAR files or Fiddler SAZ archives to extract API endpoints, request/response pairs, and authentication patterns. |

### 🟡 Medium — Extends Analysis Scope

| Feature | Priority | Description |
|---------|----------|-------------|
| **.NET assembly inspection** | 🟡 P2 | Static CIL metadata reading: types, methods, dependencies, and build comparisons without running the assembly. |
| **Go binary metadata extraction** | 🟡 P2 | Extract embedded Go version, module list, build settings, and replacements from ELF/PE/Mach-O Go binaries. |
| **Rust binary crate inventory** | 🟡 P2 | Read cargo-auditable data from Rust binaries: crate names, versions, sources, and dependency edges. |
| **SQLite database inspection** | 🟡 P2 | Read schema (tables, columns, indexes, views, triggers) and sample rows from local SQLite databases. |
| **IDA Pro analysis bridge** | 🟡 P2 | Connect to IDA's scripting API for decompilation and cross-reference queries. Supports the IDA MCP bridge. |
| **MCP HTTP transport** | 🟡 P2 | Serve the MCP server over streamable HTTP in addition to stdio, for remote and multi-agent setups. |

### 🟢 Low — Nice-to-Have Enhancements

| Feature | Priority | Description |
|---------|----------|-------------|
| **Android APK analysis** | 🟢 P3 | Manifest parsing, JADX decompilation, class/method extraction via headless JADX bridge. |
| **Firmware analysis** | 🟢 P3 | Binwalk/Unblob-based region extraction and handoff to native analysis. |
| **EVM bytecode analysis** | 🟢 P3 | Dispatch selector extraction and inferred function signatures from Ethereum contract bytecode. |
| **Process capture** | 🟢 P3 | Run a target process, capture terminal output, and observe filesystem changes for behavioral analysis. |
| **RL environment builder** | 🟢 P3 | Turn recorded API sessions into AgentEnv-compatible environments for RL training/evaluation. |
| **Shell completions** | 🟢 P3 | Bash/Zsh/Fish tab-completion for all CLI commands and options. |
| **Plugin/skill system** | 🟢 P3 | Loadable analysis plugins and agent skill bundles for extensibility. |
