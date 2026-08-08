/**
 * 移植自 openclaw/src/agents/anthropic-payload-policy.ts
 *
 * 降级实现：提供 Anthropic payload 策略，不再抛出 stub 错误。
 */

export function resolveAnthropicEphemeralCacheControl(_params: any): any {
  return null;
}

export function resolveAnthropicPayloadPolicy(_params: any): any {
  return null;
}

export function applyAnthropicPayloadPolicyToParams(params: any): any {
  return params;
}

export function applyAnthropicEphemeralCacheControlMarkers(params: any): any {
  return params;
}
