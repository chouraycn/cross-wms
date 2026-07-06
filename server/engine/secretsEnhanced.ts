/**
 * Secrets Enhanced — 密钥管理增强模块
 *
 * 在现有密钥管理系统基础上增加：
 * 1. exec provider — 通过执行外部命令获取密钥值（如 1Password CLI, pass, vault CLI）
 * 2. runtime snapshot — 运行时密钥快照，用于调试和审计
 * 3. plan/apply — 声明式密钥管理：先 plan 预览变更，再 apply 执行
 *
 * 与现有 secretsManager.ts / secretsTypes.ts 互补，不替换原有功能。
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';
import type { SecretRef, SecretValue, SecretProvider } from './secretsTypes.js';

const execAsync = promisify(exec);

// ===================== exec provider =====================

/** exec provider 配置 — 通过执行命令获取密钥 */
export interface ExecSecretProviderConfig {
  /** 要执行的命令（如 'op read "op://Private/api-key"' 或 'pass show api/key'） */
  command: string;
  /** 超时（毫秒），默认 10000 */
  timeoutMs?: number;
  /** 工作目录（可选） */
  cwd?: string;
  /** 环境变量（可选，追加到进程环境） */
  env?: Record<string, string>;
  /** 是否从 stdout 第一行提取（默认 true，去除尾部换行） */
  trimOutput?: boolean;
}

/** exec provider 缓存 */
interface ExecCacheEntry {
  value: string;
  fetchedAt: number;
  ttlMs: number;
}

const execCache = new Map<string, ExecCacheEntry>();

/**
 * 通过 exec provider 获取密钥值
 *
 * 支持的外部密钥管理工具：
 *   - 1Password CLI: `op read "op://vault/item/field"`
 *   - pass (GPG): `pass show path/to/secret`
 *   - HashiCorp Vault: `vault kv get -field=value secret/path`
 *   - AWS Secrets Manager: `aws secretsmanager get-secret-value --secret-id name --query SecretString --output text`
 *   - 自定义脚本
 *
 * @param config - exec provider 配置
 * @param cacheKey - 缓存键（可选，用于缓存结果）
 * @param cacheTtlMs - 缓存 TTL（默认 5 分钟）
 */
export async function resolveExecSecret(
  config: ExecSecretProviderConfig,
  cacheKey?: string,
  cacheTtlMs = 5 * 60 * 1000,
): Promise<string> {
  // 检查缓存
  if (cacheKey) {
    const cached = execCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < cached.ttlMs) {
      logger.debug(`[ExecSecretProvider] Cache hit for ${cacheKey}`);
      return cached.value;
    }
  }

  const { command, timeoutMs = 10000, cwd, env, trimOutput = true } = config;

  try {
    logger.debug(`[ExecSecretProvider] Executing: ${command}`);
    const { stdout } = await execAsync(command, {
      timeout: timeoutMs,
      ...(cwd ? { cwd } : {}),
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });

    const value = trimOutput ? stdout.trim() : stdout;

    // 缓存
    if (cacheKey) {
      execCache.set(cacheKey, {
        value,
        fetchedAt: Date.now(),
        ttlMs: cacheTtlMs,
      });
    }

    logger.debug(`[ExecSecretProvider] Successfully resolved secret (${value.length} chars)`);
    return value;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[ExecSecretProvider] Command failed: ${command} — ${msg}`);
    throw new Error(`Exec secret provider failed: ${msg}`);
  }
}

/** 清除 exec provider 缓存 */
export function clearExecSecretCache(cacheKey?: string): void {
  if (cacheKey) {
    execCache.delete(cacheKey);
  } else {
    execCache.clear();
  }
}

// ===================== Runtime Snapshot =====================

/** 密钥运行时快照 — 记录所有已解析密钥的状态（不含值） */
export interface SecretRuntimeSnapshot {
  /** 快照时间戳 */
  snapshotAt: number;
  /** 所有已解析的密钥引用 */
  secrets: SecretSnapshotEntry[];
  /** 统计 */
  stats: {
    total: number;
    byProvider: Record<string, number>;
    resolved: number;
    unresolved: number;
    cached: number;
  };
}

/** 单个密钥的快照条目（不包含实际值，仅元数据） */
export interface SecretSnapshotEntry {
  /** 密钥键名 */
  key: string;
  /** Provider 类型 */
  provider: SecretProvider | 'exec';
  /** 是否已解析 */
  resolved: boolean;
  /** 是否来自缓存 */
  cached: boolean;
  /** 值长度（字符数，不暴露值本身） */
  valueLength?: number;
  /** 最后解析时间 */
  lastResolvedAt?: number;
  /** 错误信息（如果解析失败） */
  error?: string;
}

/**
 * 生成密钥运行时快照
 *
 * 用于调试和审计：记录当前所有密钥的解析状态，不暴露实际值。
 *
 * @param resolvedSecrets - 已解析的密钥映射（key → { value, ref, cached }）
 */
export function createSecretRuntimeSnapshot(
  resolvedSecrets: Map<string, { value: string; ref: SecretRef; cached: boolean; error?: string; resolvedAt?: number }>,
): SecretRuntimeSnapshot {
  const entries: SecretSnapshotEntry[] = [];
  const byProvider: Record<string, number> = {};
  let resolved = 0;
  let unresolved = 0;
  let cached = 0;

  for (const [key, entry] of resolvedSecrets) {
    const provider = entry.ref.provider as string;
    byProvider[provider] = (byProvider[provider] ?? 0) + 1;

    const snapshotEntry: SecretSnapshotEntry = {
      key,
      provider: entry.ref.provider,
      resolved: !entry.error,
      cached: entry.cached,
    };

    if (entry.error) {
      snapshotEntry.error = entry.error;
      unresolved++;
    } else {
      snapshotEntry.valueLength = entry.value.length;
      snapshotEntry.lastResolvedAt = entry.resolvedAt;
      resolved++;
      if (entry.cached) cached++;
    }

    entries.push(snapshotEntry);
  }

  return {
    snapshotAt: Date.now(),
    secrets: entries,
    stats: {
      total: entries.length,
      byProvider,
      resolved,
      unresolved,
      cached,
    },
  };
}

// ===================== Plan / Apply =====================

/** 密钥变更操作类型 */
export type SecretMutationType = 'create' | 'update' | 'delete';

/** 密钥变更计划项 */
export interface SecretPlanItem {
  /** 操作类型 */
  action: SecretMutationType;
  /** 密钥键名 */
  key: string;
  /** 目标 provider */
  provider: SecretProvider | 'exec';
  /** 新值（create/update 时必填，delete 时忽略） */
  newValue?: string;
  /** 当前值长度（update/delete 时有值） */
  currentValueLength?: number;
  /** 变更描述 */
  description?: string;
}

/** 密钥变更计划 */
export interface SecretPlan {
  /** 计划 ID */
  planId: string;
  /** 创建时间 */
  createdAt: number;
  /** 计划项列表 */
  items: SecretPlanItem[];
  /** 统计 */
  summary: {
    creates: number;
    updates: number;
    deletes: number;
    total: number;
  };
  /** 是否有破坏性变更 */
  hasDestructiveChanges: boolean;
}

/** Apply 结果 */
export interface SecretApplyResult {
  planId: string;
  appliedAt: number;
  results: Array<{
    key: string;
    action: SecretMutationType;
    success: boolean;
    error?: string;
  }>;
  succeeded: number;
  failed: number;
}

/**
 * 生成密钥变更计划
 *
 * 比较期望状态和当前状态，生成变更计划。
 * 用户可以先 review 计划，再决定是否 apply。
 *
 * @param desiredState - 期望的密钥状态（key → { provider, value }）
 * @param currentState - 当前的密钥状态（key → { provider, valueLength }）
 */
export function planSecretChanges(
  desiredState: Map<string, { provider: SecretProvider | 'exec'; value?: string }>,
  currentState: Map<string, { provider: SecretProvider | 'exec'; valueLength?: number }>,
): SecretPlan {
  const items: SecretPlanItem[] = [];
  let creates = 0;
  let updates = 0;
  let deletes = 0;
  let hasDestructive = false;

  // 检查新增和更新
  for (const [key, desired] of desiredState) {
    const current = currentState.get(key);
    if (!current) {
      // 新增
      items.push({
        action: 'create',
        key,
        provider: desired.provider,
        newValue: desired.value,
        description: `Create secret '${key}' via ${desired.provider}`,
      });
      creates++;
    } else if (current.provider !== desired.provider) {
      // Provider 变更视为更新
      items.push({
        action: 'update',
        key,
        provider: desired.provider,
        newValue: desired.value,
        currentValueLength: current.valueLength,
        description: `Update secret '${key}': provider ${current.provider} → ${desired.provider}`,
      });
      updates++;
    }
    // 值变更无法在不暴露当前值的情况下检测，略过
  }

  // 检查删除
  for (const [key, current] of currentState) {
    if (!desiredState.has(key)) {
      items.push({
        action: 'delete',
        key,
        provider: current.provider,
        currentValueLength: current.valueLength,
        description: `Delete secret '${key}' (was ${current.provider})`,
      });
      deletes++;
      hasDestructive = true;
    }
  }

  return {
    planId: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    items,
    summary: { creates, updates, deletes, total: items.length },
    hasDestructiveChanges: hasDestructive,
  };
}

/**
 * 执行密钥变更计划
 *
 * @param plan - 变更计划
 * @param executor - 执行函数（实际写入/删除密钥的实现）
 */
export async function applySecretPlan(
  plan: SecretPlan,
  executor: (item: SecretPlanItem) => Promise<void>,
): Promise<SecretApplyResult> {
  const results: SecretApplyResult['results'] = [];
  let succeeded = 0;
  let failed = 0;

  for (const item of plan.items) {
    try {
      await executor(item);
      results.push({
        key: item.key,
        action: item.action,
        success: true,
      });
      succeeded++;
      logger.info(`[SecretPlan] Applied: ${item.action} ${item.key}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        key: item.key,
        action: item.action,
        success: false,
        error: msg,
      });
      failed++;
      logger.error(`[SecretPlan] Failed: ${item.action} ${item.key} — ${msg}`);
    }
  }

  return {
    planId: plan.planId,
    appliedAt: Date.now(),
    results,
    succeeded,
    failed,
  };
}
