// 配置审计
// 参考 openclaw/src/config/io.audit.ts 的设计，审计配置变更、检测敏感数据明文存储、
// 检测废弃配置项、检测缺失必要配置，并写入 JSONL 审计日志

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AppPaths } from './appPaths.js';

// ============================================================================
// 常量
// ============================================================================

const CONFIG_AUDIT_LOG_FILENAME = 'config-audit.jsonl';
const CONFIG_AUDIT_ARGV_CAP = 8;

// 已知的敏感字段名集合（显式枚举 + 后缀启发式）
const SECRET_FLAG_NAMES = new Set([
  '--token', '--api-key', '--apikey', '--secret', '--password', '--passwd',
  '--auth-token', '--access-token', '--refresh-token', '--client-secret',
  '--bearer', '--bearer-token', '--oauth-token', '--private-key',
  '--gateway-token', '--gateway-key', '--webhook-secret', '--webhook-token',
]);

// 后缀启发式：任何 --…-(token|secret|password|api-key|...) 视为敏感 flag
const SECRET_FLAG_SUFFIX_PATTERN =
  /^--(?:[a-z0-9]+(?:-[a-z0-9]+)*-)?(?:token|secret|password|passwd|api[-_]?key|api[-_]?secret|webhook|credential|bearer|pat|private[-_]?key|recovery[-_]?key|signing[-_]?key|encryption[-_]?key|master[-_]?key|session[-_]?key|gateway[-_]?key|service[-_]?key|hook[-_]?key)$/;

// 敏感配置路径片段（用于检测明文存储的敏感数据）
const SENSITIVE_PATH_FRAGMENTS = [
  'apiKey', 'api_key', 'apiSecret', 'api_secret', 'token', 'secret',
  'password', 'passwd', 'privateKey', 'private_key', 'bearer',
];

// 已知废弃配置路径（随版本演进移除或重命名的配置项）
const DEPRECATED_CONFIG_PATHS: ReadonlyArray<{ path: string; message: string }> = [
  { path: 'gateway.legacyAuth', message: '已废弃，请使用 auth.profiles 配置鉴权' },
  { path: 'models.legacyDefault', message: '已废弃，请使用 models.default' },
  { path: 'agents.legacyConcurrency', message: '已废弃，请使用 agents.defaults.maxConcurrent' },
];

// 必要配置路径（缺失时给出告警，不阻断加载）
const REQUIRED_CONFIG_PATHS: ReadonlyArray<{ path: string; message: string }> = [
  { path: 'app.name', message: '未配置应用名称，将使用默认值' },
];

// ============================================================================
// 类型定义
// ============================================================================

export type ConfigAuditSeverity = 'info' | 'warn' | 'error';

export interface ConfigAuditFinding {
  // 严重级别
  severity: ConfigAuditSeverity;
  // 问题类别：sensitive-plaintext / deprecated / missing-required / suspicious-write / other
  category: string;
  // 涉及的配置路径
  path?: string;
  // 人类可读的问题描述
  message: string;
}

export interface ConfigAuditResult {
  // 审计时间戳（ISO 字符串）
  timestamp: string;
  // 配置文件路径
  configPath: string;
  // 配置内容的 SHA-256 哈希
  configHash: string | null;
  // 发现的问题列表
  findings: ConfigAuditFinding[];
  // 是否通过审计（无 error 级别问题即视为通过）
  passed: boolean;
}

// 配置写入审计记录（用于持久化到 JSONL 日志）
export interface ConfigWriteAuditRecord {
  ts: string;
  source: 'config-io';
  event: 'config.write';
  configPath: string;
  previousHash: string | null;
  nextHash: string;
  changedPathCount: number | null;
  suspicious: string[];
  pid: number;
  cwd: string;
  argv: string[];
}

// ============================================================================
// CLI argv 脱敏
// ============================================================================

function isSecretFlagName(flagName: string): boolean {
  if (SECRET_FLAG_NAMES.has(flagName)) {
    return true;
  }
  return SECRET_FLAG_SUFFIX_PATTERN.test(flagName);
}

function parseFlagName(arg: string): string | null {
  if (!arg.startsWith('--')) {
    return null;
  }
  const eq = arg.indexOf('=');
  return (eq === -1 ? arg : arg.slice(0, eq)).toLowerCase();
}

// 脱敏 CLI argv：对敏感 flag 的值替换为 ***
export function redactConfigAuditArgv(argv: readonly string[]): string[] {
  const result: string[] = [];
  let redactNext = false;
  for (const current of argv) {
    if (redactNext) {
      redactNext = false;
      result.push('***');
      continue;
    }
    const currentFlag = parseFlagName(current);
    if (currentFlag !== null && isSecretFlagName(currentFlag)) {
      if (current.includes('=')) {
        const eq = current.indexOf('=');
        result.push(`${current.slice(0, eq + 1)}***`);
        continue;
      }
      result.push(current);
      redactNext = true;
      continue;
    }
    result.push(current);
  }
  return result;
}

function capArgv(argv: readonly string[] | undefined): string[] {
  if (!Array.isArray(argv)) {
    return [];
  }
  return argv.slice(0, CONFIG_AUDIT_ARGV_CAP);
}

// ============================================================================
// 配置内容哈希
// ============================================================================

// 计算配置内容的 SHA-256 哈希，用于变更检测
export function hashConfigContent(raw: string | null): string {
  const hash = crypto.createHash('sha256');
  if (raw === null) {
    hash.update('missing');
  } else {
    hash.update('present\0');
    hash.update(raw, 'utf-8');
  }
  return hash.digest('hex');
}

// ============================================================================
// 路径遍历与检测
// ============================================================================

function getPathValue(root: unknown, pathSegments: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const key of pathSegments) {
    if (cursor === null || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function splitPath(path: string): string[] {
  return path.split('.').filter(Boolean);
}

// 判断字段名是否为敏感字段
function isSensitiveField(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_PATH_FRAGMENTS.some((fragment) => {
    const lowerFragment = fragment.toLowerCase();
    return lower === lowerFragment || lower.endsWith(lowerFragment) || lower.includes(lowerFragment);
  });
}

// 递归遍历配置对象，检测敏感字段是否以明文字符串形式存储
function detectSensitivePlaintext(
  value: unknown,
  pathPrefix: string,
  findings: ConfigAuditFinding[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      detectSensitivePlaintext(item, `${pathPrefix}[${index}]`, findings);
    });
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      if (typeof child === 'string' && child.length > 0 && isSensitiveField(key)) {
        // 仅当值看起来像明文（非空且非 *** 占位、非 ${...} 引用）时报告
        if (child !== '***' && !/^\$\{[^}]+\}$/.test(child)) {
          findings.push({
            severity: 'warn',
            category: 'sensitive-plaintext',
            path: childPath,
            message: `敏感字段 "${key}" 以明文形式存储，建议改用 secret 引用`,
          });
        }
      }
      detectSensitivePlaintext(child, childPath, findings);
    }
  }
}

// ============================================================================
// 审计主入口
// ============================================================================

export interface AuditConfigOptions {
  // 配置文件路径
  configPath: string;
  // 原始配置内容字符串（用于哈希）
  rawContent?: string | null;
  // 已解析的配置对象
  parsedConfig?: unknown;
  // 额外的废弃配置规则
  extraDeprecatedPaths?: ReadonlyArray<{ path: string; message: string }>;
  // 额外的必要配置规则
  extraRequiredPaths?: ReadonlyArray<{ path: string; message: string }>;
}

// 审计配置：检测敏感明文、废弃配置项、缺失必要配置
export function auditConfig(options: AuditConfigOptions): ConfigAuditResult {
  const findings: ConfigAuditFinding[] = [];
  const timestamp = new Date().toISOString();
  const configHash = options.rawContent !== undefined && options.rawContent !== null
    ? hashConfigContent(options.rawContent)
    : null;

  const parsed = options.parsedConfig;
  if (parsed !== null && typeof parsed === 'object') {
    // 1. 检测敏感字段明文存储
    detectSensitivePlaintext(parsed, '', findings);

    // 2. 检测废弃配置项
    const deprecatedPaths = [...DEPRECATED_CONFIG_PATHS, ...(options.extraDeprecatedPaths ?? [])];
    for (const rule of deprecatedPaths) {
      const value = getPathValue(parsed, splitPath(rule.path));
      if (value !== undefined) {
        findings.push({
          severity: 'warn',
          category: 'deprecated',
          path: rule.path,
          message: rule.message,
        });
      }
    }

    // 3. 检测缺失必要配置
    const requiredPaths = [...REQUIRED_CONFIG_PATHS, ...(options.extraRequiredPaths ?? [])];
    for (const rule of requiredPaths) {
      const value = getPathValue(parsed, splitPath(rule.path));
      if (value === undefined || value === null || value === '') {
        findings.push({
          severity: 'info',
          category: 'missing-required',
          path: rule.path,
          message: rule.message,
        });
      }
    }
  }

  const passed = !findings.some((finding) => finding.severity === 'error');
  return {
    timestamp,
    configPath: options.configPath,
    configHash,
    findings,
    passed,
  };
}

// ============================================================================
// 审计日志持久化
// ============================================================================

// 解析审计日志路径（位于 AppPaths.logsDir 下）
export function resolveConfigAuditLogPath(): string {
  return path.join(AppPaths.logsDir, CONFIG_AUDIT_LOG_FILENAME);
}

// 构造配置写入审计记录
export function createConfigWriteAuditRecord(params: {
  configPath: string;
  previousHash: string | null;
  nextHash: string;
  changedPathCount?: number | null;
  suspicious?: string[];
  now?: string;
}): ConfigWriteAuditRecord {
  return {
    ts: params.now ?? new Date().toISOString(),
    source: 'config-io',
    event: 'config.write',
    configPath: params.configPath,
    previousHash: params.previousHash,
    nextHash: params.nextHash,
    changedPathCount: typeof params.changedPathCount === 'number' ? params.changedPathCount : null,
    suspicious: params.suspicious ?? [],
    pid: process.pid,
    cwd: process.cwd(),
    argv: redactConfigAuditArgv(capArgv(process.argv)),
  };
}

// 追加一条审计记录到 JSONL 日志（best-effort，失败不抛出）
export async function appendConfigAuditRecord(record: ConfigWriteAuditRecord): Promise<void> {
  try {
    const auditPath = resolveConfigAuditLogPath();
    await fs.promises.mkdir(path.dirname(auditPath), { recursive: true });
    await fs.promises.appendFile(auditPath, `${JSON.stringify(record)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    // best-effort：审计日志写入失败不应影响主流程
  }
}

// 同步追加一条审计记录（best-effort）
export function appendConfigAuditRecordSync(record: ConfigWriteAuditRecord): void {
  try {
    const auditPath = resolveConfigAuditLogPath();
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, `${JSON.stringify(record)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    // best-effort
  }
}

// 格式化配置覆盖日志消息
export function formatConfigOverwriteLogMessage(params: {
  configPath: string;
  previousHash: string | null;
  nextHash: string;
  changedPathCount?: number;
}): string {
  const changeSummary =
    typeof params.changedPathCount === 'number' ? `, changedPaths=${params.changedPathCount}` : '';
  return `Config overwrite: ${params.configPath} (sha256 ${params.previousHash ?? 'unknown'} -> ${params.nextHash}${changeSummary})`;
}
