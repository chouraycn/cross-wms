/**
 * 密钥审计模块
 *
 * 提供：
 * - 访问记录查询（基于 store 的访问日志）
 * - 变更历史追踪
 * - 合规检查（过期 / 弱密钥 / 未使用 / 明文残留）
 * - 审计报告生成
 *
 * 与 store.ts 紧密协作，read-only，不修改任何密钥数据。
 */

import { logger } from '../../logger.js';
import {
  listSecrets,
  getSecretAccessLogs,
  getSecretValue,
} from './store.js';
import { assessStrength, isExpired, isExpiringSoon } from './validator.js';
import { shannonEntropy } from './encryption.js';
import type {
  SecretRecord,
  SecretAccessLog,
  SecretsAuditReport,
  SecretsAuditFinding,
  SecretsAuditSeverity,
  SecretsAuditCode,
  SecretsAuditStatus,
  SecretAccessAction,
} from './types.js';

/** 审计版本 */
const AUDIT_REPORT_VERSION = 1;

/** 默认"未使用"阈值：30 天 */
const DEFAULT_UNUSED_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/** 审计选项 */
export interface AuditOptions {
  /** 未使用阈值（毫秒） */
  unusedThresholdMs?: number;
  /** 即将过期阈值（毫秒） */
  expiringSoonThresholdMs?: number;
  /** 当前时间戳（测试可注入） */
  now?: number;
  /** 弱密钥分数阈值 */
  weakScoreThreshold?: number;
}

/**
 * 查询访问记录
 */
export function queryAccessLogs(
  secretId?: string,
  limit: number = 100,
): SecretAccessLog[] {
  return getSecretAccessLogs(secretId, limit);
}

/**
 * 查询变更历史（write / delete / rotate 操作）
 */
export function queryChangeHistory(
  secretId?: string,
  limit: number = 100,
): SecretAccessLog[] {
  const logs = getSecretAccessLogs(secretId, limit);
  const changeActions: SecretAccessAction[] = ['write', 'delete', 'rotate'];
  return logs.filter(log => changeActions.includes(log.action));
}

/**
 * 合规检查 — 扫描所有密钥，生成审计发现
 */
export function runComplianceAudit(options: AuditOptions = {}): SecretsAuditFinding[] {
  const now = options.now ?? Date.now();
  const unusedThreshold = options.unusedThresholdMs ?? DEFAULT_UNUSED_THRESHOLD_MS;
  const weakThreshold = options.weakScoreThreshold ?? 40;
  const findings: SecretsAuditFinding[] = [];
  const secrets = listSecrets();

  for (const secret of secrets) {
    // 1. 过期检查
    if (secret.metadata?.expiresAt && isExpired(secret.metadata.expiresAt, now)) {
      findings.push({
        code: 'EXPIRED_SECRET',
        severity: 'error',
        file: '<store>',
        jsonPath: `secrets.${secret.provider}.${secret.key}`,
        message: `密钥已过期：${secret.provider}/${secret.key}`,
        provider: secret.provider,
        key: secret.key,
      });
    } else if (secret.metadata?.expiresAt && isExpiringSoon(
      secret.metadata.expiresAt,
      options.expiringSoonThresholdMs,
      now,
    )) {
      findings.push({
        code: 'EXPIRED_SECRET',
        severity: 'warn',
        file: '<store>',
        jsonPath: `secrets.${secret.provider}.${secret.key}`,
        message: `密钥即将过期：${secret.provider}/${secret.key}`,
        provider: secret.provider,
        key: secret.key,
      });
    }

    // 2. 未使用检查
    const lastAccessed = secret.metadata?.lastAccessedAt;
    if (lastAccessed && now - lastAccessed > unusedThreshold) {
      findings.push({
        code: 'UNUSED_SECRET',
        severity: 'info',
        file: '<store>',
        jsonPath: `secrets.${secret.provider}.${secret.key}`,
        message: `密钥超过 ${Math.floor(unusedThreshold / (24 * 60 * 60 * 1000))} 天未访问：${secret.provider}/${secret.key}`,
        provider: secret.provider,
        key: secret.key,
      });
    } else if (!lastAccessed && secret.createdAt && now - secret.createdAt > unusedThreshold) {
      findings.push({
        code: 'UNUSED_SECRET',
        severity: 'info',
        file: '<store>',
        jsonPath: `secrets.${secret.provider}.${secret.key}`,
        message: `密钥创建后从未被访问：${secret.provider}/${secret.key}`,
        provider: secret.provider,
        key: secret.key,
      });
    }

    // 3. 弱密钥检查（需解密才能评估强度）
    const value = getSecretValue(secret.id, 'audit');
    if (value !== null) {
      const strength = assessStrength(value);
      if (strength.score < weakThreshold) {
        findings.push({
          code: 'WEAK_SECRET',
          severity: strength.level === 'weak' ? 'error' : 'warn',
          file: '<store>',
          jsonPath: `secrets.${secret.provider}.${secret.key}`,
          message: `弱密钥（强度=${strength.score}, 等级=${strength.level}）：${secret.provider}/${secret.key}。问题：${strength.issues.join('; ')}`,
          provider: secret.provider,
          key: secret.key,
        });
      }

      // 4. 明文残留检测（高熵但存储在 encrypted store — 提示信息）
      const entropy = shannonEntropy(value);
      if (entropy >= 4.5 && value.length > 40 && secret.scope === 'global') {
        findings.push({
          code: 'PLAINTEXT_FOUND',
          severity: 'info',
          file: '<store>',
          jsonPath: `secrets.${secret.provider}.${secret.key}`,
          message: `高熵字符串存储在 global 作用域，建议改为受限作用域：${secret.provider}/${secret.key}`,
          provider: secret.provider,
          key: secret.key,
        });
      }
    }
  }

  return findings;
}

/**
 * 生成完整审计报告
 */
export function generateAuditReport(options: AuditOptions = {}): SecretsAuditReport {
  const findings = runComplianceAudit(options);
  const filesScanned = ['<store>'];

  const summary = {
    plaintextCount: findings.filter(f => f.code === 'PLAINTEXT_FOUND').length,
    unresolvedRefCount: 0,
    shadowedRefCount: 0,
    legacyResidueCount: 0,
    expiredCount: findings.filter(f => f.code === 'EXPIRED_SECRET' && f.severity === 'error').length,
    unusedCount: findings.filter(f => f.code === 'UNUSED_SECRET').length,
    weakCount: findings.filter(f => f.code === 'WEAK_SECRET').length,
  };

  const hasErrors = findings.some(f => f.severity === 'error');
  const hasWarnings = findings.some(f => f.severity === 'warn' || f.severity === 'error');
  const status: SecretsAuditStatus = hasErrors
    ? 'unresolved'
    : hasWarnings
      ? 'findings'
      : 'clean';

  logger.info('[SecretsAudit] 审计报告已生成', {
    status,
    findingCount: findings.length,
    expiredCount: summary.expiredCount,
    weakCount: summary.weakCount,
  });

  return {
    version: AUDIT_REPORT_VERSION,
    status,
    filesScanned,
    summary,
    findings,
  };
}

/**
 * 按严重级别过滤审计发现
 */
export function filterBySeverity(
  findings: SecretsAuditFinding[],
  severity: SecretsAuditSeverity,
): SecretsAuditFinding[] {
  return findings.filter(f => f.severity === severity);
}

/**
 * 按审计代码过滤
 */
export function filterByCode(
  findings: SecretsAuditFinding[],
  code: SecretsAuditCode,
): SecretsAuditFinding[] {
  return findings.filter(f => f.code === code);
}

/**
 * 统计审计发现数量
 */
export function countFindings(findings: SecretsAuditFinding[]): {
  total: number;
  bySeverity: Record<SecretsAuditSeverity, number>;
  byCode: Record<string, number>;
} {
  const bySeverity: Record<SecretsAuditSeverity, number> = {
    info: 0,
    warn: 0,
    error: 0,
  };
  const byCode: Record<string, number> = {};

  for (const f of findings) {
    bySeverity[f.severity]++;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }

  return { total: findings.length, bySeverity, byCode };
}

/**
 * 检查审计报告是否通过（无 error 级别发现）
 */
export function isAuditPassed(report: SecretsAuditReport): boolean {
  return report.status !== 'unresolved';
}

/**
 * 获取密钥的完整访问历史（按时间倒序）
 */
export function getSecretHistory(secretId: string, limit: number = 50): SecretAccessLog[] {
  return getSecretAccessLogs(secretId, limit);
}

/**
 * 获取所有密钥的访问统计
 */
export function getAccessStats(limit: number = 1000): {
  totalAccess: number;
  byAction: Record<SecretAccessAction, number>;
  bySource: Record<string, number>;
  failureCount: number;
} {
  const logs = getSecretAccessLogs(undefined, limit);
  const byAction: Record<SecretAccessAction, number> = {
    read: 0,
    write: 0,
    delete: 0,
    rotate: 0,
    export: 0,
  };
  const bySource: Record<string, number> = {};
  let failureCount = 0;

  for (const log of logs) {
    byAction[log.action]++;
    bySource[log.source] = (bySource[log.source] ?? 0) + 1;
    if (!log.success) failureCount++;
  }

  return {
    totalAccess: logs.length,
    byAction,
    bySource,
    failureCount,
  };
}

/**
 * 列出所有密钥记录（仅元数据，不含密文）
 */
export function listAllSecretsForAudit(): SecretRecord[] {
  return listSecrets();
}
