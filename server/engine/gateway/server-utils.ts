// Gateway 通用服务器工具。
// 移植自 openclaw/src/gateway/server-utils.ts
//
// 适配说明：
//  - @openclaw/normalization-core/string-normalization → ../infra/string-coerce.js
//    （normalizeTrimmedStringList 在 cross-wms string-coerce 中不存在，此处内联实现）
//  - ../infra/voicewake.js → ../infra/voicewake.js（cross-wms 已移植，含 defaultVoiceWakeTriggers）

import { normalizeOptionalString } from "../infra/string-coerce.js";
import { defaultVoiceWakeTriggers } from "../infra/voicewake.js";

/**
 * 将任意输入规范化为去重排序后的 trimmed 字符串列表。
 *
 * 内联实现：openclaw 的 @openclaw/normalization-core/string-normalization 提供
 * normalizeTrimmedStringList，但 cross-wms 的 string-coerce 尚未包含此函数。
 * 行为与 openclaw 一致：字符串按逗号/换行拆分，数组逐项处理，trim 后去重排序。
 */
function normalizeTrimmedStringList(input: unknown): string[] {
  if (input == null) {
    return [];
  }
  if (typeof input === "string") {
    return input
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
  if (Array.isArray(input)) {
    const seen = new Set<string>();
    for (const item of input) {
      const normalized = normalizeOptionalString(item);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
      }
    }
    return [...seen].sort();
  }
  return [];
}

/** 规范化 voice-wake 触发词配置，限制数量与长度并提供默认值。 */
export function normalizeVoiceWakeTriggers(input: unknown): string[] {
  const cleaned = normalizeTrimmedStringList(input)
    .slice(0, 32)
    .map((value) => value.slice(0, 64));
  return cleaned.length > 0 ? cleaned : defaultVoiceWakeTriggers();
}

/** 格式化未知 gateway 错误，不会因异常的 status/code 形状而抛出。 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  const statusValue = (err as { status?: unknown })?.status;
  const codeValue = (err as { code?: unknown })?.code;
  const hasStatus = statusValue !== undefined;
  const hasCode = codeValue !== undefined;
  if (hasStatus || hasCode) {
    const statusText =
      typeof statusValue === "string" || typeof statusValue === "number"
        ? String(statusValue)
        : "unknown";
    const codeText =
      typeof codeValue === "string" || typeof codeValue === "number"
        ? String(codeValue)
        : "unknown";
    return `status=${statusText} code=${codeText}`;
  }
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}
