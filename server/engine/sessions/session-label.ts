/**
 * 用户可编辑的会话标签 — 短展示字符串保存在会话元数据中
 *
 * 解析器返回结构化错误，便于 CLI/API 调用方处理。
 *
 * 参考 openclaw/src/sessions/session-label.ts
 */

export const SESSION_LABEL_MAX_LENGTH = 512;

export type ParsedSessionLabel =
  | { ok: true; label: string }
  | { ok: false; error: string };

/**
 * 解析会话标签输入
 *
 * - 必须为字符串
 * - 去除首尾空白后不得为空
 * - 长度不得超过 SESSION_LABEL_MAX_LENGTH
 */
export function parseSessionLabel(raw: unknown): ParsedSessionLabel {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'invalid label: must be a string' };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'invalid label: empty' };
  }
  if (trimmed.length > SESSION_LABEL_MAX_LENGTH) {
    return {
      ok: false,
      error: `invalid label: too long (max ${SESSION_LABEL_MAX_LENGTH})`,
    };
  }
  return { ok: true, label: trimmed };
}
