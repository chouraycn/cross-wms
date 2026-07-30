/**
 * 密钥审计模块
 *
 * 基于 secretsStore.ts 实现的密钥安全审计功能。
 * 扫描所有存储的密钥，检测以下安全问题：
 * - 明文存储检测（PLAINTEXT_FOUND）：value_encrypted 无法通过 AES-256-GCM 解密
 * - 过期密钥（EXPIRED_SECRET）：expires_at 已过期
 * - 长时间未使用的密钥（UNUSED_SECRET）：last_accessed_at 超过阈值
 * - 高访问次数密钥（HIGH_ACCESS_COUNT）：access_count 超过阈值
 * - 失败访问记录（FAILED_ACCESS）：secrets_access_log 中存在 success=0 的记录
 *
 * 审计历史报告持久化到 app_settings 表。
 */

import { initDb } from '../db.js';
import { logger } from '../logger.js';
import { decrypt, ensureEncryptionKey } from './crypto.js';
import { listSecrets } from './secretsStore.js';

// ===================== 类型定义 =====================

/**
 * 密钥审计发现代码
 */
export type SecretsAuditCode =
  | 'PLAINTEXT_FOUND'
  | 'EXPIRED_SECRET'
  | 'UNUSED_SECRET'
  | 'HIGH_ACCESS_COUNT'
  | 'FAILED_ACCESS';

/**
 * 密钥审计严重级别
 */
export type SecretsAuditSeverity = 'info' | 'warn' | 'error';

/**
 * 密钥审计发现条目
 */
export interface SecretsAuditFinding {
  /** 发现代码 */
  code: SecretsAuditCode;
  /** 严重级别 */
  severity: SecretsAuditSeverity;
  /** 关联的密钥 ID */
  secretId: string;
  /** 密钥提供者 */
  provider: string;
  /** 密钥标识符 */
  key: string;
  /** 发现描述信息 */
  message: string;
  /** 额外详情 */
  details?: Record<string, unknown>;
}

/**
 * 密钥审计报告
 */
export interface SecretsAuditReport {
  /** 审计时间戳（ISO 8601） */
  timestamp: string;
  /** 审计状态：clean 无问题，findings 存在问题 */
  status: 'clean' | 'findings';
  /** 审计摘要 */
  summary: {
    /** 密钥总数 */
    totalSecrets: number;
    /** 发现总数 */
    totalFindings: number;
    /** 按严重级别统计 */
    bySeverity: Record<string, number>;
    /** 按发现代码统计 */
    byCode: Record<string, number>;
  };
  /** 发现列表 */
  findings: SecretsAuditFinding[];
}

/**
 * 密钥审计选项
 */
export interface SecretsAuditOptions {
  /** 是否检查过期密钥，默认 true */
  checkExpired?: boolean;
  /** 是否检查长时间未使用的密钥，默认 true */
  checkUnused?: boolean;
  /** 未使用阈值（天），默认 90 */
  unusedDaysThreshold?: number;
  /** 是否检查高访问次数密钥，默认 true */
  checkHighAccess?: boolean;
  /** 高访问次数阈值，默认 10000 */
  highAccessThreshold?: number;
}

// ===================== 常量 =====================

/** app_settings 中存储审计历史的 key */
const AUDIT_HISTORY_KEY = 'secrets_audit_history';

/** 默认未使用阈值（天） */
const DEFAULT_UNUSED_DAYS_THRESHOLD = 90;

/** 默认高访问次数阈值 */
const DEFAULT_HIGH_ACCESS_THRESHOLD = 10000;

/** 审计历史最大保留条数 */
const MAX_HISTORY_ENTRIES = 100;

/** 默认审计历史返回条数 */
const DEFAULT_HISTORY_LIMIT = 50;

/** 毫秒/天 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ===================== 辅助函数 =====================

/**
 * 检查 value_encrypted 是否为明文存储
 *
 * 通过尝试 AES-256-GCM 解密来判断：若解密失败则判定为明文。
 *
 * @param valueEncrypted - 存储的加密值
 * @param encryptionKey - base64 编码的加密密钥
 * @returns true 表示疑似明文存储
 */
function isValuePlaintext(valueEncrypted: string, encryptionKey: string): boolean {
  try {
    decrypt(valueEncrypted, encryptionKey);
    return false;
  } catch {
    return true;
  }
}

/**
 * 构建 bySeverity 统计映射（预初始化所有级别为 0）
 */
function buildBySeverityMap(): Record<string, number> {
  return { info: 0, warn: 0, error: 0 };
}

/**
 * 构建 byCode 统计映射（预初始化所有代码为 0）
 */
function buildByCodeMap(): Record<string, number> {
  return {
    PLAINTEXT_FOUND: 0,
    EXPIRED_SECRET: 0,
    UNUSED_SECRET: 0,
    HIGH_ACCESS_COUNT: 0,
    FAILED_ACCESS: 0,
  };
}

/**
 * 确保 app_settings 表存在
 */
function ensureAppSettingsTable(): void {
  const db = initDb();
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
}

// ===================== 审计函数 =====================

/**
 * 执行密钥安全审计
 *
 * 扫描所有存储的密钥，按选项检查以下安全问题：
 * 1. 明文存储检测 — value_encrypted 无法解密则判定为明文（severity: error）
 * 2. 过期密钥 — expires_at 早于当前时间（severity: warn）
 * 3. 长时间未使用 — last_accessed_at（或 created_at）超过阈值天数（severity: warn）
 * 4. 高访问次数 — access_count 超过阈值（severity: info）
 * 5. 失败访问记录 — secrets_access_log 中 success=0 的记录按密钥聚合（severity: warn）
 *
 * @param options - 审计选项，可选择性启用/禁用各项检查并配置阈值
 * @returns 审计报告
 */
export async function runSecretsAudit(
  options?: SecretsAuditOptions,
): Promise<SecretsAuditReport> {
  const {
    checkExpired = true,
    checkUnused = true,
    unusedDaysThreshold = DEFAULT_UNUSED_DAYS_THRESHOLD,
    checkHighAccess = true,
    highAccessThreshold = DEFAULT_HIGH_ACCESS_THRESHOLD,
  } = options ?? {};

  // 获取所有密钥（不含加密值），同时确保表已初始化
  const secrets = listSecrets();
  const db = initDb();
  const encryptionKey = ensureEncryptionKey();

  const findings: SecretsAuditFinding[] = [];
  const now = Date.now();
  const unusedThresholdMs = unusedDaysThreshold * MS_PER_DAY;

  // 构建 secret_id -> { provider, key } 映射，用于失败访问记录查找
  const secretInfoMap = new Map<string, { provider: string; key: string }>();
  for (const secret of secrets) {
    secretInfoMap.set(secret.id, { provider: secret.provider, key: secret.key });
  }

  // 单次查询获取所有密钥的加密值，用于明文检测
  const valueRows = db.prepare('SELECT id, value_encrypted FROM secrets').all() as Array<{
    id: string;
    value_encrypted: string;
  }>;
  const valueMap = new Map<string, string>();
  for (const row of valueRows) {
    valueMap.set(row.id, row.value_encrypted);
  }

  // 逐个检查密钥
  for (const secret of secrets) {
    const { id, provider, key } = secret;
    const valueEncrypted = valueMap.get(id) ?? '';

    // 1. 明文存储检测
    if (isValuePlaintext(valueEncrypted, encryptionKey)) {
      findings.push({
        code: 'PLAINTEXT_FOUND',
        severity: 'error',
        secretId: id,
        provider,
        key,
        message: `密钥 "${key}"（provider: ${provider}）的值无法通过 AES-256-GCM 解密，可能以明文存储。`,
        details: { valueLength: valueEncrypted.length },
      });
    }

    // 2. 过期密钥检测
    if (checkExpired) {
      const expiresAt = secret.metadata?.expiresAt;
      if (expiresAt !== undefined && expiresAt < now) {
        findings.push({
          code: 'EXPIRED_SECRET',
          severity: 'warn',
          secretId: id,
          provider,
          key,
          message: `密钥 "${key}"（provider: ${provider}）已于 ${new Date(expiresAt).toISOString()} 过期。`,
          details: {
            expiresAt,
            expiredDaysAgo: Math.floor((now - expiresAt) / MS_PER_DAY),
          },
        });
      }
    }

    // 3. 长时间未使用检测
    if (checkUnused) {
      const lastAccessedAt = secret.metadata?.lastAccessedAt;
      // 从未访问过的密钥以创建时间为基准
      const referenceTime = lastAccessedAt ?? secret.createdAt;
      const idleMs = now - referenceTime;
      if (idleMs > unusedThresholdMs) {
        const idleDays = Math.floor(idleMs / MS_PER_DAY);
        findings.push({
          code: 'UNUSED_SECRET',
          severity: 'warn',
          secretId: id,
          provider,
          key,
          message:
            lastAccessedAt === undefined
              ? `密钥 "${key}"（provider: ${provider}）自创建以来从未被访问（已超过 ${unusedDaysThreshold} 天）。`
              : `密钥 "${key}"（provider: ${provider}）已 ${idleDays} 天未被访问。`,
          details: {
            lastAccessedAt: lastAccessedAt ?? null,
            createdAt: secret.createdAt,
            idleDays,
            thresholdDays: unusedDaysThreshold,
          },
        });
      }
    }

    // 4. 高访问次数检测
    if (checkHighAccess) {
      const accessCount = secret.metadata?.accessCount ?? 0;
      if (accessCount > highAccessThreshold) {
        findings.push({
          code: 'HIGH_ACCESS_COUNT',
          severity: 'info',
          secretId: id,
          provider,
          key,
          message: `密钥 "${key}"（provider: ${provider}）访问次数 ${accessCount} 超过阈值 ${highAccessThreshold}。`,
          details: { accessCount, threshold: highAccessThreshold },
        });
      }
    }
  }

  // 5. 失败访问记录检测 — 按密钥聚合 success=0 的日志
  const failedAccessRows = db
    .prepare(
      `SELECT secret_id, COUNT(*) as fail_count, MAX(accessed_at) as last_failed_at
       FROM secrets_access_log
       WHERE success = 0
       GROUP BY secret_id`,
    )
    .all() as Array<{ secret_id: string; fail_count: number; last_failed_at: number }>;

  for (const row of failedAccessRows) {
    const info = secretInfoMap.get(row.secret_id);
    const provider = info?.provider ?? 'unknown';
    const key = info?.key ?? 'unknown';
    findings.push({
      code: 'FAILED_ACCESS',
      severity: 'warn',
      secretId: row.secret_id,
      provider,
      key,
      message: `密钥 "${key}"（provider: ${provider}）存在 ${row.fail_count} 次失败访问记录。`,
      details: {
        failCount: row.fail_count,
        lastFailedAt: row.last_failed_at,
      },
    });
  }

  // 构建摘要统计
  const bySeverity = buildBySeverityMap();
  const byCode = buildByCodeMap();
  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;
  }

  const report: SecretsAuditReport = {
    timestamp: new Date(now).toISOString(),
    status: findings.length > 0 ? 'findings' : 'clean',
    summary: {
      totalSecrets: secrets.length,
      totalFindings: findings.length,
      bySeverity,
      byCode,
    },
    findings,
  };

  logger.info('[SecretsAudit] 审计完成', {
    totalSecrets: secrets.length,
    totalFindings: findings.length,
    status: report.status,
  });

  return report;
}

// ===================== 审计历史 =====================

/**
 * 获取审计历史报告
 *
 * 从 app_settings 表读取历史审计报告（JSON 数组），按时间倒序返回最近的若干条。
 *
 * @param limit - 返回的最大条数，默认 50
 * @returns 审计报告列表（最近的在前）
 */
export async function getAuditHistory(
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<SecretsAuditReport[]> {
  ensureAppSettingsTable();
  const db = initDb();

  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(
    AUDIT_HISTORY_KEY,
  ) as { value: string } | undefined;

  if (!row) return [];

  try {
    const reports = JSON.parse(row.value) as SecretsAuditReport[];
    if (!Array.isArray(reports)) return [];
    // 历史按时间正序存储，返回时倒序（最近的在前）并截取 limit 条
    return reports.slice(-limit).reverse();
  } catch (error) {
    logger.error('[SecretsAudit] 解析审计历史失败', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * 保存审计报告到历史记录
 *
 * 将报告追加到 app_settings 表中存储的审计历史 JSON 数组，
 * 历史记录上限为 100 条，超出时自动淘汰最早的记录。
 *
 * @param report - 要保存的审计报告
 */
export async function saveAuditReport(report: SecretsAuditReport): Promise<void> {
  ensureAppSettingsTable();
  const db = initDb();

  // 读取现有历史
  let history: SecretsAuditReport[] = [];
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(
    AUDIT_HISTORY_KEY,
  ) as { value: string } | undefined;

  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        history = parsed as SecretsAuditReport[];
      }
    } catch {
      // 历史数据损坏，从空开始重建
      logger.warn('[SecretsAudit] 审计历史数据损坏，将重新初始化');
    }
  }

  // 追加新报告
  history.push(report);

  // 限制历史长度，淘汰最早记录
  if (history.length > MAX_HISTORY_ENTRIES) {
    history = history.slice(-MAX_HISTORY_ENTRIES);
  }

  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
    AUDIT_HISTORY_KEY,
    JSON.stringify(history),
  );

  logger.info('[SecretsAudit] 审计报告已保存', {
    timestamp: report.timestamp,
    totalFindings: report.summary.totalFindings,
    historySize: history.length,
  });
}
