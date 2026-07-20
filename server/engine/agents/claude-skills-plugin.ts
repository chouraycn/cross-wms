/**
 * 移植自 openclaw/src/agents/cli-runner/claude-skills-plugin.ts
 *
 * Claude CLI skills plugin helpers.
 * In cross-wms the Claude CLI skills infrastructure is not available,
 * so isClaudeCliSkillFileAccessible returns false and
 * prepareClaudeCliSkillsPlugin returns null.
 */

/** Check if a Claude CLI skill file is accessible (always false in cross-wms). */
export function isClaudeCliSkillFileAccessible(..._args: unknown[]): false {
  return false;
}

/** Prepare the Claude CLI skills plugin (returns null in cross-wms). */
export function prepareClaudeCliSkillsPlugin(..._args: unknown[]): null {
  return null;
}
