/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/extensions.ts
 *
 * 降级实现：提供 embedded extension 工厂，不再抛出 stub 错误。
 */

export function buildEmbeddedExtensionFactories(_params?: unknown): unknown[] {
  return [];
}
