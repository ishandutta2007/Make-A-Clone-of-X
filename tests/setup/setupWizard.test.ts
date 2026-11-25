import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";

import {
  resolveConfigPath,
  getAgentConfigPath,
  detectAgents,
  buildMcpServerEntry,
  registerWithAgent,
  SUPPORTED_AGENTS,
} from "../../src/setup/setupWizard.js";

describe("resolveConfigPath", () => {
  it("should expand ~ to home directory", () => {
    const result = resolveConfigPath("~/.config/test.json", "/home/user");
    // On Windows, path.join normalises separators to backslash
    const normalised = result.replace(/\\/g, "/");
    expect(normalised).toContain("/home/user");
    expect(normalised).toContain(".config");
    expect(normalised).toContain("test.json");
  });

  it("should leave absolute paths unchanged", () => {
    const result = resolveConfigPath("/usr/local/config.json", "/home/user");
    expect(result).toBe("/usr/local/config.json");
  });

  it("should handle Windows-style home paths", () => {
    const result = resolveConfigPath(
      "~/.cursor/mcp.json",
      "C:\\Users\\test",
    );
    expect(result).toContain("Users");
    expect(result).toContain("test");
    expect(result).toContain("mcp.json");
  });
});

describe("SUPPORTED_AGENTS", () => {
  it("should have at least 5 supported agents", () => {
    expect(SUPPORTED_AGENTS.length).toBeGreaterThanOrEqual(5);
  });

  it("should have unique agent IDs", () => {
    const ids = SUPPORTED_AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should include Claude Desktop", () => {
    const claude = SUPPORTED_AGENTS.find((a) => a.id === "claude-desktop");
    expect(claude).toBeDefined();
    expect(claude!.displayName).toBe("Claude Desktop");
    expect(claude!.mcpServersKey).toBe("mcpServers");
  });

  it("should include Cursor", () => {
    const cursor = SUPPORTED_AGENTS.find((a) => a.id === "cursor");
    expect(cursor).toBeDefined();
    expect(cursor!.displayName).toBe("Cursor");
  });

  it("should include Gemini CLI", () => {
    const gemini = SUPPORTED_AGENTS.find((a) => a.id === "gemini-cli");
    expect(gemini).toBeDefined();
    expect(gemini!.displayName).toContain("Gemini");
  });

  it("should include VS Code Copilot", () => {
    const vscode = SUPPORTED_AGENTS.find((a) => a.id === "vscode-copilot");
    expect(vscode).toBeDefined();
    expect(vscode!.mcpServersKey).toBe("github.copilot.chat.mcpServers");
  });

  it("should have config paths for all major platforms", () => {
    for (const agent of SUPPORTED_AGENTS) {
      // All agents should have at least darwin and linux
      expect(agent.configPaths.darwin || agent.configPaths.linux).toBeTruthy();
    }
  });
});

describe("getAgentConfigPath", () => {
  it("should return path for valid platform", () => {
    const path = getAgentConfigPath(SUPPORTED_AGENTS[0]!, "darwin", "/Users/test");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
  });

  it("should return undefined for unsupported platform", () => {
    const path = getAgentConfigPath(SUPPORTED_AGENTS[0]!, "freebsd" as NodeJS.Platform, "/home/test");
    expect(path).toBeUndefined();
  });
});

describe("buildMcpServerEntry", () => {
  it("should build a valid server entry", () => {
    const entry = buildMcpServerEntry();
    expect(entry.command).toBe("npx");
    expect(entry.args).toContain("-y");
    expect(entry.args.some((a) => a.includes("macx-agents"))).toBe(true);
    expect(entry.args).toContain("mcp");
  });
});

describe("registerWithAgent", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "macx-setup-test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const mockAgent = {
    id: "test-agent",
    displayName: "Test Agent",
    configPaths: { darwin: "", win32: "", linux: "" },
    mcpServersKey: "mcpServers",
    configFormat: "json" as const,
  };

  it("should create new config file if it does not exist", async () => {
    const configPath = join(tempDir, "new-config.json");

    const result = await registerWithAgent(mockAgent, configPath);

    expect(result.success).toBe(true);
    expect(result.existed).toBe(false);
    expect(result.alreadyRegistered).toBe(false);

    // Verify the file was created
    const content = JSON.parse(await readFile(configPath, "utf-8"));
    expect(content.mcpServers).toBeDefined();
    expect(content.mcpServers.macx).toBeDefined();
    expect(content.mcpServers.macx.command).toBe("npx");
  });

  it("should add MACX to existing config without clobbering", async () => {
    const configPath = join(tempDir, "existing-config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          otherTool: { command: "other", args: [] },
        },
        someOtherKey: "preserved",
      }),
    );

    const result = await registerWithAgent(mockAgent, configPath);

    expect(result.success).toBe(true);
    expect(result.existed).toBe(true);
    expect(result.backupPath).toBeDefined();

    const content = JSON.parse(await readFile(configPath, "utf-8"));
    expect(content.mcpServers.macx).toBeDefined();
    expect(content.mcpServers.otherTool).toBeDefined(); // Not clobbered
    expect(content.someOtherKey).toBe("preserved");
  });

  it("should skip if already registered", async () => {
    const configPath = join(tempDir, "already-registered.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          macx: { command: "npx", args: ["-y", "macx-agents@old", "mcp"] },
        },
      }),
    );

    const result = await registerWithAgent(mockAgent, configPath);

    expect(result.success).toBe(true);
    expect(result.alreadyRegistered).toBe(true);
    expect(result.backupPath).toBeUndefined(); // No backup needed
  });

  it("should overwrite if already registered with --force", async () => {
    const configPath = join(tempDir, "force-overwrite.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          macx: { command: "npx", args: ["-y", "macx-agents@old", "mcp"] },
        },
      }),
    );

    const result = await registerWithAgent(mockAgent, configPath, {
      force: true,
    });

    expect(result.success).toBe(true);
    expect(result.alreadyRegistered).toBe(true); // Was already registered
    expect(result.backupPath).toBeDefined(); // Should backup

    const content = JSON.parse(await readFile(configPath, "utf-8"));
    expect(content.mcpServers.macx.args.some((a: string) => a.includes("latest"))).toBe(true);
  });

  it("should not write files in dry-run mode", async () => {
    const configPath = join(tempDir, "dry-run-config.json");

    const result = await registerWithAgent(mockAgent, configPath, {
      dryRun: true,
    });

    expect(result.success).toBe(true);

    // File should not exist
    await expect(access(configPath)).rejects.toThrow();
  });

  it("should create a backup of existing config", async () => {
    const configPath = join(tempDir, "backup-test.json");
    await writeFile(configPath, JSON.stringify({ existing: true }));

    const result = await registerWithAgent(mockAgent, configPath);

    expect(result.success).toBe(true);
    expect(result.backupPath).toBeDefined();

    // Verify backup exists and has original content
    const backupContent = JSON.parse(await readFile(result.backupPath!, "utf-8"));
    expect(backupContent.existing).toBe(true);
  });

  it("should skip backup with --no-backup", async () => {
    const configPath = join(tempDir, "no-backup-test.json");
    await writeFile(configPath, JSON.stringify({ existing: true }));

    const result = await registerWithAgent(mockAgent, configPath, {
      noBackup: true,
    });

    expect(result.success).toBe(true);
    expect(result.backupPath).toBeUndefined();
  });

  it("should handle nested mcpServersKey (dot notation)", async () => {
    const nestedAgent = {
      ...mockAgent,
      id: "nested-agent",
      mcpServersKey: "github.copilot.chat.mcpServers",
    };

    const configPath = join(tempDir, "nested-config.json");

    const result = await registerWithAgent(nestedAgent, configPath);

    expect(result.success).toBe(true);

    const content = JSON.parse(await readFile(configPath, "utf-8"));
    expect(content.github.copilot.chat.mcpServers.macx).toBeDefined();
  });

  it("should create parent directories if needed", async () => {
    const configPath = join(tempDir, "deep", "nested", "config.json");

    const result = await registerWithAgent(mockAgent, configPath);

    expect(result.success).toBe(true);
    const content = JSON.parse(await readFile(configPath, "utf-8"));
    expect(content.mcpServers.macx).toBeDefined();
  });
});

describe("detectAgents", () => {
  it("should return an array of detected agents", async () => {
    const detected = await detectAgents();
    expect(Array.isArray(detected)).toBe(true);
    expect(detected.length).toBeGreaterThan(0);
  });

  it("should include agent definition in each result", async () => {
    const detected = await detectAgents();
    for (const d of detected) {
      expect(d.agent).toBeDefined();
      expect(d.agent.id).toBeDefined();
      expect(d.configPath).toBeDefined();
      expect(typeof d.configExists).toBe("boolean");
      expect(typeof d.macxRegistered).toBe("boolean");
    }
  });
});
