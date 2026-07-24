/**
 * 数值处理工具函数
 *
 * 移植自 openclaw/src/utils.ts（clampInt）。
 * 注意：cross-wms 已有 shared/number-coercion.ts 中的 clampNumber（4 参 + fallback），
 * 语义不同，故此处保持 openclaw 原始的简单三参形式并内联 clamp 逻辑。
 */

/**
 * 先向下取整，再钳制到闭区间 [min, max]。
 *
 * @source openclaw/src/utils.ts → clampInt
 * @param value 原始数值
 * @param min 最小值（含）
 * @param max 最大值（含）
 * @returns 钳制后的整数
 */
export function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
