// 系统消息使用稳定的前缀，这样生成的系统事件在纯聊天记录中
// 可以无需额外元数据即可识别。
export const SYSTEM_MARK = "⚙️";

function normalizeSystemText(value: string): string {
  return value.trim();
}

/** 当文本已携带系统消息前缀时返回 true。 */
export function hasSystemMark(text: string): boolean {
  return normalizeSystemText(text).startsWith(SYSTEM_MARK);
}

/** 为非空文本添加系统消息前缀，避免重复添加。 */
export function prefixSystemMessage(text: string): string {
  const normalized = normalizeSystemText(text);
  if (!normalized) {
    return normalized;
  }
  if (hasSystemMark(normalized)) {
    return normalized;
  }
  return `${SYSTEM_MARK} ${normalized}`;
}
