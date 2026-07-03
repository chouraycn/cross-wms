/**
 * 密钥审计模块
 *
 * 检查配置的密钥并报告明文/引用迁移状态
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';
import type {
  SecretsAuditReport,
  SecretsAuditFinding,
  SecretsAuditStatus,
  SecretValue,
} from './secretsTypes.js';
import {
  listSecrets,
  getSecretAccessLogs,
} from './secretsStore.js';
import {
  resolveSecretRef,
  validateSecretRef,
} from './secretsManager.js';

const KNOWN_SECRET_ENV_VAR_NAMES = new Set([
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'DEEPSEEK_API_KEY',
  'MINIMAX_API_KEY',
  'MOONSHOT_API_KEY',
  'NVIDIA_API_KEY',
  'GOOGLE_API_KEY',
  'MISTRAL_API_KEY',
  'OLLAMA_API_KEY',
  'BING_API_KEY',
  'SERPER_API_KEY',
  'FIRECRAWL_API_KEY',
]);

function addFinding(
  findings: SecretsAuditFinding[],
  finding: SecretsAuditFinding,
): void {
  findings.push(finding);
}

function collectEnvPlaintext(
  envPath: string,
  findings: SecretsAuditFinding[],
): string[] {
  const filesScanned: string[] = [];
  if (!fs.existsSync(envPath)) {
    return filesScanned;
  }

  filesScanned.push(envPath);
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1] ?? '';
    if (!KNOWN_SECRET_ENV_VAR_NAMES.has(key)) {
      continue;
    }

    const value = match[2]?.trim();
    if (!value || value.startsWith('$') || value.startsWith('{{')) {
      continue;
    }

    addFinding(findings, {
      code: 'PLAINTEXT_FOUND',
      severity: 'warn',
      file: envPath,
      jsonPath: `$env.${key}`,
      message: `Potential secret found in .env (${key}).`,
    });
  }

  return filesScanned;
}

function collectConfigSecrets(
  secrets: Omit<SecretValue, 'valueEncrypted'>[],
  findings: SecretsAuditFinding[],
): string[] {
  const filesScanned: string[] = [];
  const configPath = 'secrets-store';

  for (const secret of secrets) {
    filesScanned.push(configPath);

    if (secret.metadata?.expiresAt && Date.now() > secret.metadata.expiresAt) {
      addFinding(findings, {
        code: 'EXPIRED_SECRET',
        severity: 'warn',
        file: configPath,
        jsonPath: `${secret.provider}.${secret.key}`,
        message: `Secret ${secret.key} has expired (${new Date(secret.metadata.expiresAt).toISOString()}).`,
        provider: secret.provider,
        key: secret.key,
      });
    }

    const daysSinceAccess = secret.metadata?.lastAccessedAt
      ? (Date.now() - secret.metadata.lastAccessedAt) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (daysSinceAccess > 30 && secret.metadata?.accessCount === 0) {
      addFinding(findings, {
        code: 'UNUSED_SECRET',
        severity: 'info',
        file: configPath,
        jsonPath: `${secret.provider}.${secret.key}`,
        message: `Secret ${secret.key} has never been accessed (created ${new Date(secret.createdAt).toISOString()}).`,
        provider: secret.provider,
        key: secret.key,
      });
    } else if (daysSinceAccess > 90) {
      addFinding(findings, {
        code: 'UNUSED_SECRET',
        severity: 'info',
        file: configPath,
        jsonPath: `${secret.provider}.${secret.key}`,
        message: `Secret ${secret.key} has not been accessed in ${Math.round(daysSinceAccess)} days.`,
        provider: secret.provider,
        key: secret.key,
      });
    }

    if (secret.provider === 'encrypted') {
      const resolved = resolveSecretRef(
        { provider: secret.provider, key: secret.key },
        'audit',
        false,
      );
      if (!resolved) {
        addFinding(findings, {
          code: 'REF_UNRESOLVED',
          severity: 'error',
          file: configPath,
          jsonPath: `${secret.provider}.${secret.key}`,
          message: `Failed to resolve encrypted secret ${secret.key}.`,
          provider: secret.provider,
          key: secret.key,
        });
      }
    }
  }

  return filesScanned;
}

function collectFileSecrets(
  findings: SecretsAuditFinding[],
): string[] {
  const filesScanned: string[] = [];
  const secretsDir = path.join(os.homedir(), '.cdf-know-clow', 'secrets');

  if (!fs.existsSync(secretsDir)) {
    return filesScanned;
  }

  const files = fs.readdirSync(secretsDir);
  for (const file of files) {
    if (!file.endsWith('.txt')) {
      continue;
    }

    const filePath = path.join(secretsDir, file);
    filesScanned.push(filePath);

    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content.length > 0 && !content.startsWith('$') && !content.startsWith('{{')) {
        const key = file.replace('.txt', '');
        addFinding(findings, {
          code: 'PLAINTEXT_FOUND',
          severity: 'warn',
          file: filePath,
          jsonPath: `file.${key}`,
          message: `Plaintext secret found in file (${key}).`,
          provider: 'file',
          key,
        });
      }
    } catch (error) {
      logger.warn('[SecretsAudit] Failed to read secret file', { filePath });
    }
  }

  return filesScanned;
}

function summarizeFindings(
  findings: SecretsAuditFinding[],
): SecretsAuditReport['summary'] {
  return {
    plaintextCount: findings.filter((f) => f.code === 'PLAINTEXT_FOUND').length,
    unresolvedRefCount: findings.filter((f) => f.code === 'REF_UNRESOLVED').length,
    shadowedRefCount: findings.filter((f) => f.code === 'REF_SHADOWED').length,
    legacyResidueCount: findings.filter((f) => f.code === 'LEGACY_RESIDUE').length,
    expiredCount: findings.filter((f) => f.code === 'EXPIRED_SECRET').length,
    unusedCount: findings.filter((f) => f.code === 'UNUSED_SECRET').length,
  };
}

function resolveAuditStatus(
  summary: SecretsAuditReport['summary'],
  findings: SecretsAuditFinding[],
): SecretsAuditStatus {
  if (summary.unresolvedRefCount > 0) {
    return 'unresolved';
  }
  if (findings.length > 0) {
    return 'findings';
  }
  return 'clean';
}

/**
 * 运行密钥审计并返回结构化报告
 */
export async function runSecretsAudit(): Promise<SecretsAuditReport> {
  const findings: SecretsAuditFinding[] = [];
  const filesScannedSet = new Set<string>();

  const secrets = listSecrets();

  const configFiles = collectConfigSecrets(secrets, findings);
  configFiles.forEach((f) => filesScannedSet.add(f));

  const envPath = path.join(os.homedir(), '.cdf-know-clow', '.env');
  const envFiles = collectEnvPlaintext(envPath, findings);
  envFiles.forEach((f) => filesScannedSet.add(f));

  const fileSecrets = collectFileSecrets(findings);
  fileSecrets.forEach((f) => filesScannedSet.add(f));

  const summary = summarizeFindings(findings);
  const status = resolveAuditStatus(summary, findings);

  return {
    version: 1,
    status,
    filesScanned: [...filesScannedSet].sort(),
    summary,
    findings,
  };
}

/**
 * 根据审计结果计算 CLI 退出码
 */
export function resolveSecretsAuditExitCode(
  report: SecretsAuditReport,
  check: boolean,
): number {
  if (report.summary.unresolvedRefCount > 0) {
    return 2;
  }
  if (check && report.findings.length > 0) {
    return 1;
  }
  return 0;
}