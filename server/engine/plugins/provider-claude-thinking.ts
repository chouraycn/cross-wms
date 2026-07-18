/** Provider Claude thinking. 移植自 openclaw/src/plugins/provider-claude-thinking.ts。
 * 降级策略：返回 false/undefined。 */
export function isClaudeAdaptiveThinkingDefaultModelId(modelId: string | undefined): boolean {
  void modelId;
  return false;
}

export function resolveClaudeThinkingProfile(params: unknown): unknown {
  void params;
  return undefined;
}
