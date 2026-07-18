/**
 * 数值选项解析 — 用于 CLI 和 config 的共享边界
 * 参考 openclaw/src/infra/numeric-options.ts 与 normalization-core/number-coercion
 */

function isFiniteInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

/** 解析非负整数选项，无效时返回 fallback */
export function resolveNonNegativeIntegerOption(value: number, fallback: number): number {
  if (!isFiniteInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

/** 解析带最小边界的整数选项，无效或低于最小值时返回 fallback */
export function resolveIntegerOption(
  value: number,
  fallback: number,
  params: { min: number },
): number {
  if (!isFiniteInteger(value) || value < params.min) {
    return fallback;
  }
  return value;
}
