// Gateway control-reply 文本分类器。
// 在内部 auto-reply token 泄漏到聊天表面之前抑制它们。
// 移植自 openclaw/src/gateway/control-reply-text.ts。
// 依赖调整：../auto-reply/tokens.js → 本地 _openclaw-stubs.ts（auto-reply 模块未移植）。
import { isSilentReplyText, SILENT_REPLY_TOKEN } from "./_openclaw-stubs.js";

const SUPPRESSED_CONTROL_REPLY_TOKENS = [
  SILENT_REPLY_TOKEN,
  "ANNOUNCE_SKIP",
  "REPLY_SKIP",
] as const;

const MIN_BARE_PREFIX_LENGTH_BY_TOKEN: Readonly<
  Record<(typeof SUPPRESSED_CONTROL_REPLY_TOKENS)[number], number>
> = {
  [SILENT_REPLY_TOKEN]: 2,
  ANNOUNCE_SKIP: 3,
  REPLY_SKIP: 3,
};

function normalizeSuppressedControlReplyFragment(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed.toUpperCase();
  if (/[^A-Z_]/.test(normalized)) {
    return "";
  }
  return normalized;
}

/** 当一个聊天可见回复恰好是内部 control token 时返回 true。 */
export function isSuppressedControlReplyText(text: string): boolean {
  const normalized = text.trim();
  return SUPPRESSED_CONTROL_REPLY_TOKENS.some((token) => isSilentReplyText(normalized, token));
}

/** 当流式 assistant 文本看起来像 control token 的前导片段时返回 true。 */
export function isSuppressedControlReplyLeadFragment(text: string): boolean {
  const trimmed = text.trim();
  const normalized = normalizeSuppressedControlReplyFragment(text);
  if (!normalized) {
    return false;
  }
  return SUPPRESSED_CONTROL_REPLY_TOKENS.some((token) => {
    const tokenUpper = token.toUpperCase();
    if (normalized === tokenUpper) {
      return false;
    }
    if (!tokenUpper.startsWith(normalized)) {
      return false;
    }
    if (normalized.includes("_")) {
      return true;
    }
    if (token !== SILENT_REPLY_TOKEN && trimmed !== trimmed.toUpperCase()) {
      return false;
    }
    // 流式时裸片段很常见。要求最小前缀，使普通单词不会仅因开头像 token 而消失。
    return normalized.length >= MIN_BARE_PREFIX_LENGTH_BY_TOKEN[token];
  });
}
