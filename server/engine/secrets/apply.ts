/**
 * 密钥应用模块
 *
 * 提供：
 * - 计划生成：基于期望状态（desired state）与当前状态对比，生成变更计划
 * - 计划应用：将计划应用到 store，返回逐项结果
 * - 干运行（dry-run）：仅生成计划不实际执行
 * - 回滚（rollback）：恢复到 apply 前的状态（基于备份）
 *
 * 与 manager / store / rotation 协作，是声明式密钥管理的执行入口。
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger.js';
import {
  createSecret,
  updateSecret,
  deleteSecret,
  getSecret,
  secretExists,
  listSecrets,
  initSecretsStore,
} from './store.js';
import type {
  SecretPlan,
  SecretPlanItem,
  SecretApplyResult,
  SecretProvider,
  SecretRecord,
  CreateSecretRequest,
} from './types.js';

/** 期望状态项 — 用于生成计划 */
export interface DesiredSecretItem {
  provider: SecretProvider;
  key: string;
  value?: string;
  type?: CreateSecretRequest['type'];
  description?: string;
  expiresAt?: number;
  tags?: string[];
  scope?: CreateSecretRequest['scope'];
  scopeId?: string;
}

/** 计划生成选项 */
export interface PlanOptions {
  /** 是否允许删除（默认 false，仅生成 create / update） */
  allowDelete?: boolean;
  /** 当前时间戳（测试可注入） */
  now?: number;
}

/** Apply 选项 */
export interface ApplyOptions {
  /** 是否为干运行（仅打印计划，不实际执行） */
  dryRun?: boolean;
  /** 是否在失败时继续执行后续项 */
  continueOnError?: boolean;
}

/** Apply 前的备份（用于回滚） */
interface ApplyBackup {
  planId: string;
  backups: Map<string, BackupEntry>;
}

interface BackupEntry {
  action: SecretPlanItem['action'];
  existedBefore: boolean;
  previousValue?: string;
  previousEncrypted?: string;
  previousRecord?: SecretRecord;
}

/** applyId → 备份的映射（用于回滚） */
const applyBackups = new Map<string, ApplyBackup>();

/**
 * 生成密钥变更计划
 *
 * 对比期望状态与当前状态，生成 create / update / delete 计划项。
 *
 * @param desired - 期望状态
 * @param options - 计划选项
 */
export function planSecrets(
  desired: DesiredSecretItem[],
  options: PlanOptions = {},
): SecretPlan {
  initSecretsStore();
  const now = options.now ?? Date.now();
  const allowDelete = options.allowDelete ?? false;

  const items: SecretPlanItem[] = [];
  const currentMap = new Map<string, SecretRecord>();

  // 收集当前状态
  const current = listSecrets();
  for (const secret of current) {
    currentMap.set(`${secret.provider}:${secret.key}`, secret);
  }

  // 收集期望状态 key 集合
  const desiredKeys = new Set<string>();
  for (const item of desired) {
    const key = `${item.provider}:${item.key}`;
    desiredKeys.add(key);

    const existing = currentMap.get(key);
    if (!existing) {
      // 新增
      items.push({
        action: 'create',
        key: item.key,
        provider: item.provider,
        newValue: item.value,
        description: item.description,
      });
    } else if (item.value !== undefined) {
      // 更新（仅当提供新值时）
      items.push({
        action: 'update',
        key: item.key,
        provider: item.provider,
        newValue: item.value,
        currentValueLength: existing.metadata ? undefined : undefined,
        description: item.description,
      });
    }
  }

  // 删除：当前状态中存在但期望状态中不存在的密钥
  if (allowDelete) {
    for (const [key, secret] of currentMap.entries()) {
      if (!desiredKeys.has(key)) {
        items.push({
          action: 'delete',
          key: secret.key,
          provider: secret.provider,
        });
      }
    }
  }

  const summary = {
    creates: items.filter(i => i.action === 'create').length,
    updates: items.filter(i => i.action === 'update').length,
    deletes: items.filter(i => i.action === 'delete').length,
    total: items.length,
  };

  const hasDestructiveChanges = summary.deletes > 0;

  logger.info('[SecretsApply] 计划已生成', {
    total: summary.total,
    creates: summary.creates,
    updates: summary.updates,
    deletes: summary.deletes,
  });

  return {
    planId: uuidv4(),
    createdAt: now,
    items,
    summary,
    hasDestructiveChanges,
  };
}

/**
 * 应用计划
 *
 * @param plan - 变更计划
 * @param options - Apply 选项
 */
export function applyPlan(
  plan: SecretPlan,
  options: ApplyOptions = {},
): SecretApplyResult {
  initSecretsStore();
  const dryRun = options.dryRun ?? false;
  const continueOnError = options.continueOnError ?? true;

  const results: SecretApplyResult['results'] = [];
  const backup: ApplyBackup = {
    planId: plan.planId,
    backups: new Map(),
  };
  let succeeded = 0;
  let failed = 0;

  for (const item of plan.items) {
    try {
      if (dryRun) {
        results.push({
          key: item.key,
          action: item.action,
          success: true,
        });
        succeeded++;
        continue;
      }

      const result = applyItem(item, backup);
      results.push(result);
      if (result.success) succeeded++;
      else failed++;

      if (!result.success && !continueOnError) {
        // 失败且不继续 → 中止剩余项
        for (const remaining of plan.items.slice(plan.items.indexOf(item) + 1)) {
          results.push({
            key: remaining.key,
            action: remaining.action,
            success: false,
            error: '已中止（前序项失败且 continueOnError=false）',
          });
          failed++;
        }
        break;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        key: item.key,
        action: item.action,
        success: false,
        error: errorMsg,
      });
      failed++;
      if (!continueOnError) break;
    }
  }

  // 备份用于回滚
  if (!dryRun && (succeeded > 0 || failed > 0)) {
    applyBackups.set(plan.planId, backup);
  }

  logger.info('[SecretsApply] 计划应用完成', {
    planId: plan.planId,
    succeeded,
    failed,
    dryRun,
  });

  return {
    planId: plan.planId,
    appliedAt: Date.now(),
    results,
    succeeded,
    failed,
  };
}

/**
 * 应用单个计划项
 */
function applyItem(item: SecretPlanItem, backup: ApplyBackup): {
  key: string;
  action: SecretPlanItem['action'];
  success: boolean;
  error?: string;
} {
  const backupKey = `${item.provider}:${item.key}`;

  switch (item.action) {
    case 'create': {
      // 备份（创建前不存在）
      backup.backups.set(backupKey, {
        action: 'create',
        existedBefore: false,
      });

      if (!item.newValue) {
        return {
          key: item.key,
          action: 'create',
          success: false,
          error: '创建密钥缺少 newValue',
        };
      }

      if (secretExists(item.provider, item.key)) {
        return {
          key: item.key,
          action: 'create',
          success: false,
          error: '密钥已存在',
        };
      }

      createSecret({
        provider: item.provider,
        key: item.key,
        value: item.newValue,
        description: item.description,
      });
      return { key: item.key, action: 'create', success: true };
    }

    case 'update': {
      const existing = findByProviderKey(item.provider, item.key);
      if (!existing) {
        return {
          key: item.key,
          action: 'update',
          success: false,
          error: '密钥不存在，无法更新',
        };
      }

      // 备份
      backup.backups.set(backupKey, {
        action: 'update',
        existedBefore: true,
        previousRecord: existing,
        previousEncrypted: (getSecret(existing.id) as any)?.valueEncrypted,
      });

      if (!item.newValue) {
        return {
          key: item.key,
          action: 'update',
          success: false,
          error: '更新密钥缺少 newValue',
        };
      }

      const updated = updateSecret(existing.id, {
        value: item.newValue,
        description: item.description,
      });
      return {
        key: item.key,
        action: 'update',
        success: updated !== null,
        error: updated === null ? '更新失败' : undefined,
      };
    }

    case 'delete': {
      const existing = findByProviderKey(item.provider, item.key);
      if (!existing) {
        return {
          key: item.key,
          action: 'delete',
          success: false,
          error: '密钥不存在',
        };
      }

      // 备份（删除前的完整记录）
      backup.backups.set(backupKey, {
        action: 'delete',
        existedBefore: true,
        previousRecord: existing,
        previousEncrypted: (getSecret(existing.id) as any)?.valueEncrypted,
      });

      const ok = deleteSecret(existing.id);
      return {
        key: item.key,
        action: 'delete',
        success: ok,
        error: ok ? undefined : '删除失败',
      };
    }

    default:
      return {
        key: item.key,
        action: item.action,
        success: false,
        error: `未知操作: ${item.action}`,
      };
  }
}

/**
 * 按 provider + key 查找密钥记录
 */
function findByProviderKey(provider: SecretProvider, key: string): SecretRecord | null {
  const list = listSecrets({ provider });
  return list.find(s => s.key === key) ?? null;
}

/**
 * 回滚 apply 操作
 *
 * 注意：仅能回滚最后一次 apply，且需提供原始密钥值（出于安全考虑不持久化明文备份）。
 * 对于 delete 操作，需要调用方提供原始值；若未提供，则跳过该项。
 *
 * @param planId - 计划 ID
 * @param valueProvider - 回调函数，提供回滚所需的原始密钥值
 */
export function rollbackApply(
  planId: string,
  valueProvider?: (provider: SecretProvider, key: string) => string | undefined,
): {
  rolledBack: number;
  skipped: number;
  errors: Array<{ key: string; error: string }>;
} {
  const backup = applyBackups.get(planId);
  if (!backup) {
    return {
      rolledBack: 0,
      skipped: 0,
      errors: [{ key: planId, error: '未找到计划备份' }],
    };
  }

  let rolledBack = 0;
  let skipped = 0;
  const errors: Array<{ key: string; error: string }> = [];

  // 反向回滚（按相反顺序）
  const entries = [...backup.backups.entries()].reverse();
  for (const [key, entry] of entries) {
    const [provider, secretKey] = key.split(':') as [SecretProvider, string];

    try {
      switch (entry.action) {
        case 'create': {
          // 创建的反向操作：删除
          const existing = findByProviderKey(provider, secretKey);
          if (existing) {
            deleteSecret(existing.id);
            rolledBack++;
          } else {
            skipped++;
          }
          break;
        }

        case 'update': {
          // 更新的反向操作：恢复原值
          if (entry.previousRecord && valueProvider) {
            const originalValue = valueProvider(provider, secretKey);
            if (originalValue !== undefined) {
              updateSecret(entry.previousRecord.id, { value: originalValue });
              rolledBack++;
            } else {
              skipped++;
              errors.push({ key: secretKey, error: '未提供原始值，跳过回滚' });
            }
          } else {
            skipped++;
            errors.push({ key: secretKey, error: '缺少 valueProvider，跳过回滚' });
          }
          break;
        }

        case 'delete': {
          // 删除的反向操作：重新创建
          if (valueProvider) {
            const originalValue = valueProvider(provider, secretKey);
            if (originalValue !== undefined) {
              createSecret({
                provider,
                key: secretKey,
                value: originalValue,
                description: entry.previousRecord?.metadata?.description,
              });
              rolledBack++;
            } else {
              skipped++;
              errors.push({ key: secretKey, error: '未提供原始值，跳过回滚' });
            }
          } else {
            skipped++;
            errors.push({ key: secretKey, error: '缺少 valueProvider，跳过回滚' });
          }
          break;
        }
      }
    } catch (error) {
      errors.push({
        key: secretKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 清理备份
  applyBackups.delete(planId);

  logger.info('[SecretsApply] 回滚完成', {
    planId,
    rolledBack,
    skipped,
    errorCount: errors.length,
  });

  return { rolledBack, skipped, errors };
}

/**
 * 清理所有 apply 备份（测试用）
 */
export function clearApplyBackups(): void {
  applyBackups.clear();
}

/**
 * 格式化计划为可读字符串（用于 CLI 输出）
 */
export function formatPlan(plan: SecretPlan): string {
  const lines: string[] = [
    `计划 ID: ${plan.planId}`,
    `创建时间: ${new Date(plan.createdAt).toISOString()}`,
    `总计: ${plan.summary.total}（创建 ${plan.summary.creates} / 更新 ${plan.summary.updates} / 删除 ${plan.summary.deletes}）`,
    `含破坏性变更: ${plan.hasDestructiveChanges ? '是' : '否'}`,
    '',
    '明细:',
  ];

  for (const item of plan.items) {
    const icon = item.action === 'create' ? '+' : item.action === 'delete' ? '-' : '~';
    lines.push(`  [${icon}] ${item.provider}/${item.key}`);
    if (item.description) lines.push(`      描述: ${item.description}`);
    if (item.newValue) lines.push(`      新值长度: ${item.newValue.length}`);
  }

  return lines.join('\n');
}

/**
 * 格式化 Apply 结果为可读字符串
 */
export function formatApplyResult(result: SecretApplyResult): string {
  const lines: string[] = [
    `计划 ID: ${result.planId}`,
    `应用时间: ${new Date(result.appliedAt).toISOString()}`,
    `成功: ${result.succeeded} / 失败: ${result.failed}`,
    '',
    '明细:',
  ];

  for (const r of result.results) {
    const icon = r.success ? '✓' : '✗';
    lines.push(`  [${icon}] ${r.action} ${r.key}`);
    if (r.error) lines.push(`      错误: ${r.error}`);
  }

  return lines.join('\n');
}
