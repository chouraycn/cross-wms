/**
 * 工具安全过滤器 — 参考 OpenClaw tools/security-filter.ts
 *
 * 扫描 PII、密钥、注入等安全风险并支持脱敏。
 */

/** 安全风险类型 */
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

/** 风险严重级别 */
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

/** 整体风险评级 */
export type OverallRisk = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** 安全风险描述 */
export interface SecurityRisk {
  readonly type: SecurityRiskType;
  readonly severity: RiskSeverity;
  readonly matched: string;
  readonly position: { readonly start: number; readonly end: number };
  readonly recommendation: string;
}

/** 扫描结果 */
export interface ScanResult {
  readonly passed: boolean;
  readonly risks: SecurityRisk[];
  readonly sanitizedContent?: string;
  readonly overallRisk: OverallRisk;
}

/** 扫描上下文 */
export interface ScanContext {
  readonly toolName?: string;
  readonly inputSource?: 'user' | 'tool' | 'system';
  readonly sessionId?: string;
}

/** PII 模式 */
export interface PIIPattern {
  readonly name: string;
  readonly type: SecurityRiskType;
  readonly pattern: RegExp;
  readonly description: string;
}

/** 默认 PII 模式 */
const DEFAULT_PII_PATTERNS: PIIPattern[] = [
  {
    name: 'email',
    type: 'pii',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    description: '电子邮箱地址',
  },
  {
    name: 'phone',
    type: 'pii',
    pattern: /(?:\+?86)?1[3-9]\d{9}/g,
    description: '手机号码',
  },
  {
    name: 'id-card',
    type: 'pii',
    pattern: /\d{17}[\dXx]/g,
    description: '身份证号码',
  },
];

/** 密钥模式 */
const SECRET_PATTERNS: { name: string; pattern: RegExp; description: string }[] = [
  {
    name: 'api-key',
    pattern: /(?:api[_-]?key|apikey|secret|token|password|passwd|pwd)\s*[:=]\s*['"]?[\w-]{20,}['"]?/gi,
    description: 'API 密钥或令牌',
  },
  {
    name: 'private-key',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    description: '私钥',
  },
  {
    name: 'jwt',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    description: 'JWT 令牌',
  },
];

/** 注入模式 */
const INJECTION_PATTERNS: { type: SecurityRiskType; pattern: RegExp; description: string }[] = [
  {
    type: 'path-traversal',
    pattern: /(?:\.\.\/){2,}|(?:\.\.\\){2,}/g,
    description: '路径遍历',
  },
  {
    type: 'command-injection',
    pattern: /(?:;\s*(?:rm|del|format|shutdown|reboot)\s)|(\|\s*(?:rm|del|format)\s)/gi,
    description: '命令注入',
  },
  {
    type: 'sql-injection',
    pattern: /(?:'\s*(?:OR|AND)\s+['"]?\d+['"]?\s*=\s*['"]?\d+)|(?:;\s*DROP\s+TABLE)/gi,
    description: 'SQL 注入',
  },
  {
    type: 'prompt-injection',
    pattern: /(?:ignore\s+(?:all\s+)?(?:previous|above)\s+instructions)|(?:system\s*:\s*you\s+are\s+now)/gi,
    description: '提示词注入',
  },
];

/** 计算严重级别 */
function toSeverity(riskType: SecurityRiskType): RiskSeverity {
  switch (riskType) {
    case 'secret':
    case 'command-injection':
    case 'dangerous-code':
      return 'critical';
    case 'prompt-injection':
    case 'sql-injection':
    case 'path-traversal':
      return 'high';
    case 'pii':
    case 'xss':
    case 'sensitive-url':
      return 'medium';
    default:
      return 'low';
  }
}

/** 计算整体风险 */
function computeOverallRisk(risks: SecurityRisk[]): OverallRisk {
  if (risks.length === 0) return 'none';
  const severityOrder: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];
  let maxIndex = 0;
  for (const risk of risks) {
    maxIndex = Math.max(maxIndex, severityOrder.indexOf(risk.severity));
  }
  return severityOrder[maxIndex] as OverallRisk;
}

/** 脱敏内容 */
function sanitizeContent(content: string, risks: SecurityRisk[]): string {
  let sanitized = content;
  for (const risk of risks) {
    const replacement = risk.type === 'pii' ? '[REDACTED]' : `[BLOCKED:${risk.type}]`;
    sanitized = sanitized.slice(0, risk.position.start) + replacement + sanitized.slice(risk.position.end);
  }
  return sanitized;
}

/** 扫描内容中的安全风险 */
export function scanContent(
  content: string,
  context?: ScanContext,
): ScanResult {
  const risks: SecurityRisk[] = [];

  // 扫描 PII
  for (const pattern of DEFAULT_PII_PATTERNS) {
    const matches = content.matchAll(pattern.pattern);
    for (const match of matches) {
      if (match.index === undefined) continue;
      risks.push({
        type: pattern.type,
        severity: toSeverity(pattern.type),
        matched: match[0],
        position: { start: match.index, end: match.index + match[0].length },
        recommendation: `移除或脱敏${pattern.description}`,
      });
    }
  }

  // 扫描密钥
  for (const pattern of SECRET_PATTERNS) {
    const matches = content.matchAll(pattern.pattern);
    for (const match of matches) {
      if (match.index === undefined) continue;
      risks.push({
        type: 'secret',
        severity: 'critical',
        matched: match[0].slice(0, 20) + '...',
        position: { start: match.index, end: match.index + match[0].length },
        recommendation: `移除${pattern.description}`,
      });
    }
  }

  // 扫描注入
  for (const pattern of INJECTION_PATTERNS) {
    const matches = content.matchAll(pattern.pattern);
    for (const match of matches) {
      if (match.index === undefined) continue;
      risks.push({
        type: pattern.type,
        severity: toSeverity(pattern.type),
        matched: match[0],
        position: { start: match.index, end: match.index + match[0].length },
        recommendation: `阻止${pattern.description}攻击`,
      });
    }
  }

  const overallRisk = computeOverallRisk(risks);
  const passed = risks.length === 0 || overallRisk === 'low';

  return {
    passed,
    risks,
    overallRisk,
    sanitizedContent: passed ? undefined : sanitizeContent(content, risks),
  };
}

/** 快速检查内容是否安全 */
export function isContentSafe(content: string): boolean {
  return scanContent(content).passed;
}
