/**
 * Ported from openclaw/src/agents/harness/codex-app-server-extensions.ts
 *
 * Codex app-server extension runner.
 * Cross-wms degradation: returns a no-op runner without extension factories.
 */

/** Creates a runner that applies registered Codex app-server tool-result extensions. */
export function createCodexAppServerToolResultExtensionRunner(
  _ctx?: Record<string, unknown>,
  _factories?: unknown[],
) {
  return {
    async applyToolResultExtensions(
      event: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      // Cross-wms does not have registered extension factories.
      return event.result as Record<string, unknown>;
    },
  };
}
