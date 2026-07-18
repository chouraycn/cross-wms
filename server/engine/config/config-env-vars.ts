// 移植自 openclaw/src/config/config-env-vars.ts
// 定义环境变量配置元数据和保留规则。
//
// 调整说明：源文件依赖 ./types.js 的 OpenClawConfig 类型。cross-wms 该类型
// 位于 ./types/openclaw.js。其余依赖（../infra/env.js、
// ../infra/host-env-security.js、./env-substitution.js、./future-version-guard.js）
// 在 cross-wms 中均已就绪。
import {
  expandEnvNormalizationKeys,
  normalizeZaiEnv,
  resolveEnvNormalizationKeys,
} from '../infra/env.js';
import {
  isDangerousHostEnvOverrideVarName,
  isDangerousHostEnvVarName,
  normalizeEnvVarKey,
} from '../infra/host-env-security.js';
import { containsEnvVarReference } from './env-substitution.js';
import { ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV } from './future-version-guard.js';
import type { OpenClawConfig } from './types/openclaw.js';

function isBlockedConfigEnvVar(key: string): boolean {
  return (
    key.toUpperCase() === ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS_ENV ||
    key.toUpperCase() === 'OPENCLAW_INCLUDE_ROOTS' ||
    isDangerousHostEnvVarName(key) ||
    isDangerousHostEnvOverrideVarName(key)
  );
}

/** 返回一个配置控制的环境条目是否可在运行时安全应用。 */
export function isConfigRuntimeEnvVarAllowed(key: string, value: string): boolean {
  return Boolean(value.trim()) && !isBlockedConfigEnvVar(key) && !containsEnvVarReference(value);
}

function collectConfigEnvVarsByTarget(cfg?: OpenClawConfig): Record<string, string> {
  const envConfig = cfg?.env;
  if (!envConfig) {
    return {};
  }

  const entries: Record<string, string> = {};

  if (envConfig.vars) {
    for (const [rawKey, value] of Object.entries(envConfig.vars)) {
      if (typeof value !== 'string' || !value.trim()) {
        continue;
      }
      const key = normalizeEnvVarKey(rawKey, { portable: true });
      if (!key) {
        continue;
      }
      if (!isConfigRuntimeEnvVarAllowed(key, value)) {
        continue;
      }
      entries[key] = value;
    }
  }

  for (const [rawKey, value] of Object.entries(envConfig)) {
    if (rawKey === 'shellEnv' || rawKey === 'vars') {
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) {
      continue;
    }
    const key = normalizeEnvVarKey(rawKey, { portable: true });
    if (!key) {
      continue;
    }
    if (!isConfigRuntimeEnvVarAllowed(key, value)) {
      continue;
    }
    entries[key] = value;
  }

  return entries;
}

function findCaseInsensitiveEnvKey(env: NodeJS.ProcessEnv, key: string): string | undefined {
  if (Object.hasOwn(env, key)) {
    return key;
  }
  const upperKey = key.toUpperCase();
  return Object.keys(env).find((candidate) => candidate.toUpperCase() === upperKey);
}

export function cloneEnvWithPlatformSemantics(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cloned = { ...env } as NodeJS.ProcessEnv;
  if (process.platform !== 'win32') {
    return cloned;
  }
  // 普通 spread 会丢失 Windows process.env 的大小写不敏感查找和赋值语义。
  return new Proxy(cloned, {
    deleteProperty(target, property) {
      if (typeof property !== 'string') {
        return Reflect.deleteProperty(target, property);
      }
      const key = findCaseInsensitiveEnvKey(target, property);
      return key ? Reflect.deleteProperty(target, key) : true;
    },
    get(target, property, receiver) {
      if (typeof property !== 'string') {
        return Reflect.get(target, property, receiver);
      }
      const key = findCaseInsensitiveEnvKey(target, property);
      return key ? target[key] : Reflect.get(target, property, receiver);
    },
    getOwnPropertyDescriptor(target, property) {
      if (typeof property !== 'string') {
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
      const key = findCaseInsensitiveEnvKey(target, property);
      if (!key) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        value: target[key],
        writable: true,
      };
    },
    has(target, property) {
      return typeof property === 'string'
        ? findCaseInsensitiveEnvKey(target, property) !== undefined
        : Reflect.has(target, property);
    },
    set(target, property, value) {
      if (typeof property !== 'string') {
        return Reflect.set(target, property, value);
      }
      target[findCaseInsensitiveEnvKey(target, property) ?? property] = value as string | undefined;
      return true;
    },
  });
}

/** 收集可安全注入运行时进程环境的配置环境变量。 */
export function collectConfigRuntimeEnvVars(cfg?: OpenClawConfig): Record<string, string> {
  return collectConfigEnvVarsByTarget(cfg);
}

/** 收集可安全持久化到托管服务环境的配置环境变量。 */
export function collectConfigServiceEnvVars(cfg?: OpenClawConfig): Record<string, string> {
  // 运行时和服务环境变量有意共享过滤逻辑，直到出现目标特定的契约。
  return collectConfigEnvVarsByTarget(cfg);
}

/** 构建一个克隆环境，应用配置环境变量而不修改基础环境。 */
export function createConfigRuntimeEnv(
  cfg: OpenClawConfig,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = cloneEnvWithPlatformSemantics(baseEnv);
  applyConfigEnvVars(cfg, env);
  return env;
}

/** 应用配置环境变量到环境，不覆盖已存在的非空值。 */
export function applyConfigEnvVars(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    lowerPrecedenceEnv?: Readonly<Record<string, string>>;
    onLowerPrecedenceKeysReplaced?: (keys: readonly string[]) => void;
  } = {},
): void {
  const entries = collectConfigRuntimeEnvVars(cfg);
  const lowerPrecedenceEntries = Object.entries(options.lowerPrecedenceEnv ?? {});
  const normalizeKey = (key: string) => (process.platform === 'win32' ? key.toUpperCase() : key);
  const lowerPrecedenceEnv = new Map(
    lowerPrecedenceEntries.map(([key, value]) => [normalizeKey(key), value]),
  );
  // 降级说明：openclaw 的 expandEnvNormalizationKeys 返回 Set，cross-wms 返回
  // string[]，此处包装为 Set 以保持 .has() 语义一致。
  const configEnvKeys = new Set(expandEnvNormalizationKeys(Object.keys(entries)));
  const configValuesByKey = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(entries)) {
    for (const normalizedKey of resolveEnvNormalizationKeys(key)) {
      const values = configValuesByKey.get(normalizedKey) ?? new Set<string>();
      values.add(value);
      configValuesByKey.set(normalizedKey, values);
    }
  }
  const higherPrecedenceValues = new Map<string, string>();
  for (const key of Object.keys(entries)) {
    const normalizedKeys = resolveEnvNormalizationKeys(key);
    const winningValue = normalizedKeys
      .map((normalizedKey) => [normalizedKey, env[normalizedKey]] as const)
      .find(
        ([normalizedKey, currentValue]) =>
          currentValue?.trim() &&
          lowerPrecedenceEnv.get(normalizedKey) !== currentValue &&
          !configValuesByKey.get(normalizedKey)?.has(currentValue),
      )?.[1];
    if (winningValue !== undefined) {
      for (const normalizedKey of normalizedKeys) {
        higherPrecedenceValues.set(normalizedKey, winningValue);
      }
    }
  }
  const replacedLowerPrecedenceKeys: string[] = [];
  for (const [key, value] of lowerPrecedenceEntries) {
    if (configEnvKeys.has(normalizeKey(key)) && env[key] === value) {
      delete env[key];
      replacedLowerPrecedenceKeys.push(key);
    }
  }
  if (replacedLowerPrecedenceKeys.length > 0) {
    options.onLowerPrecedenceKeysReplaced?.(replacedLowerPrecedenceKeys);
  }
  for (const [key, value] of Object.entries(entries)) {
    const higherPrecedenceValue = higherPrecedenceValues.get(normalizeKey(key));
    if (higherPrecedenceValue !== undefined) {
      env[key] = higherPrecedenceValue;
      continue;
    }
    const currentValue = env[key];
    if (currentValue?.trim() && lowerPrecedenceEnv.get(normalizeKey(key)) !== currentValue) {
      continue;
    }
    // 跳过包含未解析 ${VAR} 引用的值 —— applyConfigEnvVars 在环境变量替换之前
    // 运行，因此这些值会用字面占位符污染 process.env
    // （例如 process.env.OPENCLAW_GATEWAY_TOKEN = "${VAULT_TOKEN}"），下游认证
    // 解析会将其作为有效凭证接受。
    if (containsEnvVarReference(value)) {
      continue;
    }
    env[key] = value;
  }
  normalizeZaiEnv(env);
}
