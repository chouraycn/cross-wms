/**
 * 选择本地 Gateway TCP 端口的 CLI flag 共享解析器。
 *
 * 降级说明：原实现依赖 ../infra/parse-finite-number.js 的
 * parseStrictPositiveInteger，cross-wms 暂未移植该模块，这里以本地实现替代。
 */

const MAX_TCP_PORT = 65_535;

/** 将字符串解析为严格正整数，无法解析或超出安全整数范围时返回 undefined。 */
function parseStrictPositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num <= 0) {
    return undefined;
  }
  return num;
}

export function parseGatewayPortOption(raw: unknown, flagName = "--port"): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const value =
    typeof raw === "string"
      ? raw.trim()
      : typeof raw === "number" || typeof raw === "bigint"
        ? String(raw)
        : "";
  if (!value) {
    return undefined;
  }

  const parsed = parseStrictPositiveInteger(value);
  if (parsed === undefined || parsed > MAX_TCP_PORT) {
    throw new Error(`${flagName} must be an integer between 1 and ${MAX_TCP_PORT}.`);
  }
  return parsed;
}
