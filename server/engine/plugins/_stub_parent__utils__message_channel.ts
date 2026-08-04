/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

// Re-export from canonical implementation at server/engine/channels/message-channel.ts
// 替代原 stub（返回 undefined 会导致 host-hook-attachments.ts 中的投递校验静默失败）
// 参考 openclaw/src/utils/message-channel.ts
export {
  isDeliverableMessageChannel,
  normalizeMessageChannel,
} from "../channels/message-channel.js";
