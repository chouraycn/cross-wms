/**
 * 密钥验证器
 *
 * 提供格式验证、强度评估、过期检查等能力。
 * 验证逻辑纯函数化，便于复用与测试。
 */

import type {
  SecretRef,
  SecretStrengthResult,
  SecretType,
  SecretProvider,
} from './types.js';
import { shannonEntropy } from './encryption.js';

/** 支持的提供者 */
const VALID_PROVIDERS: SecretProvider[] = [
  'env', 'file', 'encrypted', 'keychain', 'aliyun-kms', 'tencent-kms', 'exec',
];

/** 支持的密钥类型 */
const VALID_TYPES: SecretType[] = [
  'api_key', 'password', 'token', 'certificate', 'ssh_key', 'other',
];

/** 验证结果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 验证 SecretRef 格式
 */
export function validateSecretRef(ref: SecretRef): ValidationResult {
  const errors: string[] = [];

  if (!ref || typeof ref !== 'object') {
    return { valid: false, errors: ['SecretRef 必须是对象'] };
  }

  if (!ref.provider || !VALID_PROVIDERS.includes(ref.provider)) {
    errors.push(`不支持的提供者类型: ${ref.provider}`);
  }

  if (!ref.key || typeof ref.key !== 'string' || ref.key.length === 0) {
    errors.push('密钥标识符必须为非空字符串');
  } else if (ref.key.length > 256) {
    errors.push('密钥标识符长度不能超过 256 字符');
  }

  if (ref.provider === 'env' && ref.key && !/^[A-Z][A-Z0-9_]{0,127}$/.test(ref.key)) {
    errors.push('环境变量密钥必须匹配模式: ^[A-Z][A-Z0-9_]{0,127}$');
  }

  if (ref.type && !VALID_TYPES.includes(ref.type)) {
    errors.push(`不支持的密钥类型: ${ref.type}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 评估密钥强度
 *
 * 评分维度：
 * - 长度（0-40 分）
 * - 字符多样性（0-30 分）
 * - 熵值（0-30 分）
 */
export function assessStrength(value: string): SecretStrengthResult {
  const issues: string[] = [];

  if (!value || value.length === 0) {
    return { score: 0, level: 'weak', issues: ['密钥值为空'] };
  }

  // 长度评分
  let lengthScore = 0;
  if (value.length >= 32) lengthScore = 40;
  else if (value.length >= 24) lengthScore = 30;
  else if (value.length >= 16) lengthScore = 20;
  else if (value.length >= 8) lengthScore = 10;
  else {
    lengthScore = 5;
    issues.push('密钥长度过短（建议至少 16 字符）');
  }

  // 字符多样性评分
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  const hasSpecial = /[^a-zA-Z0-9]/.test(value);
  const diversityCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  const diversityScore = diversityCount * 7.5;

  if (diversityCount < 3) {
    issues.push('字符类型单一（建议混合大小写、数字、特殊字符）');
  }

  // 熵评分
  const entropy = shannonEntropy(value);
  let entropyScore = 0;
  if (entropy >= 4.5) entropyScore = 30;
  else if (entropy >= 3.5) entropyScore = 20;
  else if (entropy >= 2.5) entropyScore = 10;
  else {
    entropyScore = 5;
    issues.push('熵值偏低（密钥可预测性高）');
  }

  const score = Math.round(lengthScore + diversityScore + entropyScore);
  let level: SecretStrengthResult['level'];
  if (score >= 80) level = 'strong';
  else if (score >= 60) level = 'good';
  else if (score >= 40) level = 'fair';
  else level = 'weak';

  if (issues.length === 0 && level === 'weak') {
    issues.push('密钥强度不足');
  }

  return { score, level, issues };
}

/**
 * 检查密钥是否已过期
 *
 * @param expiresAt - 过期时间戳（毫秒）
 * @param now - 当前时间戳（可选，默认 Date.now()）
 */
export function isExpired(expiresAt?: number, now: number = Date.now()): boolean {
  if (expiresAt === undefined || expiresAt === null) return false;
  return now >= expiresAt;
}

/**
 * 检查密钥是否即将过期
 *
 * @param expiresAt - 过期时间戳
 * @param thresholdMs - 提前预警阈值（默认 7 天）
 */
export function isExpiringSoon(
  expiresAt: number | undefined,
  thresholdMs: number = 7 * 24 * 60 * 60 * 1000,
  now: number = Date.now(),
): boolean {
  if (expiresAt === undefined || expiresAt === null) return false;
  const remaining = expiresAt - now;
  return remaining > 0 && remaining <= thresholdMs;
}

/**
 * 验证密钥值格式（按类型）
 */
export function validateSecretValue(value: string, type: SecretType): ValidationResult {
  const errors: string[] = [];

  if (!value || value.length === 0) {
    return { valid: false, errors: ['密钥值不能为空'] };
  }

  switch (type) {
    case 'api_key':
      if (value.length < 8) errors.push('API Key 长度应至少 8 字符');
      if (/\s/.test(value)) errors.push('API Key 不应包含空白字符');
      break;
    case 'token':
      if (value.length < 16) errors.push('Token 长度应至少 16 字符');
      break;
    case 'password':
      if (value.length < 8) errors.push('密码长度应至少 8 字符');
      break;
    case 'certificate':
      if (!value.includes('-----BEGIN')) errors.push('证书应包含 PEM 格式头');
      break;
    case 'ssh_key':
      if (!value.includes('ssh-') && !value.includes('ecdsa-')) {
        errors.push('SSH 密钥应以 ssh- 或 ecdsa- 开头');
      }
      break;
    case 'other':
      // 不做额外检查
      break;
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证密钥标识符（key 字段）合法性
 */
export function validateKey(key: string, provider: SecretProvider): ValidationResult {
  const errors: string[] = [];

  if (!key || key.length === 0) {
    return { valid: false, errors: ['密钥标识符不能为空'] };
  }

  if (key.length > 256) {
    errors.push('密钥标识符长度不能超过 256 字符');
  }

  // 禁止路径遍历
  if (key.includes('..') || key.includes('/') || key.includes('\\')) {
    if (provider !== 'file') {
      errors.push('密钥标识符不应包含路径分隔符或遍历序列');
    }
  }

  if (provider === 'env' && !/^[A-Z][A-Z0-9_]{0,127}$/.test(key)) {
    errors.push('环境变量密钥必须匹配: ^[A-Z][A-Z0-9_]{0,127}$');
  }

  return { valid: errors.length === 0, errors };
}
