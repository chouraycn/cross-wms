// 移植自 openclaw/src/config/types.tools.ts

export type MediaUnderstandingScopeMatch = unknown;
export type MediaUnderstandingScopeRule = unknown;
export type MediaUnderstandingScopeConfig = unknown;
export type MediaUnderstandingCapability = unknown;
export type MediaUnderstandingAttachmentsConfig = unknown;
export type MediaUnderstandingModelConfig = unknown;
export type MediaUnderstandingConfig = unknown;
export type LinkModelConfig = unknown;
export type LinkToolsConfig = unknown;
export type MediaToolsConfig = unknown;
export type ToolProfileId = unknown;
export type ToolLoopDetectionDetectorConfig = unknown;
export type ToolLoopPostCompactionGuardConfig = unknown;
export type ToolLoopDetectionConfig = unknown;
export type ToolSearchConfig = unknown;
export type CodeModeConfig = unknown;
export type SessionsToolsVisibility = unknown;
export type ToolPolicyConfig = unknown;
export type GroupToolPolicyConfig = unknown;
export type ToolsBySenderKeyType = unknown;
export type GroupToolPolicyBySenderConfig = unknown;
export type ExecToolConfig = unknown;
export type FsToolsConfig = unknown;
export type SessionsSpawnToolsConfig = unknown;
export type AgentToolsConfig = unknown;
export type MemorySearchConfig = unknown;
export type ToolsConfig = unknown;
export type MessageToolsConfig = {
  /** @deprecated Use tools.message.crossContext settings. */
  allowCrossContextSend?: boolean;
  crossContext?: {
    allowWithinProvider?: boolean;
    allowAcrossProviders?: boolean;
    marker?: {
      enabled?: boolean;
      prefix?: string;
      suffix?: string;
    };
  };
  actions?: {
    allow?: string[];
  };
  broadcast?: {
    enabled?: boolean;
  };
};
export function parseToolsBySenderTypedKey(...args: unknown[]): unknown {
  return undefined;
}
export const TOOLS_BY_SENDER_KEY_TYPES: unknown = undefined;
