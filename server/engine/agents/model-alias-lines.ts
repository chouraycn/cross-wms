/**
 * 为 prompt 可见的模型引导格式化已配置的模型别名。
 *
 * 注意：原 openclaw 实现依赖：
 *   - @openclaw/normalization-core/string-coerce 中的 normalizeOptionalString
 *   - config/types.openclaw.js 中的 OpenClawConfig
 * 本地降级实现：normalizeOptionalString 内联为 trim+空串转 undefined；
 * OpenClawConfig 视为 unknown，仅做运行时字段访问。
 */

// OpenClawConfig 在本地未完整移植，这里以 unknown 降级处理。
type OpenClawConfig = unknown;

// 内联降级实现：返回去 whitespace 后的字符串，空串视为 undefined。
function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** 为已配置的模型别名构建确定性 prompt 行。 */
export function buildModelAliasLines(cfg?: OpenClawConfig): string[] {
  const models = readAgentDefaultModels(cfg);
  const entries: Array<{ alias: string; model: string }> = [];
  for (const [keyRaw, entryRaw] of Object.entries(models)) {
    const model = normalizeOptionalString(keyRaw) ?? "";
    if (!model) {
      continue;
    }
    const alias =
      normalizeOptionalString((entryRaw as { alias?: string } | undefined)?.alias) ?? "";
    if (!alias) {
      continue;
    }
    entries.push({ alias, model });
  }
  return entries
    .toSorted((a, b) => a.alias.localeCompare(b.alias))
    .map((entry) => `- ${entry.alias}: ${entry.model}`);
}

// 降级访问 cfg.agents?.defaults?.models；OpenClawConfig 类型未本地化。
function readAgentDefaultModels(cfg: unknown): Record<string, unknown> {
  if (!cfg || typeof cfg !== "object") {
    return {};
  }
  const agents = (cfg as { agents?: unknown }).agents;
  if (!agents || typeof agents !== "object") {
    return {};
  }
  const defaults = (agents as { defaults?: unknown }).defaults;
  if (!defaults || typeof defaults !== "object") {
    return {};
  }
  const models = (defaults as { models?: unknown }).models;
  if (!models || typeof models !== "object") {
    return {};
  }
  return models as Record<string, unknown>;
}
