// Shared abort runtime types for cancellation and cutoff persistence.
// 移植自 openclaw/src/auto-reply/reply/abort.runtime-types.ts
//
// 降级说明：
//  - OpenClawConfig 改为从 ../../infra/_runtime-stubs.js 导入降级类型
//  - FinalizedMsgContext 来自 ../templating.js，cross-wms 暂未移植 templating，
//    在本文件中定义为最小本地 stub（结构子集化赋值兼容）。
import type { OpenClawConfig } from "../../infra/_runtime-stubs.js";

/**
 * 入站消息上下文（降级占位）。
 *
 * openclaw 中 FinalizedMsgContext 是 MsgContext 的 Omit 子集加上 finalized 字段，
 * 这里仅保留 abort runtime 所需的最小结构。调用方传入的完整对象可通过结构子集化
 * 赋值给此类型。
 */
export type FinalizedMsgContext = {
  Body?: string;
  From?: string;
  [key: string]: unknown;
};

/** Result from the fast abort path before normal reply dispatch starts. */
type FastAbortResult = {
  handled: boolean;
  aborted: boolean;
  stoppedSubagents?: number;
};

/** Runtime hook that may convert a message into an immediate abort action. */
export type TryFastAbortFromMessage = (params: {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
}) => Promise<FastAbortResult>;

/** Formats the user-visible abort acknowledgement text. */
export type FormatAbortReplyText = (stoppedSubagents?: number) => string;
