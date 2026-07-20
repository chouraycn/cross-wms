/**
 * 移植自 openclaw/src/agents/models-config.providers.policy.lookup.ts
 *
 * 降级实现：提供 provider plugin lookup key 解析，不再抛出 stub 错误。
 */

export function resolveProviderPluginLookupKey(params: {
  provider: string;
  config?: unknown;
  metadataSnapshot?: unknown;
}): string {
  return params.provider;
}
