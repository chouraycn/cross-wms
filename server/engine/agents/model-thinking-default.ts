import { z } from 'zod';
import { logger } from '../../logger.js';
import type { OpenClawConfig } from '../config/types.openclaw.js';
import { type ThinkLevel, normalizeThinkLevel } from '../thinkingMode.js';

export const ThinkingModeSchema = z.enum(['disabled', 'low', 'medium', 'high', 'max']);

export type ThinkingMode = z.infer<typeof ThinkingModeSchema>;

export const ThinkingConfigSchema = z.object({
  mode: ThinkingModeSchema.default('disabled'),
  budgetTokens: z.number().optional(),
  maxThinkingTokens: z.number().optional(),
  temperature: z.number().optional(),
  enabled: z.boolean().default(false),
});

export type ThinkingConfig = z.infer<typeof ThinkingConfigSchema>;

export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  mode: 'disabled',
  enabled: false,
};

const thinkingPresets: Record<ThinkingMode, ThinkingConfig> = {
  disabled: {
    mode: 'disabled',
    enabled: false,
  },
  low: {
    mode: 'low',
    budgetTokens: 1024,
    maxThinkingTokens: 1024,
    enabled: true,
  },
  medium: {
    mode: 'medium',
    budgetTokens: 4096,
    maxThinkingTokens: 4096,
    enabled: true,
  },
  high: {
    mode: 'high',
    budgetTokens: 8192,
    maxThinkingTokens: 8192,
    enabled: true,
  },
  max: {
    mode: 'max',
    budgetTokens: 16384,
    maxThinkingTokens: 16384,
    enabled: true,
  },
};

export function getDefaultThinkingConfig(mode?: ThinkingMode): ThinkingConfig {
  const preset = mode ? thinkingPresets[mode] : DEFAULT_THINKING_CONFIG;
  return { ...preset };
}

export function createThinkingConfig(params: Partial<ThinkingConfig> & { mode?: ThinkingMode } = {}): ThinkingConfig {
  const base = params.mode ? thinkingPresets[params.mode] : DEFAULT_THINKING_CONFIG;
  
  const config: ThinkingConfig = {
    ...base,
    ...params,
    enabled: params.enabled ?? base.enabled,
  };

  const result = ThinkingConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid thinking config: ${result.error.message}`);
  }

  return result.data;
}

export function isThinkingEnabled(config: ThinkingConfig): boolean {
  return config.enabled && config.mode !== 'disabled';
}

export function getThinkingBudget(config: ThinkingConfig): number | undefined {
  if (!isThinkingEnabled(config)) return undefined;
  return config.budgetTokens ?? config.maxThinkingTokens;
}

export function adjustThinkingForModel(
  config: ThinkingConfig,
  maxModelTokens: number,
): ThinkingConfig {
  if (!isThinkingEnabled(config)) return config;

  const safeMaxTokens = Math.floor(maxModelTokens * 0.5);
  
  return {
    ...config,
    maxThinkingTokens: config.maxThinkingTokens 
      ? Math.min(config.maxThinkingTokens, safeMaxTokens)
      : safeMaxTokens,
    budgetTokens: config.budgetTokens
      ? Math.min(config.budgetTokens, safeMaxTokens)
      : safeMaxTokens,
  };
}

export function getThinkingModeDescription(mode: ThinkingMode): string {
  const descriptions: Record<ThinkingMode, string> = {
    disabled: '思考模式已禁用',
    low: '低思考深度（约 1k tokens）',
    medium: '中等思考深度（约 4k tokens）',
    high: '高思考深度（约 8k tokens）',
    max: '最大思考深度（约 16k tokens）',
  };
  return descriptions[mode];
}

export function listThinkingModes(): ThinkingMode[] {
  return ['disabled', 'low', 'medium', 'high', 'max'];
}

logger.debug('[Agents:ModelThinkingDefault] Module loaded');

// ===================== 思考级别默认值解析 (config-driven) =====================

/**
 * Provider 族：未显式配置时，推理模型默认启用的思考级别。
 * Anthropic 系（含 Vertex / Bedrock / Claude CLI）默认 adaptive，其余默认 medium。
 */
const ADAPTIVE_PROVIDERS = new Set<string>([
  'anthropic',
  'anthropic-vertex',
  'amazon-bedrock',
  'claude-cli',
]);

function defaultLevelForReasoningProvider(provider: string): ThinkLevel {
  const p = provider.toLowerCase().trim();
  return ADAPTIVE_PROVIDERS.has(p) ? 'adaptive' : 'medium';
}

/**
 * 解析指定 provider/model 的默认思考级别。
 *
 * 优先级：
 *   1. 单模型显式覆盖 `agents.defaults.models["provider/model"].params.thinking`
 *   2. 全局 `agents.defaults.thinkingDefault`
 *   3. 显式 provider 模型配置 `models.providers[provider].models[]` 的 reasoning 标志
 *   4. 若该模型就是用户配置的 primary 默认模型 → off（不自动思考）
 *   5. catalog 条目中的 reasoning 标志
 *   6. 兜底：按 provider 族返回 adaptive / medium
 */
export function resolveThinkingDefault(params: {
  cfg?: OpenClawConfig;
  provider: string;
  model: string;
  catalog?: Array<{ provider: string; id: string; name?: string; reasoning?: boolean }>;
}): ThinkLevel {
  const { cfg, provider, model, catalog } = params;
  const modelRef = `${provider}/${model}`;
  // cfg 为开放配置对象，深层字段在不同版本 schema 中形态不一，这里用宽松访问避免类型耦合。
  const c: any = cfg ?? {};
  const agentDefaults = c.agents?.defaults;

  // 1. 单模型显式覆盖
  const perModelConfig =
    agentDefaults?.models?.[modelRef]?.params?.thinking ??
    agentDefaults?.models?.[model]?.params?.thinking;
  if (perModelConfig !== undefined && perModelConfig !== null) {
    if (perModelConfig === false) return 'off';
    const raw = String(perModelConfig).toLowerCase().trim();
    if (['disabled', 'none', 'off', 'false', 'no', '0'].includes(raw)) return 'off';
    const normalized = normalizeThinkLevel(raw);
    if (normalized) return normalized;
  }

  // 2. 全局 thinkingDefault
  const globalDefault = agentDefaults?.thinkingDefault;
  if (globalDefault) {
    const normalized = normalizeThinkLevel(String(globalDefault));
    if (normalized) return normalized;
  }

  // 3. 显式 provider 模型配置
  const providerModels = c.models?.providers?.[provider]?.models;
  if (Array.isArray(providerModels)) {
    const entry = providerModels.find((m) => m && m.id === model);
    if (entry && entry.reasoning === false) return 'off';
    if (entry && entry.reasoning === true) return defaultLevelForReasoningProvider(provider);
  }

  // 4. 该模型即用户配置的 primary 默认模型 → 默认关闭思考
  const primary = agentDefaults?.model?.primary;
  if (typeof primary === 'string' && primary.trim() === modelRef) {
    return 'off';
  }

  // 5. catalog 驱动的 reasoning 检测
  const catalogEntry = catalog?.find(
    (e) =>
      e.provider.toLowerCase() === provider.toLowerCase() &&
      (e.id === model || e.id === modelRef),
  );
  if (catalogEntry) {
    if (catalogEntry.reasoning === false) return 'off';
    if (catalogEntry.reasoning === true) return defaultLevelForReasoningProvider(provider);
  }

  // 6. 兜底：按 provider 族返回默认级别
  return defaultLevelForReasoningProvider(provider);
}

/**
 * 异步版：先通过 loadModelCatalog 拉取运行时模型目录，再解析默认思考级别。
 */
export async function resolveThinkingDefaultWithRuntimeCatalog(params: {
  cfg?: OpenClawConfig;
  provider: string;
  model: string;
  loadModelCatalog: () => Promise<
    Array<{ provider: string; id: string; reasoning?: boolean }>
  >;
}): Promise<ThinkLevel> {
  let catalog: Array<{ provider: string; id: string; reasoning?: boolean }> = [];
  try {
    catalog = (await params.loadModelCatalog()) ?? [];
  } catch (err) {
    logger.warn(`[resolveThinkingDefaultWithRuntimeCatalog] loadModelCatalog failed: ${String(err)}`);
    catalog = [];
  }
  return resolveThinkingDefault({
    cfg: params.cfg,
    provider: params.provider,
    model: params.model,
    catalog,
  });
}
