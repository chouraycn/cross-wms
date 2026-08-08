// Shared provider dispatch type contracts for reply runtime execution.
// 移植自 openclaw/src/auto-reply/reply/provider-dispatcher.types.ts
//
// 降级说明：
//  - OpenClawConfig 改为从 ../../infra/_runtime-stubs.js 导入降级类型
//  - GetReplyOptions 来自 ../types.js（cross-wms 已有简化版）
//  - FinalizedMsgContext / MsgContext 来自 ../templating.js，cross-wms 暂未移植，
//    复用 ./dispatch-from-config.types.js 中的 FinalizedMsgContext 占位，并定义本地 MsgContext
//  - ReplyDispatcherOptions / ReplyDispatcherWithTypingOptions 来自 ./reply-dispatcher.js，
//    cross-wms 暂未移植运行时实现，此处定义为最小占位类型
import type { OpenClawConfig } from "../../infra/_runtime-stubs.js";
import type { GetReplyOptions } from "../types.js";
import type {
  DispatchFromConfigResult,
  FinalizedMsgContext,
} from "./dispatch-from-config.types.js";
import type { GetReplyFromConfig } from "./get-reply.types.js";

/** 入站消息上下文（最小占位，与 FinalizedMsgContext 结构兼容）。 */
export type MsgContext = {
  Body?: string;
  From?: string;
  [key: string]: any;
};

/** Reply dispatcher options（最小占位）。 */
export type ReplyDispatcherOptions = {
  [key: string]: any;
};

/** Reply dispatcher options with typing lifecycle（最小占位）。 */
export type ReplyDispatcherWithTypingOptions = ReplyDispatcherOptions & {
  typing?: any;
};

type DispatchReplyContext = MsgContext | FinalizedMsgContext;
type DispatchReplyOptions = Omit<GetReplyOptions, "onBlockReply">;

/** Buffered block dispatcher entry point used by provider reply flows. */
export type DispatchReplyWithBufferedBlockDispatcher = (params: {
  ctx: DispatchReplyContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  toolsAllow?: string[];
  replyOptions?: DispatchReplyOptions;
  replyResolver?: GetReplyFromConfig;
}) => Promise<DispatchFromConfigResult>;

/** Plain dispatcher entry point used when block buffering is not needed. */
export type DispatchReplyWithDispatcher = (params: {
  ctx: DispatchReplyContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  toolsAllow?: string[];
  replyOptions?: DispatchReplyOptions;
  replyResolver?: GetReplyFromConfig;
}) => Promise<DispatchFromConfigResult>;
