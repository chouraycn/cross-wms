/**
 * 线束策略解析 — 参考 OpenClaw harness/policy.ts
 * 
 * 根据模型、Provider、配置解析出应该使用的线束策略。
 * 支持来源优先级：model > provider > config > implicit
 */

/** 运行时类型 */
export type HarnessRuntime = 'auto' | 'builtin' | 'codex' | 'custom';

/** 线束策略 */
export interface HarnessPolicy {
  /** 运行时类型 */
  runtime: HarnessRuntime;
  /** 策略来源 */
  runtimeSource: 'model' | 'provider' | 'config' | 'implicit';
}

/** Provider 到默认运行时的映射 */
const PROVIDER_DEFAULT_RUNTIME: Record<string, HarnessRuntime> = {
  openai: 'builtin',
  anthropic: 'builtin',
  google: 'builtin',
  deepseek: 'builtin',
  qwen: 'builtin',
  zhipu: 'builtin',
  moonshot: 'builtin',
  yi: 'builtin',
  baichuan: 'builtin',
  minimax: 'builtin',
  ollama: 'builtin',
  openrouter: 'builtin',
  siliconflow: 'builtin',
  volcengine: 'builtin',
};

/** 模型 ID 到运行时的特殊映射 */
const MODEL_RUNTIME_OVERRIDES: Record<string, HarnessRuntime> = {
  // OpenAI Codex 模型使用 codex 运行时
  'o3-mini': 'builtin',
  'o1-preview': 'builtin',
  'o1-mini': 'builtin',
};

/** 解析线束策略 */
export function resolveHarnessPolicy(params: {
  provider?: string;
  modelId?: string;
  config?: Record<string, unknown>;
  agentId?: string;
  sessionKey?: string;
}): HarnessPolicy {
  const { provider, modelId, config } = params;

  // 1. 从配置中解析运行时策略
  const configRuntime = resolveConfigRuntime(config);
  if (configRuntime) {
    return {
      runtime: configRuntime,
      runtimeSource: 'config',
    };
  }

  // 2. 从模型 ID 解析运行时
  if (modelId) {
    const modelRuntime = MODEL_RUNTIME_OVERRIDES[modelId.toLowerCase()];
    if (modelRuntime) {
      return {
        runtime: modelRuntime,
        runtimeSource: 'model',
      };
    }
  }

  // 3. 从 Provider 解析默认运行时
  if (provider) {
    const providerRuntime = PROVIDER_DEFAULT_RUNTIME[provider.toLowerCase()];
    if (providerRuntime) {
      return {
        runtime: providerRuntime,
        runtimeSource: 'provider',
      };
    }
  }

  // 4. 隐式默认
  return {
    runtime: 'auto',
    runtimeSource: 'implicit',
  };
}

/** 从配置对象中解析运行时 */
function resolveConfigRuntime(config?: Record<string, unknown>): HarnessRuntime | undefined {
  if (!config) return undefined;

  // 检查 agent.harness.runtime
  const agentConfig = config.agent as Record<string, unknown> | undefined;
  if (agentConfig?.harness && typeof agentConfig.harness === 'object') {
    const harnessConfig = agentConfig.harness as Record<string, unknown>;
    if (typeof harnessConfig.runtime === 'string') {
      return normalizeRuntime(harnessConfig.runtime);
    }
  }

  // 检查顶层 harness.runtime
  const harnessConfig = config.harness as Record<string, unknown> | undefined;
  if (harnessConfig && typeof harnessConfig.runtime === 'string') {
    return normalizeRuntime(harnessConfig.runtime);
  }

  return undefined;
}

/** 规范化运行时字符串 */
function normalizeRuntime(value: string): HarnessRuntime {
  const lower = value.toLowerCase().trim();
  if (lower === 'builtin' || lower === 'embedded') return 'builtin';
  if (lower === 'codex') return 'codex';
  if (lower === 'custom') return 'custom';
  return 'auto';
}

/** 判断是否需要自动选择线束 */
export function needsAutoSelection(policy: HarnessPolicy): boolean {
  return policy.runtime === 'auto';
}
