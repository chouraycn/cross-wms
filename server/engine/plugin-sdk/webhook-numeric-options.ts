/**
 * Webhook 数值选项解析 — 将 webhook 配置中的数值参数解析为有限整数
 *
 * 参考 openclaw/src/plugin-sdk/webhook-numeric-options.ts
 */

/** 将 webhook 数值选项解析为带最小边界的有限整数。 */
export function resolveWebhookIntegerOption(
  value: number | undefined,
  fallback: number,
  params: { min: number },
): number {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(params.min, Math.floor(candidate));
}
