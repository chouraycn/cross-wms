/**
 * 移植自 openclaw/src/agents/cli-runner/bundle-mcp-gemini.ts
 *
 * Gemini CLI bundle MCP adapter that writes temporary system settings files.
 * In cross-wms the Gemini CLI integration is not available,
 * so both functions throw descriptive errors when invoked at runtime.
 */

/** Writes merged Gemini system settings and returns env plus cleanup hook. */
export async function writeGeminiSystemSettings(
  _mergedConfig: unknown,
  _inheritedEnv?: Record<string, string>,
): Promise<{ env: Record<string, string>; cleanup: () => Promise<void> }> {
  throw new Error("Gemini system settings are not supported in cross-wms");
}

/** Writes per-attempt Gemini settings with the active loopback capture token. */
export async function writeGeminiMcpCaptureSettings(_params: {
  inheritedEnv: Record<string, string> | undefined;
  captureKey: string;
}): Promise<{ env: Record<string, string>; cleanup: () => Promise<void> }> {
  throw new Error("Gemini MCP capture settings are not supported in cross-wms");
}
