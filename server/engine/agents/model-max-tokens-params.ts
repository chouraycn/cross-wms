/**
 * 跨 provider/原生命名的 max-token 参数规范化。
 *
 * 调用方在分发前将别名统一为 maxTokens，避免同一负载中携带冲突的限值。
 */
const MAX_TOKENS_PARAM_KEYS = ["maxTokens", "max_completion_tokens", "max_tokens"] as const;

/** 返回有限非负的 max-token 值；输入无效时返回 undefined。 */
function resolveNonNegativeMaxTokensParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** 解析参数对象中首个受支持的 max-token 参数。 */
export function resolveMaxTokensParam(
  params: Record<string, unknown> | undefined,
): number | undefined {
  if (!params) {
    return undefined;
  }
  for (const key of MAX_TOKENS_PARAM_KEYS) {
    const resolved = resolveNonNegativeMaxTokensParam(params[key]);
    if (resolved !== undefined) {
      return resolved;
    }
  }
  return undefined;
}

/**
 * 将合并后的参数规范化为 maxTokens，按从左到右的源对象顺序保留优先级。
 */
export function canonicalizeMaxTokensParam(params: {
  merged: Record<string, unknown>;
  sources: Array<Record<string, unknown> | undefined>;
}): void {
  let resolved: number | undefined;
  for (const source of params.sources) {
    const sourceValue = resolveMaxTokensParam(source);
    if (sourceValue !== undefined) {
      resolved = sourceValue;
    }
  }
  if (resolved === undefined) {
    return;
  }
  // 写入规范键之前先删除所有拼写，避免调用方在一条负载中发送冲突的 provider 别名。
  for (const key of MAX_TOKENS_PARAM_KEYS) {
    delete params.merged[key];
  }
  params.merged.maxTokens = resolved;
}
