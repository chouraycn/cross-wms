import { randomUUID } from 'node:crypto';

export type SecurityRiskType =
  | 'pii'
  | 'secret'
  | 'path-traversal'
  | 'command-injection'
  | 'xss'
  | 'sql-injection'
  | 'prompt-injection'
  | 'sensitive-url'
  | 'dangerous-code';

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export type OverallRisk = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface SecurityRisk {
  readonly type: SecurityRiskType;
  readonly severity: RiskSeverity;
  readonly matched: string;
  readonly position: { readonly start: number; readonly end: number };
  readonly recommendation: string;
}

export interface ScanResult {
  readonly passed: boolean;
  readonly risks: SecurityRisk[];
  readonly sanitizedContent?: string;
  readonly overallRisk: OverallRisk;
}

export interface PIIPattern {
  readonly name: string;
  readonly type: SecurityRiskType;
  readonly pattern: RegExp;
  readonly description: string;
}

export interface ScanContext {
  readonly toolName?: string;
  readonly inputSource?: 'user' | 'tool' | 'system';
  readonly sessionId?: string;
}

export interface SecurityAuditRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly scanType: 'input' | 'output';
  readonly toolName?: string;
  readonly risks: SecurityRisk[];
  readonly action: 'blocked' | 'sanitized' | 'allowed';
  readonly sessionId?: string;
}

export interface SecurityAuditQueryOptions {
  readonly scanType?: 'input' | 'output';
  readonly toolName?: string;
  readonly action?: SecurityAuditRecord['action'];
  readonly startTime?: number;
  readonly endTime?: number;
  readonly limit?: number;
}

export interface SecurityFilterConfig {
  readonly enabledChecks: Set<SecurityRiskType>;
  readonly piiPatterns: PIIPattern[];
  readonly customSensitiveWords: string[];
  readonly autoSanitize: boolean;
  readonly maskChar: string;
  readonly maxContentLength: number;
}

interface RiskPatternDef {
  readonly pattern: RegExp;
  readonly severity: RiskSeverity;
  readonly description: string;
}

const SEVERITY_WEIGHT: Record<RiskSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export const DEFAULT_PII_PATTERNS: readonly PIIPattern[] = [
  { name: 'email', type: 'pii', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gu, description: '电子邮箱地址' },
  { name: 'china-phone', type: 'pii', pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/gu, description: '中国大陆手机号码' },
  { name: 'international-phone', type: 'pii', pattern: /(?<!\d)\+\d{1,3}[-\s]?\d{4,14}(?!\d)/gu, description: '国际手机号码' },
  { name: 'china-id-card', type: 'pii', pattern: /(?<!\d)\d{17}[\dXx](?!\d)/gu, description: '中国大陆身份证号' },
  { name: 'bank-card', type: 'pii', pattern: /(?<!\d)\d{16,19}(?!\d)/gu, description: '银行卡号' },
  { name: 'ipv4', type: 'pii', pattern: /(?<!\d)(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(?!\d)/gu, description: 'IPv4 地址' },
];

export const DEFAULT_ENABLED_CHECKS: readonly SecurityRiskType[] = [
  'pii', 'secret', 'path-traversal', 'command-injection', 'xss',
  'sql-injection', 'prompt-injection', 'sensitive-url', 'dangerous-code',
];

const SECRET_PATTERNS: readonly RiskPatternDef[] = [
  { pattern: /\bsk-[a-zA-Z0-9]{20,}\b/gu, severity: 'critical', description: 'OpenAI 风格 API 密钥（sk- 前缀）' },
  { pattern: /\bBearer\s+[a-zA-Z0-9._~+/=-]{20,}\b/gu, severity: 'high', description: 'Bearer 令牌' },
  { pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu, severity: 'critical', description: 'AWS 访问密钥 ID' },
  { pattern: /\b[a-zA-Z0-9_-]{32,}\b/gu, severity: 'medium', description: '疑似长密钥字符串' },
];

const PATH_TRAVERSAL_PATTERNS: readonly RiskPatternDef[] = [
  { pattern: /\.\.[\\/]\.\.[\\/]\.\.[\\/]/gu, severity: 'high', description: '多层上级目录跳转' },
  { pattern: /\.\.[\\/]/gu, severity: 'medium', description: '上级目录跳转' },
  { pattern: /\.\.%2[fF]|\.\.%5[cCdD]/gu, severity: 'high', description: 'URL 编码的路径遍历' },
];

const COMMAND_INJECTION_PATTERNS: readonly RiskPatternDef[] = [
  { pattern: /[;&|`$]\s*(?:rm|del|format|shutdown|reboot|mkfs|dd|chmod|chown)\b/gu, severity: 'critical', description: '危险命令调用' },
  { pattern: /\$\([^)]*\)/gu, severity: 'high', description: '命令替换 $(...)' },
  { pattern: /`[^`]*`/gu, severity: 'high', description: '反引号命令替换' },
  { pattern: /&&|\|\|/gu, severity: 'medium', description: '命令链操作符' },
];

const PROMPT_INJECTION_PATTERNS: readonly RiskPatternDef[] = [
  { pattern: /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/giu, severity: 'critical', description: '忽略先前指令' },
  { pattern: /\bdisregard\s+(?:all\s+)?(?:previous|prior)\s+instructions\b/giu, severity: 'critical', description: '无视先前指令' },
  { pattern: /\b(?:you\s+are|act\s+as|pretend\s+to\s+be)\s+(?:a|an)?\s*(?:root|admin|developer|sudo)\b/giu, severity: 'high', description: '角色越权诱导' },
  { pattern: /\b(?:reveal|show|print|output)\s+(?:the\s+)?(?:system|hidden|secret)\s+prompt\b/giu, severity: 'high', description: '泄露系统提示词' },
];

const XSS_PATTERNS: readonly RiskPatternDef[] = [
  { pattern: /<script[^>]*>[\s\S]*?<\/script>/gi, severity: 'high', description: 'HTML script 标签注入' },
  { pattern: /javascript:/gi, severity: 'high', description: 'JavaScript URL 协议' },
  { pattern: /on\w+\s*=\s*["'][^"']*["']/gi, severity: 'medium', description: '事件处理器属性' },
];

const SQL_INJECTION_PATTERNS: readonly RiskPatternDef[] = [
  { pattern: /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC)\b/gi, severity: 'high', description: 'SQL 关键字' },
  { pattern: /['"]\s*OR\s*\d+\s*=\s*\d+/gi, severity: 'critical', description: 'SQL 布尔注入' },
  { pattern: /['"]\s*AND\s*\d+\s*=\s*\d+/gi, severity: 'high', description: 'SQL 逻辑注入' },
];

const SENSITIVE_URL_PATTERNS: readonly RiskPatternDef[] = [
  { pattern: /https?:\/\/[^\/]*localhost[^\/]*/gi, severity: 'high', description: '本地主机 URL' },
  { pattern: /https?:\/\/[^\/]*127\.\d+\.\d+\.\d+/gi, severity: 'high', description: '回环地址 URL' },
  { pattern: /https?:\/\/[^\/]*10\.\d+\.\d+\.\d+/gi, severity: 'medium', description: '内网地址 URL' },
  { pattern: /https?:\/\/[^\/]*172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+/gi, severity: 'medium', description: '内网地址 URL' },
  { pattern: /https?:\/\/[^\/]*192\.168\.\d+\.\d+/gi, severity: 'medium', description: '内网地址 URL' },
];

const DANGEROUS_CODE_PATTERNS: readonly RiskPatternDef[] = [
  { pattern: /(?:eval|Function)\s*\(\s*['"]/g, severity: 'critical', description: '动态代码执行' },
  { pattern: /document\.cookie\s*=/gi, severity: 'high', description: 'Cookie 操作' },
  { pattern: /localStorage\.(?:getItem|setItem|removeItem|clear)/gi, severity: 'medium', description: '本地存储操作' },
];

const DEFAULT_CONFIG: SecurityFilterConfig = {
  enabledChecks: new Set(DEFAULT_ENABLED_CHECKS),
  piiPatterns: [...DEFAULT_PII_PATTERNS],
  customSensitiveWords: [],
  autoSanitize: false,
  maskChar: '*',
  maxContentLength: 1_000_000,
};

function aggregateRisk(severities: RiskSeverity[]): OverallRisk {
  if (severities.length === 0) return 'none';
  const max = Math.max(...severities.map((s) => SEVERITY_WEIGHT[s]));
  if (max >= SEVERITY_WEIGHT.critical) return 'critical';
  if (max >= SEVERITY_WEIGHT.high) return 'high';
  if (max >= SEVERITY_WEIGHT.medium) return 'medium';
  return 'low';
}

function collectMatches(
  content: string,
  pattern: RegExp,
  type: SecurityRiskType,
  severity: RiskSeverity,
  recommendation: string,
): SecurityRisk[] {
  const risks: SecurityRisk[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const matched = match[0];
    if (!matched) {
      if (pattern.lastIndex === match.index) pattern.lastIndex++;
      continue;
    }
    risks.push({ type, severity, matched, position: { start: match.index, end: match.index + matched.length }, recommendation });
  }
  return risks;
}

function detectByPatterns(
  content: string,
  patterns: readonly RiskPatternDef[],
  type: SecurityRiskType,
  prefix: string,
): SecurityRisk[] {
  const risks: SecurityRisk[] = [];
  for (const item of patterns) {
    risks.push(...collectMatches(content, new RegExp(item.pattern.source, item.pattern.flags), type, item.severity, `${prefix}${item.description}`));
  }
  return risks;
}

export class SecurityFilter {
  private config: SecurityFilterConfig;
  private auditLog: SecurityAuditRecord[] = [];
  private readonly maxLogSize = 10000;

  constructor(config?: Partial<SecurityFilterConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      enabledChecks: config?.enabledChecks ? new Set(config.enabledChecks) : new Set(DEFAULT_ENABLED_CHECKS),
      piiPatterns: config?.piiPatterns ? [...config.piiPatterns] : [...DEFAULT_PII_PATTERNS],
      customSensitiveWords: config?.customSensitiveWords ? [...config.customSensitiveWords] : [],
    };
  }

  scanInput(content: string, context?: ScanContext): ScanResult {
    return this.scan(content, 'input', context);
  }

  scanOutput(content: string, context?: ScanContext): ScanResult {
    return this.scan(content, 'output', context);
  }

  sanitize(content: string, risks: SecurityRisk[]): string {
    if (risks.length === 0) return content;
    const sorted = [...risks].sort((a, b) => b.position.start - a.position.start);
    let result = content;
    for (const risk of sorted) {
      const { start, end } = risk.position;
      const mask = this.config.maskChar.repeat(Math.max(1, end - start));
      result = result.slice(0, start) + mask + result.slice(end);
    }
    return result;
  }

  detectPII(content: string): SecurityRisk[] {
    const risks: SecurityRisk[] = [];
    for (const pattern of this.config.piiPatterns) {
      risks.push(...collectMatches(content, new RegExp(pattern.pattern.source, pattern.pattern.flags), 'pii', 'high', `请脱敏处理${pattern.description}`));
    }
    return risks;
  }

  detectSecrets(content: string): SecurityRisk[] {
    return detectByPatterns(content, SECRET_PATTERNS, 'secret', '移除');
  }

  detectPathTraversal(content: string): SecurityRisk[] {
    return detectByPatterns(content, PATH_TRAVERSAL_PATTERNS, 'path-traversal', '限制路径访问，');
  }

  detectCommandInjection(content: string): SecurityRisk[] {
    return detectByPatterns(content, COMMAND_INJECTION_PATTERNS, 'command-injection', '禁止执行注入命令，');
  }

  detectPromptInjection(content: string): SecurityRisk[] {
    return detectByPatterns(content, PROMPT_INJECTION_PATTERNS, 'prompt-injection', '拦截提示注入，');
  }

  detectXSS(content: string): SecurityRisk[] {
    return detectByPatterns(content, XSS_PATTERNS, 'xss', '过滤 HTML 注入，');
  }

  detectSQLInjection(content: string): SecurityRisk[] {
    return detectByPatterns(content, SQL_INJECTION_PATTERNS, 'sql-injection', '拦截 SQL 注入，');
  }

  detectSensitiveURL(content: string): SecurityRisk[] {
    return detectByPatterns(content, SENSITIVE_URL_PATTERNS, 'sensitive-url', '禁止访问敏感地址，');
  }

  detectDangerousCode(content: string): SecurityRisk[] {
    return detectByPatterns(content, DANGEROUS_CODE_PATTERNS, 'dangerous-code', '禁止危险代码，');
  }

  recordAudit(record: Omit<SecurityAuditRecord, 'id' | 'timestamp'>): void {
    this.auditLog.push({ ...record, id: randomUUID(), timestamp: Date.now() });
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxLogSize);
    }
  }

  queryAudit(options: SecurityAuditQueryOptions): SecurityAuditRecord[] {
    let results = [...this.auditLog];
    if (options.scanType !== undefined) results = results.filter((e) => e.scanType === options.scanType);
    if (options.toolName !== undefined) results = results.filter((e) => e.toolName === options.toolName);
    if (options.action !== undefined) results = results.filter((e) => e.action === options.action);
    if (options.startTime !== undefined) results = results.filter((e) => e.timestamp >= options.startTime!);
    if (options.endTime !== undefined) results = results.filter((e) => e.timestamp <= options.endTime!);
    results.sort((a, b) => b.timestamp - a.timestamp);
    if (options.limit !== undefined && options.limit > 0) results = results.slice(0, options.limit);
    return results;
  }

  updateConfig(config: Partial<SecurityFilterConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      enabledChecks: config.enabledChecks ? new Set(config.enabledChecks) : this.config.enabledChecks,
      piiPatterns: config.piiPatterns ? [...config.piiPatterns] : this.config.piiPatterns,
      customSensitiveWords: config.customSensitiveWords ? [...config.customSensitiveWords] : this.config.customSensitiveWords,
    };
  }

  getConfig(): Readonly<SecurityFilterConfig> {
    return { ...this.config };
  }

  private scan(content: string, scanType: 'input' | 'output', context?: ScanContext): ScanResult {
    if (content.length > this.config.maxContentLength) {
      const risk: SecurityRisk = {
        type: 'dangerous-code', severity: 'medium', matched: content.slice(0, 50),
        position: { start: 0, end: Math.min(50, content.length) },
        recommendation: `内容超出最大长度限制 ${this.config.maxContentLength}`,
      };
      this.recordAudit({ scanType, toolName: context?.toolName, risks: [risk], action: 'blocked', sessionId: context?.sessionId });
      return { passed: false, risks: [risk], overallRisk: 'medium' };
    }

    const enabled = this.config.enabledChecks;
    const risks: SecurityRisk[] = [];
    if (enabled.has('pii')) risks.push(...this.detectPII(content));
    if (enabled.has('secret')) risks.push(...this.detectSecrets(content));
    if (enabled.has('path-traversal')) risks.push(...this.detectPathTraversal(content));
    if (enabled.has('command-injection')) risks.push(...this.detectCommandInjection(content));
    if (enabled.has('prompt-injection')) risks.push(...this.detectPromptInjection(content));
    if (enabled.has('xss')) risks.push(...this.detectXSS(content));
    if (enabled.has('sql-injection')) risks.push(...this.detectSQLInjection(content));
    if (enabled.has('sensitive-url')) risks.push(...this.detectSensitiveURL(content));
    if (enabled.has('dangerous-code')) risks.push(...this.detectDangerousCode(content));

    for (const word of this.config.customSensitiveWords) {
      if (!word) continue;
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      risks.push(...collectMatches(content, new RegExp(escaped, 'giu'), 'dangerous-code', 'medium', `包含自定义敏感词：${word}`));
    }

    const overallRisk = aggregateRisk(risks.map((r) => r.severity));
    const passed = risks.length === 0;
    let sanitizedContent: string | undefined;
    let action: SecurityAuditRecord['action'] = 'allowed';
    if (!passed && this.config.autoSanitize) {
      sanitizedContent = this.sanitize(content, risks);
      action = 'sanitized';
    } else if (!passed) {
      action = 'blocked';
    }

    this.recordAudit({ scanType, toolName: context?.toolName, risks, action, sessionId: context?.sessionId });
    return { passed, risks, sanitizedContent, overallRisk };
  }
}
