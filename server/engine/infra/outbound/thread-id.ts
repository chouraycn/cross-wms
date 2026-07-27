// Thread id helpers normalize channel topic/thread identifiers before payload
// construction and route matching.
// 移植自 openclaw/src/infra/outbound/thread-id.ts
// 降级策略：直接内联 normalizeOptionalStringifiedId 的最小实现。

/** Normalizes channel thread/topic ids before outbound payload construction. */
export function normalizeOutboundThreadId(value?: string | number | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const str = typeof value === "number" ? String(value) : value;
  const trimmed = str.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
