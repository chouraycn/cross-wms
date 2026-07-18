/**
 * 数字强制转换 facade — 旧版 core 内部导入使用
 *
 * 参考 openclaw/src/shared/number-coercion.ts 与
 *       openclaw/packages/normalization-core/number-coercion.ts
 */

/** 解析非负整数，输入非有限或为负返回 undefined */
export function resolveNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

/** 解析非负有限数，输入非有限或为负返回 undefined */
export function resolveNonNegativeNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** 将数字钳制到 [min, max]，输入非有限返回 fallback */
export function clampNumber(
  value: number | null | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * 将定时器超时毫秒数钳制到安全正数。
 * 返回 undefined 表示应跳过该次定时器调度（输入为 0 或非有限）。
 */
export function clampPositiveTimerTimeoutMs(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.min(value, 2_147_483_647);
}

/**
 * 解析定时器超时毫秒数，输入非有限或 ≤ 0 时使用 fallback。
 * 与 clampPositiveTimerTimeoutMs 的区别是永远返回正数，不会返回 undefined。
 *
 * 支持可选的 `floor` 参数：当主 fallback 与 floor 同时为非正时返回 floor。
 */
export function resolveTimerTimeoutMs(
  value: number | null | undefined,
  fallback: number,
  floor?: number,
): number {
  const resolved = clampPositiveTimerTimeoutMs(value);
  if (resolved !== undefined) {
    return resolved;
  }
  const primary = Math.max(1, Math.floor(fallback));
  if (floor === undefined) {
    return primary;
  }
  // 当主 fallback 为非正时回退到 floor（仍保证至少 1ms）
  if (fallback <= 0) {
    return Math.max(1, Math.floor(floor));
  }
  return primary;
}
