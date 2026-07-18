/**
 * 密钥扫描模块
 *
 * 扫描文件与代码中的潜在密钥泄露：
 * - 明文密钥模式匹配（API Key / Token / 私钥等）
 * - 高熵字符串检测
 * - 已知密钥值精确匹配
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import { shannonEntropy } from './encryption.js';
import type { SecretScanFinding, SecretScanResult, SecretsAuditSeverity } from './types.js';

/** 扫描规则 */
interface ScanRule {
  name: string;
  pattern: RegExp;
  severity: SecretsAuditSeverity;
}

/** 默认扫描规则 */
const DEFAULT_SCAN_RULES: ScanRule[] = [
  { name: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, severity: 'error' },
  { name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'error' },
  { name: 'aliyun-access-key', pattern: /LTAI[0-9A-Za-z]{12,20}/g, severity: 'warn' },
  { name: 'tencent-secret-id', pattern: /AKID[0-9A-Za-z]{13,40}/g, severity: 'warn' },
  { name: 'google-api-key', pattern: /AIza[0-9A-Za-z\-_]{35}/g, severity: 'warn' },
  { name: 'generic-api-key', pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]([^'"]{8,})['"]/gi, severity: 'warn' },
  { name: 'bearer-token', pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, severity: 'warn' },
];

/** 默认忽略的目录 */
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache', 'tmp',
]);

/** 默认忽略的文件扩展名 */
const DEFAULT_IGNORE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.pdf', '.zip', '.gz', '.tar',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.webm', '.mp3',
]);

/** 默认扫描的文件扩展名 */
const DEFAULT_SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.env', '.yml', '.yaml', '.toml',
  '.ini', '.cfg', '.conf', '.sh', '.py', '.go', '.rs', '.java', '.xml', '.md',
]);

/** 高熵阈值 */
const HIGH_ENTROPY_THRESHOLD = 4.5;
/** 高熵字符串最小长度 */
const HIGH_ENTROPY_MIN_LENGTH = 20;

/**
 * 密钥扫描器
 */
export class SecretScanner {
  private readonly rules: ScanRule[];
  private readonly knownValues: Set<string>;
  private readonly ignoreDirs: Set<string>;
  private readonly ignoreExtensions: Set<string>;
  private readonly scanExtensions: Set<string> | null;
  private readonly minEntropy: number;
  private readonly minEntropyLength: number;

  constructor(options: {
    rules?: ScanRule[];
    ignoreDirs?: string[];
    ignoreExtensions?: string[];
    scanExtensions?: string[];
    minEntropy?: number;
    minEntropyLength?: number;
  } = {}) {
    this.rules = options.rules ?? DEFAULT_SCAN_RULES;
    this.knownValues = new Set();
    this.ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...(options.ignoreDirs ?? [])]);
    this.ignoreExtensions = new Set([...DEFAULT_IGNORE_EXTENSIONS, ...(options.ignoreExtensions ?? [])]);
    this.scanExtensions = options.scanExtensions ? new Set(options.scanExtensions) : DEFAULT_SCAN_EXTENSIONS;
    this.minEntropy = options.minEntropy ?? HIGH_ENTROPY_THRESHOLD;
    this.minEntropyLength = options.minEntropyLength ?? HIGH_ENTROPY_MIN_LENGTH;
  }

  /** 注册已知密钥值用于精确匹配扫描 */
  registerKnownValue(value: string): void {
    if (value && value.length >= 8) {
      this.knownValues.add(value);
    }
  }

  /** 清除已知密钥值 */
  clearKnownValues(): void {
    this.knownValues.clear();
  }

  /**
   * 扫描单个文件
   */
  scanFile(filePath: string): SecretScanFinding[] {
    const findings: SecretScanFinding[] = [];

    if (!this.shouldScanFile(filePath)) return findings;

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      logger.warn('[SecretScanner] 读取文件失败', { filePath, error: String(error) });
      return findings;
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineFindings = this.scanLine(line, filePath, i + 1);
      findings.push(...lineFindings);
    }

    return findings;
  }

  /**
   * 扫描单行内容
   */
  scanLine(line: string, file: string, lineNumber: number): SecretScanFinding[] {
    const findings: SecretScanFinding[] = [];

    // 1. 已知值精确匹配
    for (const value of this.knownValues) {
      const idx = line.indexOf(value);
      if (idx >= 0) {
        findings.push({
          type: 'plaintext',
          file,
          line: lineNumber,
          column: idx + 1,
          match: value,
          redacted: redactValue(value),
          severity: 'error',
        });
      }
    }

    // 2. 规则模式匹配
    for (const rule of this.rules) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(line)) !== null) {
        const matchedValue = match[0];
        const column = match.index + 1;
        findings.push({
          type: 'known_pattern',
          file,
          line: lineNumber,
          column,
          match: matchedValue,
          redacted: redactValue(matchedValue),
          severity: rule.severity,
        });
        if (match.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
      }
    }

    // 3. 高熵字符串检测
    const tokenPattern = /['"]([A-Za-z0-9+/=_\-]{20,})['"]/g;
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = tokenPattern.exec(line)) !== null) {
      const candidate = tokenMatch[1];
      if (candidate.length < this.minEntropyLength) continue;
      const entropy = shannonEntropy(candidate);
      if (entropy >= this.minEntropy) {
        findings.push({
          type: 'high_entropy',
          file,
          line: lineNumber,
          column: tokenMatch.index + 1,
          match: candidate,
          redacted: redactValue(candidate),
          severity: 'warn',
        });
      }
    }

    return findings;
  }

  /**
   * 扫描目录（递归）
   */
  scanDirectory(dirPath: string, maxFiles: number = 1000): SecretScanResult {
    const allFindings: SecretScanFinding[] = [];
    let filesScanned = 0;

    const walk = (dir: string): void => {
      if (filesScanned >= maxFiles) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (filesScanned >= maxFiles) return;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (this.ignoreDirs.has(entry.name)) continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          const before = allFindings.length;
          const findings = this.scanFile(fullPath);
          if (findings.length > 0) {
            allFindings.push(...findings);
          }
          // 仅当文件可扫描时才计数
          if (this.shouldScanFile(fullPath) && findings.length >= 0) {
            // 即使 findings 为空也算扫描了
          }
          if (findings.length >= 0 && before >= 0) {
            // 标记已扫描（简化逻辑：所有尝试读取的文件都算）
          }
          filesScanned++;
        }
      }
    };

    walk(dirPath);

    return {
      filesScanned,
      findings: allFindings,
      scannedAt: Date.now(),
    };
  }

  /**
   * 扫描字符串内容
   */
  scanContent(content: string, fileName: string = '<inline>'): SecretScanFinding[] {
    const findings: SecretScanFinding[] = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      findings.push(...this.scanLine(lines[i], fileName, i + 1));
    }
    return findings;
  }

  private shouldScanFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (this.ignoreExtensions.has(ext)) return false;
    if (this.scanExtensions && !this.scanExtensions.has(ext) && !filePath.endsWith('.env')) {
      return false;
    }
    return true;
  }
}

/**
 * 脱敏密钥值（用于扫描结果展示）
 */
function redactValue(value: string): string {
  if (value.length <= 8) return '*'.repeat(value.length);
  return value.slice(0, 4) + '*'.repeat(Math.min(value.length - 8, 20)) + value.slice(-4);
}

/**
 * 创建默认扫描器
 */
export function createDefaultScanner(): SecretScanner {
  return new SecretScanner();
}
