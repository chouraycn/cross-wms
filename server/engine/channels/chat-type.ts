/**
 * Channel 会话类型规范化 — 将 channel 专用的 direct/group/channel 标签映射为 cross-wms 的 chat types
 *
 * 参考 openclaw/src/channels/chat-type.ts
 */
import { normalizeOptionalLowercaseString } from "../infra/string-coerce.js";

/** channel 路由、sessions 与 SDK helpers 共享的规范化会话类型 */
export type ChatType = "direct" | "group" | "channel";

/** 将 channel 专用的 chat type 标签规范化为 cross-wms 的会话类型 */
export function normalizeChatType(raw?: string): ChatType | undefined {
  const value = normalizeOptionalLowercaseString(raw);
  if (!value) {
    return undefined;
  }
  if (value === "direct" || value === "dm") {
    return "direct";
  }
  if (value === "group") {
    return "group";
  }
  if (value === "channel") {
    return "channel";
  }
  return undefined;
}
