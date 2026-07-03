// 环境变量解析
// 参考 openclaw/src/config/env-vars.ts 与 config-env-vars.ts 的设计，
// 将环境变量映射到配置路径，支持 CROSS_WMS_ 前缀与类型转换（boolean/number/string/json）

import { logger } from '../logger.js';

// ============================================================================
// 类型定义
// ============================================================================

export type EnvVarValue = string | number | boolean | object | null;

export interface EnvVarMapping {
  // 环境变量名（不含前缀，如 APP_NAME、MODELS_DEFAULT）
  envVar: string;
  // 对应的配置路径（点分形式，如 app.name、models.default）
  configPath: string;
  // 值类型：boolean / number / string / json
  type: 'boolean' | 'number' | 'string' | 'json';
  // 可选的描述
  description?: string;
}

// 环境变量覆盖结果
export interface EnvVarOverrideResult {
  // 解析出的覆盖补丁（深嵌套对象）
  overrides: Record<string, unknown>;
  // 实际命中的环境变量名列表
  matchedEnvVars: string[];
  // 跳过的环境变量（值无效等）
  skippedEnvVars: Array<{ envVar: string; reason: string }>;
}

// ============================================================================
// 常量
// ============================================================================

// 项目环境变量前缀
export const ENV_VAR_PREFIX = 'CROSS_WMS_';

// 内置的环境变量到配置路径映射表
export const ENV_VAR_MAPPINGS: readonly EnvVarMapping[] = [
  { envVar: 'APP_NAME', configPath: 'app.name', type: 'string', description: '应用名称' },
  { envVar: 'APP_PORT', configPath: 'app.port', type: 'number', description: '服务监听端口' },
  { envVar: 'MODELS_DEFAULT', configPath: 'models.default', type: 'string', description: '默认模型引用' },
  { envVar: 'AGENTS_MAX_CONCURRENT', configPath: 'agents.defaults.maxConcurrent', type: 'number' },
  { envVar: 'AGENTS_MODEL', configPath: 'agents.defaults.model', type: 'string' },
  { envVar: 'CRON_MAX_CONCURRENT_RUNS', configPath: 'cron.maxConcurrentRuns', type: 'number' },
  { envVar: 'LOGGING_LEVEL', configPath: 'logging.level', type: 'string' },
  { envVar: 'LOGGING_REDACT_SENSITIVE', configPath: 'logging.redactSensitive', type: 'string' },
  { envVar: 'SESSION_MAIN_KEY', configPath: 'session.mainKey', type: 'string' },
  { envVar: 'MESSAGES_ACK_REACTION_SCOPE', configPath: 'messages.ackReactionScope', type: 'string' },
  { envVar: 'TALK_PROVIDER', configPath: 'talk.provider', type: 'string' },
  { envVar: 'TALK_SPEECH_LOCALE', configPath: 'talk.speechLocale', type: 'string' },
];

// ============================================================================
// 值解析
// ============================================================================

// 解析环境变量字符串为目标类型，失败时返回 null
export function parseEnvVarValue(
  raw: string | undefined,
  type: EnvVarMapping['type'],
): EnvVarValue {
  if (raw === undefined) {
    return null;
  }
  switch (type) {
    case 'boolean': {
      const trimmed = raw.trim().toLowerCase();
      if (trimmed === '' || trimmed === '0' || trimmed === 'false' || trimmed === 'no' || trimmed === 'off') {
        return false;
      }
      if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes' || trimmed === 'on') {
        return true;
      }
      return null;
    }
    case 'number': {
      const trimmed = raw.trim();
      if (trimmed === '') {
        return null;
      }
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : null;
    }
    case 'json': {
      try {
        return JSON.parse(raw) as object;
      } catch {
        return null;
      }
    }
    case 'string':
    default:
      return raw;
  }
}

// ============================================================================
// 环境变量名解析
// ============================================================================

// 将带前缀的环境变量名还原为映射表中的 envVar 键
// 例如 CROSS_WMS_APP_NAME -> APP_NAME
export function stripEnvVarPrefix(envVarName: string, prefix: string = ENV_VAR_PREFIX): string | null {
  if (!envVarName.startsWith(prefix)) {
    return null;
  }
  return envVarName.slice(prefix.length);
}

// ============================================================================
// 路径设置工具
// ============================================================================

// 按点分路径在目标对象上设置值（自动创建中间对象）
function setPathValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) {
    return;
  }
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const next = cursor[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      const intermediate: Record<string, unknown> = {};
      cursor[key] = intermediate;
      cursor = intermediate;
    } else {
      cursor = next as Record<string, unknown>;
    }
  }
  cursor[segments[segments.length - 1]] = value;
}

// ============================================================================
// 覆盖解析
// ============================================================================

// 解析环境变量覆盖：扫描内置映射表 + 带前缀的环境变量，构建覆盖补丁
export function resolveEnvVarOverrides(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    mappings?: readonly EnvVarMapping[];
    prefix?: string;
  },
): EnvVarOverrideResult {
  const mappings = options?.mappings ?? ENV_VAR_MAPPINGS;
  const prefix = options?.prefix ?? ENV_VAR_PREFIX;
  const overrides: Record<string, unknown> = {};
  const matchedEnvVars: string[] = [];
  const skippedEnvVars: Array<{ envVar: string; reason: string }> = [];

  // 1. 基于内置映射表精确匹配
  for (const mapping of mappings) {
    const fullVarName = `${prefix}${mapping.envVar}`;
    const raw = env[fullVarName];
    if (raw === undefined || raw === '') {
      continue;
    }
    const parsed = parseEnvVarValue(raw, mapping.type);
    if (parsed === null) {
      skippedEnvVars.push({ envVar: fullVarName, reason: `无法将值解析为 ${mapping.type}` });
      continue;
    }
    setPathValue(overrides, mapping.configPath, parsed);
    matchedEnvVars.push(fullVarName);
  }

  // 2. 通用前缀扫描：CROSS_WMS_FOO_BAR=... -> foo.bar
  // 仅当映射表未精确命中时启用，作为补充机制
  for (const envVarName of Object.keys(env)) {
    const stripped = stripEnvVarPrefix(envVarName, prefix);
    if (stripped === null) {
      continue;
    }
    // 已被映射表精确命中则跳过
    if (matchedEnvVars.includes(envVarName)) {
      continue;
    }
    const raw = env[envVarName];
    if (raw === undefined || raw === '') {
      continue;
    }
    // 将 SNAKE_CASE 转为 camelCase 点分路径
    const configPath = snakeToCamelPath(stripped);
    if (!configPath) {
      continue;
    }
    // 跳过已被映射表覆盖的路径
    if (hasPathValue(overrides, configPath)) {
      continue;
    }
    setPathValue(overrides, configPath, raw);
    matchedEnvVars.push(envVarName);
  }

  if (matchedEnvVars.length > 0) {
    logger.debug(`[config] 已解析 ${matchedEnvVars.length} 个环境变量覆盖: ${matchedEnvVars.join(', ')}`);
  }

  return { overrides, matchedEnvVars, skippedEnvVars };
}

// SNAKE_CASE 转 camelCase 点分路径
// 例如 FOO_BAR_BAZ -> foo.bar.baz
function snakeToCamelPath(snake: string): string {
  const segments = snake.toLowerCase().split('_').filter(Boolean);
  if (segments.length === 0) {
    return '';
  }
  // 按点分返回：foo.bar.baz，便于直接作为嵌套配置路径使用
  return segments.join('.');
}

// 判断目标对象是否已存在指定路径
function hasPathValue(target: Record<string, unknown>, path: string): boolean {
  const segments = path.split('.').filter(Boolean);
  let cursor: unknown = target;
  for (const key of segments) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return false;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor !== undefined;
}

// ============================================================================
// 应用覆盖
// ============================================================================

// 将环境变量覆盖补丁深合并到目标配置（环境变量优先级低于显式配置，仅填充缺失项）
export function applyEnvVarOverrides(
  config: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    mappings?: readonly EnvVarMapping[];
    prefix?: string;
    // 是否覆盖已存在的显式配置项（默认 false，仅填充缺失项）
    overwrite?: boolean;
  },
): Record<string, unknown> {
  const { overrides } = resolveEnvVarOverrides(env, options);
  const overwrite = options?.overwrite ?? false;
  const result: Record<string, unknown> = { ...config };
  mergeDeep(result, overrides, overwrite);
  return result;
}

// 深合并：source 的值写入 target；overwrite 为 false 时仅填充 target 中缺失的项
function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  overwrite: boolean,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const existing = target[key];
      if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
        mergeDeep(existing as Record<string, unknown>, value as Record<string, unknown>, overwrite);
      } else if (existing === undefined || overwrite) {
        target[key] = Array.isArray(value) ? value : deepClone(value);
      }
    } else if (target[key] === undefined || overwrite) {
      target[key] = value;
    }
  }
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
