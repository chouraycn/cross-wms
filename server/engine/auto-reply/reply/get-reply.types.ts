// Shared get-reply type contracts for command, directive, and runtime layers.
// 移植自 openclaw/src/auto-reply/reply/get-reply.types.ts
//
// 降级说明：
//  - OpenClawConfig 改为从 ../../infra/_runtime-stubs.js 导入降级类型
//  - GetReplyOptions / ReplyPayload 来自 ../types.js（cross-wms 已有简化版）
//  - MsgContext 来自 ../templating.js，cross-wms 暂未移植 templating，
//    在本文件中定义为最小本地 stub（结构子集化赋值兼容）。
import type { OpenClawConfig } from "../../infra/_runtime-stubs.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";

/**
 * 入站消息上下文（降级占位）。
 *
 * openclaw 中 MsgContext 包含 Body/From/ChatType/ConversationLabel 等大量字段，
 * 这里仅保留 get-reply 类型契约所需的最小结构。调用方传入的完整对象可通过
 * 结构子集化赋值给此类型。
 */
export type MsgContext = {
  Body?: string;
  From?: string;
  [key: string]: unknown;
};

export type ReplySessionBinding = {
  sessionKey?: string;
  sessionId: string;
  storePath?: string;
};

export type InternalReplySessionOptions = {
  requestedSessionId?: string;
  resumeRequestedSession?: boolean;
};

export type InternalGetReplyOptions = GetReplyOptions & InternalReplySessionOptions;

/** Reply resolver signature used by dispatchers and tests for dependency injection. */
export type GetReplyFromConfig = (
  ctx: MsgContext,
  opts?: GetReplyOptions,
  configOverride?: OpenClawConfig,
) => Promise<ReplyPayload | ReplyPayload[] | undefined>;

export type InternalGetReplyFromConfig = (
  ctx: MsgContext,
  opts?: InternalGetReplyOptions,
  configOverride?: OpenClawConfig,
) => Promise<ReplyPayload | ReplyPayload[] | undefined>;
