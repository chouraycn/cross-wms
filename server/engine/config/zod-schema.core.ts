// 移植自 openclaw/src/config/zod-schema.core.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type _ModelCompatSchemaAssignableToType = unknown;
export type _ModelCompatTypeAssignableToSchema = unknown;
export type DmPolicyAllowFromViolation = unknown;
export type _ToolsMediaAsyncCompletionSchemaAssignableToType = unknown;
export type _ToolsMediaAsyncCompletionTypeAssignableToSchema = unknown;
export function isBuiltInModelProviderOverlayId(...args: unknown[]): unknown {
  throw new Error("not implemented: isBuiltInModelProviderOverlayId");
}
export const SecretRefSchema: unknown = undefined;
export const SecretInputSchema: unknown = undefined;
export const SecretProviderSchema: unknown = undefined;
export const SecretsConfigSchema: unknown = undefined;
export const ModelsConfigSchema: unknown = undefined;
export const VisibleRepliesSchema: unknown = undefined;
export const MentionPatternsModeSchema: unknown = undefined;
export const MentionPatternsPolicySchema: unknown = undefined;
export const GroupChatSchema: unknown = undefined;
export const DmConfigSchema: unknown = undefined;
export const IdentitySchema: unknown = undefined;
export const ReplyToModeSchema: unknown = undefined;
export const TypingModeSchema: unknown = undefined;
export const GroupPolicySchema: unknown = undefined;
export const DmPolicySchema: unknown = undefined;
export const ContextVisibilityModeSchema: unknown = undefined;
export const BlockStreamingCoalesceSchema: unknown = undefined;
export const ReplyRuntimeConfigSchemaShape: unknown = undefined;
export const BlockStreamingChunkSchema: unknown = undefined;
export const MarkdownTableModeSchema: unknown = undefined;
export const MarkdownConfigSchema: unknown = undefined;
export const TtsProviderSchema: unknown = undefined;
export const TtsModeSchema: unknown = undefined;
export const TtsAutoSchema: unknown = undefined;
export const TtsConfigSchema: unknown = undefined;
export const HumanDelaySchema: unknown = undefined;
export const CliBackendSchema: unknown = undefined;
export const normalizeAllowFrom: unknown = undefined;
export const evaluateDmPolicyAllowFromDependency: unknown = undefined;
export const requireOpenAllowFrom: unknown = undefined;
export const requireAllowlistAllowFrom: unknown = undefined;
export const MSTeamsReplyStyleSchema: unknown = undefined;
export const RetryConfigSchema: unknown = undefined;
export const QueueSchema: unknown = undefined;
export const InboundDebounceSchema: unknown = undefined;
export const TranscribeAudioSchema: unknown = undefined;
export const HexColorSchema: unknown = undefined;
export const ExecutableTokenSchema: unknown = undefined;
export const ToolsMediaSchema: unknown = undefined;
export const ToolsLinksSchema: unknown = undefined;
export const NativeCommandsSettingSchema: unknown = undefined;
export const ProviderCommandsSchema: unknown = undefined;
