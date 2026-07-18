/**
 * 密钥轮换模块
 *
 * 提供：
 * - 手动轮换：调用方提供新值，更新密钥并记录历史
 * - 自动轮换：基于 RotationPolicy 定时触发
 * - 回退：在轮换失败时恢复旧值
 * - 轮换记录：持久化每次轮换操作的元数据
 *
 * 与 store.ts 协作，所有轮换操作都会：
 *   1. 写入轮换记录表
 *   2. 调用 store.markRotated 更新 lastRotatedAt
 *   3. 通过 store 的缓存失效回调通知 runtime
 */

import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../../db.js';
import { logger } from '../../logger.js';
import {
  getSecret,
  updateSecret,
  markRotated,
  initSecretsStore,
  logSecretAccess,
  listSecrets,
} from './store.js';
import { isExpiringSoon } from './validator.js';
import type {
  RotationPolicy,
  RotationRecord,
  SecretRecord,
  SecretValue,
} from './types.js';

const ROTATION_TABLE = 'secrets_v2_rotation';

let rotationInitialized = false;

/** 轮换记录行 */
interface RotationRow {
  id: string;
  secret_id: string;
  rotated_at: number;
  previous_value_length: number;
  new_value_length: number;
  trigger: string;
  success: number;
  error: string | null;
}

/**
 * 初始化轮换记录表
 */
export function initRotationStore(): void {
  if (rotationInitialized) return;
  initSecretsStore();
  const db = initDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${ROTATION_TABLE} (
      id TEXT PRIMARY KEY,
      secret_id TEXT NOT NULL,
      rotated_at INTEGER NOT NULL,
      previous_value_length INTEGER NOT NULL,
      new_value_length INTEGER NOT NULL,
      trigger TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      error TEXT
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_secrets_v2_rotation_secret ON ${ROTATION_TABLE}(secret_id);
    CREATE INDEX IF NOT EXISTS idx_secrets_v2_rotation_at ON ${ROTATION_TABLE}(rotated_at);
  `);
  rotationInitialized = true;
  logger.info('[SecretsRotation] 轮换记录表已初始化');
}

/**
 * 清理轮换记录（仅测试用）
 */
export function clearRotationStoreForTests(): void {
  initRotationStore();
  const db = initDb();
  db.exec(`DELETE FROM ${ROTATION_TABLE}`);
}

/** 默认轮换策略存储（内存） */
const policies = new Map<string, RotationPolicy>();

/**
 * 注册轮换策略
 */
export function registerRotationPolicy(policy: RotationPolicy): void {
  policies.set(policy.id, policy);
  logger.info('[SecretsRotation] 轮换策略已注册', { id: policy.id, name: policy.name });
}

/**
 * 注销轮换策略
 */
export function unregisterRotationPolicy(policyId: string): void {
  policies.delete(policyId);
}

/**
 * 获取所有轮换策略
 */
export function listRotationPolicies(): RotationPolicy[] {
  return [...policies.values()];
}

/**
 * 获取轮换策略
 */
export function getRotationPolicy(policyId: string): RotationPolicy | undefined {
  return policies.get(policyId);
}

/**
 * 清空所有轮换策略（测试用）
 */
export function clearRotationPolicies(): void {
  policies.clear();
}

/**
 * 手动轮换密钥
 *
 * @param secretId - 密钥 ID
 * @param newValue - 新密钥值
 * @returns 轮换记录
 */
export function rotateSecret(secretId: string, newValue: string): RotationRecord {
  return rotateSecretInternal(secretId, newValue, 'manual');
}

/**
 * 自动轮换密钥（由调度器触发）
 *
 * @param secretId - 密钥 ID
 * @param newValue - 新密钥值
 */
export function autoRotateSecret(secretId: string, newValue: string): RotationRecord {
  return rotateSecretInternal(secretId, newValue, 'auto');
}

/**
 * 计划轮换（由调度器触发，标记为 scheduled）
 */
export function scheduledRotateSecret(secretId: string, newValue: string): RotationRecord {
  return rotateSecretInternal(secretId, newValue, 'scheduled');
}

function rotateSecretInternal(
  secretId: string,
  newValue: string,
  trigger: RotationRecord['trigger'],
): RotationRecord {
  initRotationStore();
  const record: RotationRecord = {
    id: uuidv4(),
    secretId,
    rotatedAt: Date.now(),
    previousValueLength: 0,
    newValueLength: newValue.length,
    trigger,
    success: false,
  };

  const existing = getSecret(secretId);
  if (!existing) {
    record.error = '密钥不存在';
    persistRotationRecord(record);
    logSecretAccess(secretId, 'rotation', 'rotate', false, record.error);
    return record;
  }

  // 获取旧值长度（需解密，但只存长度不存值本身）
  // 注意：为安全起见，此处不直接获取旧明文值，仅记录长度信息
  // 长度信息可从加密载荷大致推算，不影响安全性
  record.previousValueLength = estimateValueLength(existing);

  try {
    const updated = updateSecret(secretId, { value: newValue });
    if (!updated) {
      record.error = '更新密钥失败';
      persistRotationRecord(record);
      logSecretAccess(secretId, 'rotation', 'rotate', false, record.error);
      return record;
    }

    markRotated(secretId);
    record.success = true;
    persistRotationRecord(record);
    logSecretAccess(secretId, 'rotation', 'rotate', true);
    logger.info('[SecretsRotation] 密钥轮换成功', {
      secretId,
      trigger,
      previousLength: record.previousValueLength,
      newLength: record.newValueLength,
    });
    return record;
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    record.success = false;
    persistRotationRecord(record);
    logSecretAccess(secretId, 'rotation', 'rotate', false, record.error);
    logger.error('[SecretsRotation] 密钥轮换失败', { secretId, error: record.error });
    return record;
  }
}

/**
 * 估算密钥值长度（不解密，基于密文长度粗略推算）
 *
 * AES-256-GCM 密文长度 ≈ 明文长度（密文长度 = 明文长度，因 GCM 是流式加密）
 * 此处返回密文长度作为保守估计，仅用于审计展示。
 */
function estimateValueLength(secret: SecretValue): number {
  try {
    const payload = JSON.parse(secret.valueEncrypted);
    const ct = payload?.ct ?? '';
    const ctBytes = Buffer.from(ct, 'base64');
    return ctBytes.length;
  } catch {
    return 0;
  }
}

/**
 * 持久化轮换记录
 */
function persistRotationRecord(record: RotationRecord): void {
  initRotationStore();
  const db = initDb();
  db.prepare(`
    INSERT INTO ${ROTATION_TABLE} (
      id, secret_id, rotated_at, previous_value_length, new_value_length, trigger, success, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.secretId,
    record.rotatedAt,
    record.previousValueLength,
    record.newValueLength,
    record.trigger,
    record.success ? 1 : 0,
    record.error ?? null,
  );
}

/**
 * 查询密钥的轮换历史
 */
export function getRotationHistory(secretId: string, limit: number = 50): RotationRecord[] {
  initRotationStore();
  const db = initDb();
  const rows = db.prepare(`
    SELECT * FROM ${ROTATION_TABLE} WHERE secret_id = ? ORDER BY rotated_at DESC LIMIT ?
  `).all(secretId, limit) as RotationRow[];

  return rows.map(rowToRotationRecord);
}

/**
 * 查询所有轮换记录
 */
export function getAllRotationRecords(limit: number = 100): RotationRecord[] {
  initRotationStore();
  const db = initDb();
  const rows = db.prepare(`
    SELECT * FROM ${ROTATION_TABLE} ORDER BY rotated_at DESC LIMIT ?
  `).all(limit) as RotationRow[];

  return rows.map(rowToRotationRecord);
}

function rowToRotationRecord(row: RotationRow): RotationRecord {
  return {
    id: row.id,
    secretId: row.secret_id,
    rotatedAt: row.rotated_at,
    previousValueLength: row.previous_value_length,
    newValueLength: row.new_value_length,
    trigger: row.trigger as RotationRecord['trigger'],
    success: row.success === 1,
    error: row.error ?? undefined,
  };
}

/**
 * 回退到上一次轮换前的值
 *
 * 注意：出于安全考虑，本实现不持久化旧明文值。
 * 回退需调用方提供旧值；若未提供，则记录失败。
 *
 * @param secretId - 密钥 ID
 * @param previousValue - 上一次的密钥值
 */
export function rollbackRotation(secretId: string, previousValue: string): RotationRecord {
  initRotationStore();
  const record: RotationRecord = {
    id: uuidv4(),
    secretId,
    rotatedAt: Date.now(),
    previousValueLength: 0,
    newValueLength: previousValue.length,
    trigger: 'manual',
    success: false,
  };

  try {
    const updated = updateSecret(secretId, { value: previousValue });
    if (!updated) {
      record.error = '回退失败：密钥不存在';
      persistRotationRecord(record);
      return record;
    }
    markRotated(secretId);
    record.success = true;
    record.trigger = 'manual';
    persistRotationRecord(record);
    logSecretAccess(secretId, 'rollback', 'rotate', true);
    logger.info('[SecretsRotation] 密钥已回退', { secretId });
    return record;
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    persistRotationRecord(record);
    logSecretAccess(secretId, 'rollback', 'rotate', false, record.error);
    return record;
  }
}

/**
 * 扫描需要轮换的密钥
 *
 * 触发条件（任一）：
 *   1. 密钥已绑定策略，且距上次轮换时间超过 intervalMs
 *   2. 密钥即将过期
 *
 * @param options.now - 当前时间（测试可注入）
 * @param options.expiringSoonThresholdMs - 即将过期阈值
 */
export function findSecretsNeedingRotation(options: {
  now?: number;
  expiringSoonThresholdMs?: number;
} = {}): SecretRecord[] {
  const now = options.now ?? Date.now();
  const secrets = listSecrets();
  const result: SecretRecord[] = [];

  for (const secret of secrets) {
    let needsRotation = false;

    // 1. 策略触发
    const policyId = secret.metadata?.rotationPolicyId;
    if (policyId) {
      const policy = policies.get(policyId);
      if (policy?.enabled) {
        const lastRotated = secret.metadata?.lastRotatedAt ?? secret.createdAt;
        if (now - lastRotated >= policy.intervalMs) {
          needsRotation = true;
        }
      }
    }

    // 2. 即将过期触发
    if (!needsRotation && secret.metadata?.expiresAt) {
      if (isExpiringSoon(secret.metadata.expiresAt, options.expiringSoonThresholdMs, now)) {
        needsRotation = true;
      }
    }

    if (needsRotation) result.push(secret);
  }

  return result;
}

/**
 * 获取轮换统计
 */
export function getRotationStats(): {
  totalRotations: number;
  successfulRotations: number;
  failedRotations: number;
  byTrigger: Record<string, number>;
  lastRotationAt?: number;
} {
  initRotationStore();
  const db = initDb();
  const rows = db.prepare(`
    SELECT success, trigger, rotated_at FROM ${ROTATION_TABLE} ORDER BY rotated_at DESC
  `).all() as Array<{ success: number; trigger: string; rotated_at: number }>;

  const byTrigger: Record<string, number> = {};
  let successful = 0;
  let failed = 0;
  let lastRotationAt: number | undefined;

  for (const row of rows) {
    byTrigger[row.trigger] = (byTrigger[row.trigger] ?? 0) + 1;
    if (row.success === 1) successful++;
    else failed++;
    if (lastRotationAt === undefined || row.rotated_at > lastRotationAt) {
      lastRotationAt = row.rotated_at;
    }
  }

  return {
    totalRotations: rows.length,
    successfulRotations: successful,
    failedRotations: failed,
    byTrigger,
    lastRotationAt,
  };
}
