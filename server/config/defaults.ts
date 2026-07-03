// 默认值层
// 参考 openclaw/src/config/defaults.ts 的设计，按维度拆分多个 apply*Defaults 函数，
// 各自负责一个配置维度（消息、会话、模型、Agent、Cron、日志、上下文裁剪、压缩）

// ============================================================================
// 类型定义（最小化的配置类型，避免引入完整的 OpenClawConfig）
// ============================================================================

export type CrossWmsConfig = {
  messages?: {
    ackReactionScope?: string;
    [key: string]: unknown;
  } | null;
  session?: {
    mainKey?: string;
    [key: string]: unknown;
  } | null;
  models?: {
    default?: string;
    providers?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  agents?: {
    defaults?: {
      maxConcurrent?: number;
      model?: string | { primary?: string; fallbacks?: string[] };
      models?: Record<string, { alias?: string }>;
      subagents?: {
        maxConcurrent?: number;
        archiveAfterMinutes?: number;
      };
      compaction?: {
        mode?: string;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    list?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  } | null;
  cron?: {
    maxConcurrentRuns?: number;
    [key: string]: unknown;
  } | null;
  logging?: {
    level?: string;
    redactSensitive?: string | boolean;
    [key: string]: unknown;
  } | null;
  talk?: Record<string, unknown> | null;
  [key: string]: unknown;
};

// ============================================================================
// 模型别名表
// ============================================================================

// 模型别名 → 规范化 provider/modelId 映射
// 参考 openclaw defaults.ts 的 DEFAULT_MODEL_ALIASES
export const DEFAULT_MODEL_ALIASES: Readonly<Record<string, string>> = {
  // Anthropic
  opus: 'anthropic/claude-opus-4-8',
  sonnet: 'anthropic/claude-sonnet-4-6',

  // OpenAI
  gpt: 'openai/gpt-5.4',
  'gpt-mini': 'openai/gpt-5.4-mini',
  'gpt-nano': 'openai/gpt-5.4-nano',

  // Google Gemini
  gemini: 'google/gemini-3.1-pro-preview',
  'gemini-flash': 'google/gemini-3-flash-preview',
  'gemini-flash-lite': 'google/gemini-3.1-flash-lite',

  // DeepSeek / Moonshot / Qwen
  deepseek: 'deepseek/deepseek-chat',
  moonshot: 'moonshot/moonshot-v1-32k',
  qwen: 'qwen/qwen-max',
};

// ============================================================================
// 维度默认值常量
// ============================================================================

const DEFAULT_AGENT_MAX_CONCURRENT = 4;
const DEFAULT_SUBAGENT_MAX_CONCURRENT = 2;
const DEFAULT_SUBAGENT_ARCHIVE_AFTER_MINUTES = 30;
const DEFAULT_CRON_MAX_CONCURRENT_RUNS = 4;
const DEFAULT_CONTEXT_TOKENS = 200_000;
const DEFAULT_MODEL_MAX_TOKENS = 8192;
const DEFAULT_MODEL_INPUT: string[] = ['text'];
const DEFAULT_COMPACTION_MODE = 'safeguard';

// ============================================================================
// 工具函数
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ============================================================================
// 消息默认值
// ============================================================================

export function applyMessageDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  const messages = cfg.messages;
  const hasAckScope = messages?.ackReactionScope !== undefined;
  if (hasAckScope) {
    return cfg;
  }
  const nextMessages = messages ? { ...messages } : {};
  nextMessages.ackReactionScope = 'group-mentions';
  return { ...cfg, messages: nextMessages };
}

// ============================================================================
// 会话默认值
// ============================================================================

export function applySessionDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  const session = cfg.session;
  if (!session || session.mainKey === undefined) {
    return cfg;
  }
  // 主会话键始终规范为 "main"，忽略用户设置
  return {
    ...cfg,
    session: { ...session, mainKey: 'main' },
  };
}

// ============================================================================
// 模型默认值
// ============================================================================

// 解析模型引用，将别名展开为规范化的 provider/modelId
export function normalizeAgentModelRefForConfig(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  // 已包含 provider/ 前缀的视为规范引用，原样返回
  if (trimmed.includes('/')) {
    return trimmed;
  }
  const aliased = DEFAULT_MODEL_ALIASES[trimmed];
  return aliased ?? trimmed;
}

function normalizeAgentModelConfigForDefaults(value: unknown): unknown {
  if (typeof value === 'string') {
    const normalized = normalizeAgentModelRefForConfig(value);
    return normalized === value ? value : normalized;
  }
  if (!isRecord(value)) {
    return value;
  }
  let mutated = false;
  const next: Record<string, unknown> = { ...value };
  if (typeof value.primary === 'string') {
    const primary = normalizeAgentModelRefForConfig(value.primary);
    if (primary !== value.primary) {
      next.primary = primary;
      mutated = true;
    }
  }
  if (Array.isArray(value.fallbacks)) {
    const rawFallbacks = value.fallbacks;
    const fallbacks = rawFallbacks.map((fallback) =>
      typeof fallback === 'string' ? normalizeAgentModelRefForConfig(fallback) : fallback,
    );
    if (fallbacks.some((fallback, index) => fallback !== rawFallbacks[index])) {
      next.fallbacks = fallbacks;
      mutated = true;
    }
  }
  return mutated ? next : value;
}

export function applyModelDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  let nextCfg = cfg;

  // 规范化 agents.list 中每个 agent 的 model / models 引用
  const rawAgentList = nextCfg.agents?.list;
  if (Array.isArray(rawAgentList)) {
    let listMutated = false;
    const agentList = rawAgentList.map((agent) => {
      if (!isRecord(agent)) {
        return agent;
      }
      let nextAgent = agent;
      if (Object.prototype.hasOwnProperty.call(agent, 'model')) {
        const normalizedModel = normalizeAgentModelConfigForDefaults(agent.model);
        if (normalizedModel !== agent.model) {
          nextAgent = { ...nextAgent, model: normalizedModel };
          listMutated = true;
        }
      }
      if (isRecord(agent.models)) {
        const normalizedModels: Record<string, { alias?: string }> = {};
        let modelsMutated = false;
        for (const [key, entry] of Object.entries(agent.models)) {
          if (isRecord(entry)) {
            normalizedModels[key] = { ...entry } as { alias?: string };
          } else {
            normalizedModels[key] = entry as { alias?: string };
            modelsMutated = true;
          }
        }
        if (modelsMutated) {
          nextAgent = { ...nextAgent, models: normalizedModels };
          listMutated = true;
        }
      }
      return nextAgent;
    });
    if (listMutated) {
      nextCfg = {
        ...nextCfg,
        agents: { ...nextCfg.agents, list: agentList },
      };
    }
  }

  // 为 agents.defaults.models 中已存在的目标模型补全别名
  const existingAgent = nextCfg.agents?.defaults;
  if (!existingAgent) {
    return nextCfg;
  }

  const rawExistingModels = existingAgent.models ?? {};
  if (Object.keys(rawExistingModels).length === 0) {
    return nextCfg;
  }

  const nextModels: Record<string, { alias?: string }> = { ...rawExistingModels };
  let mutated = false;

  for (const [alias, target] of Object.entries(DEFAULT_MODEL_ALIASES)) {
    const entry = nextModels[target];
    if (!entry) {
      continue;
    }
    if (entry.alias !== undefined) {
      continue;
    }
    nextModels[target] = { ...entry, alias };
    mutated = true;
  }

  if (!mutated) {
    return nextCfg;
  }

  return {
    ...nextCfg,
    agents: {
      ...nextCfg.agents,
      defaults: { ...existingAgent, models: nextModels },
    },
  };
}

// ============================================================================
// Agent 默认值
// ============================================================================

export function applyAgentDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  const agents = cfg.agents;
  const defaults = agents?.defaults;
  const hasMax = typeof defaults?.maxConcurrent === 'number' && Number.isFinite(defaults.maxConcurrent);
  const hasSubMax =
    typeof defaults?.subagents?.maxConcurrent === 'number' &&
    Number.isFinite(defaults.subagents.maxConcurrent);
  const hasSubArchive =
    typeof defaults?.subagents?.archiveAfterMinutes === 'number' &&
    Number.isFinite(defaults.subagents.archiveAfterMinutes);
  if (hasMax && hasSubMax && hasSubArchive) {
    return cfg;
  }

  let mutated = false;
  const nextDefaults = defaults ? { ...defaults } : {};
  if (!hasMax) {
    nextDefaults.maxConcurrent = DEFAULT_AGENT_MAX_CONCURRENT;
    mutated = true;
  }

  const nextSubagents = defaults?.subagents ? { ...defaults.subagents } : {};
  if (!hasSubMax) {
    nextSubagents.maxConcurrent = DEFAULT_SUBAGENT_MAX_CONCURRENT;
    mutated = true;
  }
  if (!hasSubArchive) {
    nextSubagents.archiveAfterMinutes = DEFAULT_SUBAGENT_ARCHIVE_AFTER_MINUTES;
    mutated = true;
  }

  if (!mutated) {
    return cfg;
  }

  return {
    ...cfg,
    agents: {
      ...agents,
      defaults: {
        ...nextDefaults,
        subagents: nextSubagents,
      },
    },
  };
}

// ============================================================================
// Cron 默认值
// ============================================================================

export function applyCronDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  const raw = cfg.cron?.maxConcurrentRuns;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return cfg;
  }
  return {
    ...cfg,
    cron: {
      ...cfg.cron,
      maxConcurrentRuns: DEFAULT_CRON_MAX_CONCURRENT_RUNS,
    },
  };
}

// ============================================================================
// 日志默认值
// ============================================================================

export function applyLoggingDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  const logging = cfg.logging;
  if (!logging) {
    return cfg;
  }
  if (logging.redactSensitive) {
    return cfg;
  }
  return {
    ...cfg,
    logging: {
      ...logging,
      redactSensitive: 'tools',
    },
  };
}

// ============================================================================
// 上下文裁剪默认值
// ============================================================================

export function applyContextPruningDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  const defaults = cfg.agents?.defaults;
  if (!defaults) {
    return cfg;
  }
  // 当配置了 Anthropic 凭据信号时启用上下文裁剪默认值
  const hasAnthropicSignal = Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_OAUTH_TOKEN?.trim(),
  );
  if (!hasAnthropicSignal) {
    return cfg;
  }
  if (defaults.contextPruning !== undefined) {
    return cfg;
  }
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...defaults,
        contextPruning: { enabled: true },
      },
    },
  };
}

// ============================================================================
// 压缩默认值
// ============================================================================

export function applyCompactionDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  const defaults = cfg.agents?.defaults;
  if (!defaults) {
    return cfg;
  }
  const compaction = defaults.compaction;
  if (compaction?.mode) {
    return cfg;
  }
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...defaults,
        compaction: {
          ...compaction,
          mode: DEFAULT_COMPACTION_MODE,
        },
      },
    },
  };
}

// ============================================================================
// 组合应用所有默认值
// ============================================================================

export function applyAllDefaults(cfg: CrossWmsConfig): CrossWmsConfig {
  let next = cfg;
  next = applyMessageDefaults(next);
  next = applySessionDefaults(next);
  next = applyModelDefaults(next);
  next = applyAgentDefaults(next);
  next = applyCronDefaults(next);
  next = applyLoggingDefaults(next);
  next = applyContextPruningDefaults(next);
  next = applyCompactionDefaults(next);
  return next;
}

// ============================================================================
// 导出辅助常量（便于测试与外部引用）
// ============================================================================

export const AGENT_DEFAULTS = {
  maxConcurrent: DEFAULT_AGENT_MAX_CONCURRENT,
  subagents: {
    maxConcurrent: DEFAULT_SUBAGENT_MAX_CONCURRENT,
    archiveAfterMinutes: DEFAULT_SUBAGENT_ARCHIVE_AFTER_MINUTES,
  },
  compactionMode: DEFAULT_COMPACTION_MODE,
} as const;

export const MODEL_DEFAULTS = {
  contextTokens: DEFAULT_CONTEXT_TOKENS,
  maxTokens: DEFAULT_MODEL_MAX_TOKENS,
  input: DEFAULT_MODEL_INPUT,
} as const;
