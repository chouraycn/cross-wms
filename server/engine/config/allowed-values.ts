// 移植自 openclaw/src/config/allowed-values.ts
// 定义配置校验和文档使用的允许值元数据。
//
// 降级说明：源文件依赖 @openclaw/normalization-core/string-coerce 的
// normalizeLowercaseStringOrEmpty。此处内联等价实现。

/** 内联降级实现：将输入归一化为小写字符串，非字符串返回空串。 */
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

const MAX_ALLOWED_VALUES_HINT = 12;
const MAX_ALLOWED_VALUE_CHARS = 160;

type AllowedValuesSummary = {
  values: string[];
  hiddenCount: number;
  formatted: string;
};

function truncateHintText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}... (+${text.length - limit} chars)`;
}

function safeStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
    // 值不可 JSON 序列化时回退到字符串强转。
  }
  return String(value);
}

function toAllowedValueLabel(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(truncateHintText(value, MAX_ALLOWED_VALUE_CHARS));
  }
  return truncateHintText(safeStringify(value), MAX_ALLOWED_VALUE_CHARS);
}

function toAllowedValueValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return safeStringify(value);
}

function toAllowedValueDedupKey(value: unknown): string {
  if (value === null) {
    return 'null:null';
  }
  const kind = typeof value;
  // 保留 schema 区分，例如数字 1 与字符串 "1"，即使标签匹配也不同。
  if (kind === 'string') {
    return `string:${value as string}`;
  }
  return `${kind}:${safeStringify(value)}`;
}

/** 为紧凑的校验错误提示汇总枚举/允许值候选项。 */
export function summarizeAllowedValues(
  values: ReadonlyArray<unknown>,
): AllowedValuesSummary | null {
  if (values.length === 0) {
    return null;
  }

  const deduped: Array<{ value: string; label: string }> = [];
  const seenValues = new Set<string>();
  for (const item of values) {
    const dedupeKey = toAllowedValueDedupKey(item);
    if (seenValues.has(dedupeKey)) {
      continue;
    }
    seenValues.add(dedupeKey);
    deduped.push({
      value: toAllowedValueValue(item),
      label: toAllowedValueLabel(item),
    });
  }

  const shown = deduped.slice(0, MAX_ALLOWED_VALUES_HINT);
  const hiddenCount = deduped.length - shown.length;
  const formattedCore = shown.map((entry) => entry.label).join(', ');
  const formatted =
    hiddenCount > 0 ? `${formattedCore}, ... (+${hiddenCount} more)` : formattedCore;

  return {
    values: shown.map((entry) => entry.value),
    hiddenCount,
    formatted,
  };
}

function messageAlreadyIncludesAllowedValues(message: string): boolean {
  const lower = normalizeLowercaseStringOrEmpty(message);
  return lower.includes('(allowed:') || lower.includes('expected one of');
}

/** 除非校验消息中已包含允许值提示，否则追加一个允许值提示。 */
export function appendAllowedValuesHint(message: string, summary: AllowedValuesSummary): string {
  if (messageAlreadyIncludesAllowedValues(message)) {
    return message;
  }
  return `${message} (allowed: ${summary.formatted})`;
}
