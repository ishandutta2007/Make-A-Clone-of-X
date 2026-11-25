export {
  SUPPORTED_AGENTS,
  resolveConfigPath,
  getAgentConfigPath,
  detectAgents,
  buildMcpServerEntry,
  registerWithAgent,
  registerWithAllAgents,
} from "./setupWizard.js";
export type {
  AgentDefinition,
  McpServerEntry,
  SetupResult,
  DetectedAgent,
} from "./types.js";
