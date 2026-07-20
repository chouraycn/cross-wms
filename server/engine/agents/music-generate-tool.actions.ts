/**
 * 移植自 openclaw/src/agents/tools/music-generate-tool.actions.ts
 *
 * music_generate action helpers. cross-wms provides no-op defaults
 * since the music generation infrastructure is not available.
 */

type MusicGenerateActionResult = {
  kind: string;
  text: string;
  actions?: unknown[];
};

/** Builds the music-generation provider listing result shown to the agent. */
export function createMusicGenerateListActionResult(
  _config?: unknown,
  _options?: Record<string, unknown>,
): MusicGenerateActionResult {
  return {
    kind: "music_generation",
    text: "No music-generation providers are registered.",
  };
}

/** Builds status output for the active music-generation task in the current session. */
export function createMusicGenerateStatusActionResult(
  _sessionKey?: string,
): MusicGenerateActionResult {
  return {
    kind: "music_generation",
    text: "No active music generation task is currently running for this session.",
  };
}

/** Returns duplicate-guard status output when a matching music task is already active. */
export function createMusicGenerateDuplicateGuardResult(
  _sessionKey?: string,
  _params?: Record<string, unknown>,
): MusicGenerateActionResult | undefined {
  // No duplicate guard in cross-wms — no music generation infrastructure.
  return undefined;
}
