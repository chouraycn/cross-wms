// 操作员日志与 SDK 辅助函数使用的有界可读字符串采样
// 注意：本模块刻意按人类可读而非机器解析的格式输出
/** 用逗号分隔的字符串项有界采样，并附带隐藏计数后缀 */
export function summarizeStringEntries(params: {
  /** 待采样的项；nullish 视为空列表 */
  entries?: ReadonlyArray<string> | null;
  /** 最大可见项数；非有限值使用默认值，小于 1 的值夹到 1 */
  limit?: number;
  /** 无项时返回的文本 */
  emptyText?: string;
}): string {
  const entries = params.entries ?? [];
  if (entries.length === 0) {
    return params.emptyText ?? "";
  }
  const rawLimit = params.limit ?? 6;
  // 即使调用方传入错误的 limit 也保持摘要可用
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.floor(rawLimit)) : 6;
  const sample = entries.slice(0, limit);
  const suffix = entries.length > sample.length ? ` (+${entries.length - sample.length})` : "";
  return `${sample.join(", ")}${suffix}`;
}
