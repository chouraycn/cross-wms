/**
 * 移植自 openclaw/src/agents/tools/embedded-gateway-stub.ts
 *
 * 降级实现：提供 embedded mode gateway stub，不再抛出 stub 错误。
 */

export type EmbeddedCallGateway = <T = Record<string, unknown>>(opts: unknown) => Promise<T>;

export function createEmbeddedCallGateway(): EmbeddedCallGateway {
  return async <T = Record<string, unknown>>(opts: unknown): Promise<T> => {
    const options = opts as { method?: string };
    throw new Error(
      `Method "${options?.method ?? "unknown"}" requires a running gateway (unavailable in local embedded mode).`,
    );
  };
}
