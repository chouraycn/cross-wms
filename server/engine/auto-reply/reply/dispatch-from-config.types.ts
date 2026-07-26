// Shared type contracts for dispatch-from-config runtime execution.
// 移植自 openclaw/src/auto-reply/reply/dispatch-from-config.types.ts
//
// 降级说明：
//  - OpenClawConfig 改为从 ../../infra/_runtime-stubs.js 导入降级类型
//  - SourceReplyDeliveryMode 来自 ../get-reply-options.types.js，cross-wms 暂未移植，
//    在本文件中定义为本地 type alias（与原定义保持一致）
//  - FinalizedMsgContext 来自 ../templating.js，cross-wms 暂未移植 templating，
//    在本文件中定义为最小本地 stub（结构子集化赋值兼容）
//  - CommandSessionMetadataChange 来自 ./command-session-metadata.js，cross-wms 暂未移植，
//    在本文件中定义为最小本地 stub
import type { OpenClawConfig } from "../../infra/_runtime-stubs.js";
import type {
  FormatAbortReplyText,
  TryFastAbortFromMessage,
} from "./abort.runtime-types.js";
import type {
  InternalGetReplyFromConfig,
  InternalGetReplyOptions,
} from "./get-reply.types.js";
import type { ReplyDispatchKind, ReplyDispatcher } from "./reply-dispatcher.types.js";

/** Per-turn source-message delivery mode（本地占位，与 openclaw 定义保持一致）。 */
export type SourceReplyDeliveryMode = "automatic" | "message_tool_only";

/**
 * 入站消息上下文（降级占位）。
 *
 * openclaw 中 FinalizedMsgContext 是 MsgContext 的 Omit 子集加上 finalized 字段，
 * 这里仅保留 dispatch-from-config 所需的最小结构。
 */
export type FinalizedMsgContext = {
  Body?: string;
  From?: string;
  [key: string]: unknown;
};

/** Session metadata change emitted by command handlers（最小占位）。 */
export type CommandSessionMetadataChange = {
  key: string;
  value?: unknown;
  op?: "set" | "delete";
};

export type DispatchFromConfigResult = {
  queuedFinal: boolean;
  counts: Record<ReplyDispatchKind, number>;
  failedCounts?: Partial<Record<ReplyDispatchKind, number>>;
  sourceReplyDeliveryMode?: SourceReplyDeliveryMode;
  sendPolicyDenied?: boolean;
  observedReplyDelivery?: boolean;
  noVisibleReplyFallbackEligible?: boolean;
  beforeAgentRunBlocked?: boolean;
  sessionMetadataChanges?: CommandSessionMetadataChange[];
};

export type DispatchFromConfigParams = {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<InternalGetReplyOptions, "onBlockReply">;
  replyResolver?: InternalGetReplyFromConfig;
  onSessionMetadataChanges?: (changes: CommandSessionMetadataChange[]) => void;
  fastAbortResolver?: TryFastAbortFromMessage;
  formatAbortReplyTextResolver?: FormatAbortReplyText;
  /** Optional patch applied to the already loaded config before reply resolution. */
  configOverride?: OpenClawConfig;
};

export type DispatchReplyFromConfig = (
  params: DispatchFromConfigParams,
) => Promise<DispatchFromConfigResult>;
