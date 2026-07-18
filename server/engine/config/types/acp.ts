// ACP session 与 runtime 配置类型
// 移植自 openclaw/src/config/types.acp.ts
//
// 注意：原文件依赖 @openclaw/acp-core/runtime/types 的 AcpSessionUpdateTag。
// cross-wms 没有 @openclaw/acp-core，此处本地化定义该类型（字符串字面量联合）。

/** ACP 适配器发出的 runtime update tag；未知 backend tag 会被透传 */
export type AcpSessionUpdateTag =
  | "agent_message_chunk"
  | "agent_thought_chunk"
  | "tool_call"
  | "tool_call_update"
  | "usage_update"
  | "available_commands_update"
  | "current_mode_update"
  | "config_option_update"
  | "session_info_update"
  | "plan"
  | (string & Record<string, never>);

export type AcpDispatchConfig = {
  /** Master switch for ACP turn dispatch in the reply pipeline. */
  enabled?: boolean;
};

export type AcpStreamConfig = {
  /** Coalescer idle flush window in milliseconds for ACP streamed text. */
  coalesceIdleMs?: number;
  /** Maximum text size per streamed chunk. */
  maxChunkChars?: number;
  /** Suppresses repeated ACP status/tool projection lines within a turn. */
  repeatSuppression?: boolean;
  /** Live streams chunks or waits for terminal event before delivery. */
  deliveryMode?: "live" | "final_only";
  /** Separator inserted before visible text when hidden tool events occurred. */
  hiddenBoundarySeparator?: "none" | "space" | "newline" | "paragraph";
  /** Maximum assistant output characters forwarded per turn. */
  maxOutputChars?: number;
  /** Maximum visible characters for projected session/update lines. */
  maxSessionUpdateChars?: number;
  /**
   * Per-sessionUpdate visibility overrides.
   * Keys not listed here fall back to OpenClaw defaults.
   */
  tagVisibility?: Partial<Record<AcpSessionUpdateTag, boolean>>;
};

export type AcpRuntimeConfig = {
  /** Idle runtime TTL in minutes for ACP session workers. */
  ttlMinutes?: number;
  /** Optional operator install/setup command shown by `/acp install` and `/acp doctor`. */
  installCommand?: string;
};

export type AcpConfig = {
  /** Global ACP runtime gate. */
  enabled?: boolean;
  dispatch?: AcpDispatchConfig;
  /** Backend id registered by ACP runtime plugin (for example: acpx). */
  backend?: string;
  /** Fallback backend ids tried when the primary backend fails with UNAVAILABLE. */
  fallbacks?: string[];
  defaultAgent?: string;
  allowedAgents?: string[];
  maxConcurrentSessions?: number;
  stream?: AcpStreamConfig;
  runtime?: AcpRuntimeConfig;
};
