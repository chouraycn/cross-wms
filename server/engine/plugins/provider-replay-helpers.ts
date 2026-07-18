/** Provider replay helpers. 移植自 openclaw/src/plugins/provider-replay-helpers.ts。
 * 降级策略：返回默认值。 */
/** 占位：ProviderReplayPolicy。 */
type ProviderReplayPolicy = unknown;
/** 占位：ProviderReasoningOutputMode。 */
type ProviderReasoningOutputMode = unknown;

export function buildOpenAICompatibleReplayPolicy(params: unknown): ProviderReplayPolicy {
  void params;
  return undefined;
}
export function buildStrictAnthropicReplayPolicy(params: unknown): ProviderReplayPolicy {
  void params;
  return undefined;
}
export function shouldPreserveThinkingBlocks(modelId?: string): boolean {
  void modelId;
  return false;
}
export function buildAnthropicReplayPolicyForModel(modelId?: string): ProviderReplayPolicy {
  void modelId;
  return undefined;
}
export function buildNativeAnthropicReplayPolicyForModel(modelId?: string): ProviderReplayPolicy {
  void modelId;
  return undefined;
}
export function buildHybridAnthropicOrOpenAIReplayPolicy(params: unknown): ProviderReplayPolicy {
  void params;
  return undefined;
}
export function buildGoogleGeminiReplayPolicy(): ProviderReplayPolicy {
  return undefined;
}
export function buildPassthroughGeminiSanitizingReplayPolicy(params: unknown): ProviderReplayPolicy {
  void params;
  return undefined;
}
export function sanitizeGoogleGeminiReplayHistory(params: unknown): unknown {
  void params;
  return undefined;
}
export function resolveTaggedReasoningOutputMode(): ProviderReasoningOutputMode {
  return undefined;
}
