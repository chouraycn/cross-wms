/**
 * SecretRedaction 增强脱敏模块
 *
 * 在 server/logging/redact.ts 的 key=value 配对脱敏基础上，
 * 提供内容级（content-level）模式匹配，覆盖：
 * - API key 前缀（sk-, ghp_, AKIA, xoxb-, xoxp- 等）
 * - 邮箱地址
 * - 信用卡号（13-19 位数字）
 * - 中国身份证（18 位）
 * - 中国手机号（11 位）
 *
 * 同时暴露：
 * - redactText(text): 文本脱敏（占位符替换）
 * - redactObject(obj): 递归对象脱敏
 *
 * 与 server/logging/redact.ts 的分工：
 * - logging/redact.ts: 结构化 key=value / query / form 上下文
 * - security/secretRedaction.ts: 自由文本 / 日志 / 异常消息中的敏感数据
 */

// ===================== 模式定义 =====================

/** API key 前缀模式（OpenAI / GitHub / AWS / Slack 等） */
const API_KEY_PATTERNS: { name: string; re: RegExp }[] = [
  // OpenAI sk- / sk-proj- / sk-svcacct-
  { name: 'openai', re: /\bsk-(?:proj-|svcacct-|[A-Za-z0-9_-]{20,})\b/g },
  // GitHub PAT: ghp_ / gho_ / ghu_ / ghs_ / ghr_
  { name: 'github', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  // AWS Access Key ID
  { name: 'aws-access', re: /\bAKIA[0-9A-Z]{16}\b/g },
  // Slack tokens
  { name: 'slack-bot', re: /\bxoxb-[A-Za-z0-9-]{10,}\b/g },
  { name: 'slack-user', re: /\bxoxp-[A-Za-z0-9-]{10,}\b/g },
  // Anthropic
  { name: 'anthropic', re: /\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{20,}\b/g },
  // Google API Key
  { name: 'google', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  // Stripe
  { name: 'stripe-restricted', re: /\brk_live_[0-9a-zA-Z]{20,}\b/g },
  { name: 'stripe-secret', re: /\bsk_live_[0-9a-zA-Z]{20,}\b/g },
  // 通用 Bearer JWT
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

/** 邮箱地址 */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** 信用卡号：13-19 位数字，可包含空格 / 短横线分隔 */
const CREDIT_CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

/** 中国身份证：18 位（17 位数字 + 1 位数字/X） */
const CHINESE_ID_RE = /\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g;

/** 中国手机号：11 位，1 开头 */
const CHINESE_PHONE_RE = /\b1[3-9]\d{9}\b/g;

// ===================== 占位符 =====================

const PLACEHOLDER = {
  apiKey: '[REDACTED_API_KEY]',
  email: '[REDACTED_EMAIL]',
  creditCard: '[REDACTED_CARD]',
  chineseId: '[REDACTED_ID_CARD]',
  chinesePhone: '[REDACTED_PHONE]',
} as const;

// ===================== 内部工具 =====================

/**
 * 信用卡号校验（Luhn 算法）：过滤误匹配（如长串 ID、订单号）
 */
function isLuhnValid(digits: string): boolean {
  const nums = digits.replace(/[^\d]/g, '');
  if (nums.length < 13 || nums.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = nums.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * 校验匹配到的字符串是否像信用卡号
 * - Luhn 通过
 * - 不与相邻字符拼接成更长的数字串
 */
function looksLikeCreditCard(match: string, fullText: string, index: number): boolean {
  const digits = match.replace(/[ -]/g, '');
  if (!isLuhnValid(digits)) return false;
  // 边界检查：避免与前后数字拼接成更长的 Luhn-valid 序列
  const before = index > 0 ? fullText[index - 1] : '';
  const after = index + match.length < fullText.length ? fullText[index + match.length] : '';
  if (/\d/.test(before) || /\d/.test(after)) return false;
  return true;
}

// ===================== 公开 API =====================

/**
 * 对文本执行敏感数据脱敏（占位符替换）
 * 处理顺序：先 API key → email → 信用卡 → 身份证 → 手机号
 * 避免一种模式"吞噬"另一种模式
 */
export function redactText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // 1. API key 前缀
  for (const { re } of API_KEY_PATTERNS) {
    result = result.replace(re, PLACEHOLDER.apiKey);
  }

  // 2. 邮箱
  result = result.replace(EMAIL_RE, PLACEHOLDER.email);

  // 3. 信用卡号（Luhn 校验后替换）
  result = result.replace(CREDIT_CARD_RE, (match, offset: number) => {
    return looksLikeCreditCard(match, result, offset) ? PLACEHOLDER.creditCard : match;
  });

  // 4. 中国身份证
  result = result.replace(CHINESE_ID_RE, PLACEHOLDER.chineseId);

  // 5. 中国手机号
  result = result.replace(CHINESE_PHONE_RE, PLACEHOLDER.chinesePhone);

  return result;
}

/**
 * 递归脱敏对象
 * - 字符串值：调用 redactText
 * - 数组：递归处理每个元素
 * - 普通对象：递归处理每个字段
 * - 其他类型（number/boolean/null/undefined）：原样返回
 */
export function redactObject<T = unknown>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactText(obj) as unknown as T;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = redactObject(v);
  }
  return result as unknown as T;
}

/**
 * Redactor 类：封装脱敏逻辑，便于扩展
 */
export class Redactor {
  /**
   * 对文本脱敏
   */
  redact(text: string): string {
    return redactText(text);
  }

  /**
   * 对对象递归脱敏
   */
  redactValue<T = unknown>(obj: T): T {
    return redactObject(obj);
  }

  /**
   * 自定义添加额外的 API key 前缀模式
   */
  addApiKeyPattern(name: string, re: RegExp): void {
    API_KEY_PATTERNS.push({ name, re });
  }
}

// ===================== 默认导出单例 =====================

/** 默认 Redactor 实例 */
export const redactor = new Redactor();
