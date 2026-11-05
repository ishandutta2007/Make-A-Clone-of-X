import { describe, it, expect } from "vitest";

describe("MACX identity", () => {
  it("should export correct product identity", async () => {
    const { PRODUCT_IDENTITY } = await import("../src/identity.js");
    expect(PRODUCT_IDENTITY.displayName).toBe("MACX");
    expect(PRODUCT_IDENTITY.packageName).toBe("macx-agents");
    expect(PRODUCT_IDENTITY.cliBinary).toBe("macx");
    expect(PRODUCT_IDENTITY.mcpServerKey).toBe("macx");
    expect(PRODUCT_IDENTITY.skillName).toBe("make-a-clone-of-x");
    expect(PRODUCT_IDENTITY.configFileName).toBe("macx.json");
  });

  it("should export correct package metadata", async () => {
    const { PACKAGE_METADATA } = await import("../src/generatedPackageMetadata.js");
    expect(PACKAGE_METADATA.name).toBe("macx-agents");
    expect(PACKAGE_METADATA.version).toBe("1.0.0");
  });
});

describe("MACX config", () => {
  it("should parse valid config from environment", async () => {
    const { parseConfig } = await import("../src/config/parseConfig.js");
    const result = parseConfig({ MACX_LOG_LEVEL: "info" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.logLevel).toBe("info");
    }
  });

  it("should reject invalid log level", async () => {
    const { parseConfig } = await import("../src/config/parseConfig.js");
    const result = parseConfig({ MACX_LOG_LEVEL: "invalid" });
    expect(result.ok).toBe(false);
  });

  it("should accept empty environment", async () => {
    const { parseConfig } = await import("../src/config/parseConfig.js");
    const result = parseConfig({});
    expect(result.ok).toBe(true);
  });
});

describe("MACX process", () => {
  it("should snapshot environment", async () => {
    const { snapshotEnvironment } = await import("../src/process/snapshotEnvironment.js");
    const env = { MACX_LOG_LEVEL: "debug", HOME: "/home/user" };
    const snapshot = snapshotEnvironment(env);
    expect(snapshot.MACX_LOG_LEVEL).toBe("debug");
    expect(snapshot.HOME).toBe("/home/user");
  });
});

describe("MACX domain", () => {
  it("should project analysis errors", async () => {
    const { projectAnalysisError } = await import("../src/domain/analysisErrorProjection.js");
    const result = projectAnalysisError("test error");
    expect(result.message).toContain("MACX");
    expect(result.message).toContain("test error");
  });
});
