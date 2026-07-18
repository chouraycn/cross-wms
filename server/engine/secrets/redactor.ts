/**
 * 密钥脱敏模块
 *
 * 对日志、输出中的敏感信息进行脱敏处理：
 * - 已知密钥值脱敏（精确匹配）
 * - 模式匹配脱敏（API Key / Token / 密码等常见格式）
 * - 高熵字符串检测脱敏
 */

import { shannonEntropy } from './encryption.js';

/** 脱敏规则 */
export interface RedactionRule {
  name: string;
  pattern: RegExp;
  /** 替换策略：fixed 固定掩码；partial 保留首尾 */
  strategy: 'fixed' | 'partial';
  /** strategy=fixed 时使用的掩码 */
  replacement?: string;
  /** strategy=partial 时保留的首尾字符数 */
  keepPrefix?: number;
  keepSuffix?: number;
}

/** 默认脱敏规则集 — 覆盖常见密钥模式 */
export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  // Bearer Token
  {
    name: 'bearer-token',
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    strategy: 'fixed',
    replacement: 'Bearer ***REDACTED***',
  },
  // AWS Access Key（AKIA 开头 20 字符）
  {
    name: 'aws-access-key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    strategy: 'fixed',
    replacement: 'AKIA***REDACTED***',
  },
  // 阿里云 AccessKeyId（LTAI 开头）
  {
    name: 'aliyun-access-key',
    pattern: /LTAI[0-9A-Za-z]{12,20}/g,
    strategy: 'fixed',
    replacement: 'LTAI***REDACTED***',
  },
  // 腾讯云 SecretId（AKID 开头）
  {
    name: 'tencent-secret-id',
    pattern: /AKID[0-9A-Za-z]{13,40}/g,
    strategy: 'fixed',
    replacement: 'AKID***REDACTED***',
  },
  // 通用 API Key（sk- / key- / api_ 前缀 + 至少 16 位）
  {
    name: 'generic-api-key',
    pattern: /(?:sk|key|api_)[\-_]?[A-Za-z0-9]{16,}/g,
    strategy: 'partial',
    keepPrefix: 4,
    keepSuffix: 4,
  },
  // 私钥 PEM 块
  {
    name: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g,
    strategy: 'fixed',
    replacement: '***PRIVATE KEY REDACTED***',
  },
];

/** 默认保留的可信密钥引用标记（不脱敏） */
const SAFE_MARKERS = new Set([
  '${',
  '{{',
  '***REDACTED***',
  '***PRIVATE KEY REDACTED***',
]);

/**
 * 密钥脱敏器
 *
 * 支持动态注册已知密钥值（精确匹配脱敏）和基于规则的模式脱敏。
 */
export class SecretRedactor {
  private readonly knownValues = new Set<string>();
  private readonly rules: RedactionRule[];
  private readonly minEntropy: number;
  private readonly minSecretLength: number;

  constructor(options: {
    rules?: RedactionRule[];
    minEntropy?: number;
    minSecretLength?: number;
  } = {}) {
    this.rules = options.rules ?? DEFAULT_REDACTION_RULES;
    this.minEntropy = options.minEntropy ?? 4.5;
    this.minSecretLength = options.minSecretLength ?? 20;
  }

  /** 注册已知密钥值，确保在任何输出中被脱敏 */
  registerSecret(value: string): void {
    if (value && value.length >= this.minSecretLength) {
      this.knownValues.add(value);
    } else if (value && value.length > 0) {
      this.knownValues.add(value);
    }
  }

  /** 注销密钥值（密钥删除后调用） */
  unregisterSecret(value: string): void {
    this.knownValues.delete(value);
  }

  /** 清空已注册的密钥值 */
  clear(): void {
    this.knownValues.clear();
  }

  /**
   * 脱敏字符串
   *
   * 优先级：已知值 → 规则匹配 → 高熵检测
   */
  redact(input: string): string {
    if (typeof input !== 'string' || input.length === 0) return input;

    let result = input;

    // 1. 已知值脱敏（精确匹配）
    for (const value of this.knownValues) {
      if (value.length === 0) continue;
      // 转义正则特殊字符
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), '***REDACTED***');
    }

    // 2. 规则匹配脱敏
    for (const rule of this.rules) {
      result = result.replace(rule.pattern, match => applyRule(rule, match));
    }

    // 3. 高熵字符串检测（针对 JSON 字符串值）
    result = result.replace(/"([^"]{20,})"/g, (full, candidate: string) => {
      if (this.isSafeMarker(candidate)) return full;
      const entropy = shannonEntropy(candidate);
      if (entropy >= this.minEntropy) {
        return `"${redactPartial(candidate, 4, 4)}"`;
      }
      return full;
    });

    return result;
  }

  /** 脱敏对象（递归处理所有字符串字段） */
  redactObject(obj: unknown): unknown {
    if (typeof obj === 'string') return this.redact(obj);
    if (Array.isArray(obj)) return obj.map(item => this.redactObject(item));
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.redactObject(value);
      }
      return result;
    }
    return obj;
  }

  private isSafeMarker(value: string): boolean {
    for (const marker of SAFE_MARKERS) {
      if (value.startsWith(marker)) return true;
    }
    return false;
  }
}

/**
 * 应用单条脱敏规则
 */
function applyRule(rule: RedactionRule, match: string): string {
  if (rule.strategy === 'fixed') {
    return rule.replacement ?? '***REDACTED***';
  }
  return redactPartial(match, rule.keepPrefix ?? 2, rule.keepSuffix ?? 2);
}

/**
 * 部分脱敏：保留首尾若干字符，中间用 * 替换
 */
export function redactPartial(value: string, keepPrefix: number, keepSuffix: number): string {
  if (value.length <= keepPrefix + keepSuffix) {
    return '*'.repeat(value.length);
  }
  const prefix = value.slice(0, keepPrefix);
  const suffix = value.slice(-keepSuffix);
  const masked = '*'.repeat(Math.max(4, value.length - keepPrefix - keepSuffix));
  return `${prefix}${masked}${suffix}`;
}

/**
 * 创建默认脱敏器
 */
export function createDefaultRedactor(): SecretRedactor {
  return new SecretRedactor();
}
