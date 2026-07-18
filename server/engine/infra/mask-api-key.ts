/**
 * API 密钥脱敏 — 在诊断日志中掩盖敏感凭证，同时保留足够的前缀/后缀用于识别
 * 参考 openclaw/src/utils/mask-api-key.ts
 */

export function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "missing";
  }
  if (trimmed.length <= 6) {
    return `${trimmed.slice(0, 1)}...${trimmed.slice(-1)}`;
  }
  if (trimmed.length <= 16) {
    return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-8)}`;
}