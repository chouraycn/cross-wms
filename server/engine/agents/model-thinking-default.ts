import { z } from 'zod';
import { logger } from '../../logger.js';

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
