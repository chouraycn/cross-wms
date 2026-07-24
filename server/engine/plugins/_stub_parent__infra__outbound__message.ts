// === STUB (NO-OP) — sendMessage 占位 ===
// Source: openclaw/src/infra/outbound/message.ts
// Used by: server/engine/plugins/host-hook-attachments.ts (动态 import)
//
// openclaw 的 sendMessage 是 channel outbound 投递消息的核心函数，依赖
// channel plugin runtime、conversation binding、delivery router 等子系统。
// cross-wms 暂未完整移植这些子系统，此 stub 提供类型安全的空操作实现。
//
// 当 cross-wms 移植完整 outbound 子系统后，此文件应替换为真实实现的重导出。

export type SendMessageParams = {
  to: string;
  content: string;
  channel: string;
  accountId?: string;
  threadId?: string | number;
  replyTo?: unknown;
  [key: string]: unknown;
};

export type SendMessageResult = {
  ok: boolean;
  result?: unknown;
  channel?: string;
  messageId?: string;
  error?: string;
};

/** sendMessage stub — 当前为空操作，返回 ok=false 表示投递未完成。 */
export async function sendMessage(_params: SendMessageParams): Promise<SendMessageResult> {
  return { ok: false, error: "sendMessage is not implemented in cross-wms yet." };
}
