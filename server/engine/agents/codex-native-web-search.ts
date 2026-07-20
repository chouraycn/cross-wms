/**
 * Ported from openclaw/src/agents/codex-native-web-search.ts
 *
 * Public Codex native web-search facade.
 * Cross-wms degradation: isCodexNativeWebSearchRelevant returns false.
 */

export { buildCodexNativeWebSearchTool, patchCodexNativeWebSearchPayload, resolveCodexNativeSearchActivation, shouldSuppressManagedWebSearchTool } from "./codex-native-web-search-core.js";
export { describeCodexNativeWebSearch, resolveCodexNativeWebSearchConfig } from "./codex-native-web-search.shared.js";

/** True when Codex native web search should appear relevant for an agent. */
export function isCodexNativeWebSearchRelevant(params: {
  config: Record<string, unknown>;
  agentId?: string;
  agentDir?: string;
}): boolean {
  // Cross-wms does not have Codex auth or model resolution.
  return false;
}
