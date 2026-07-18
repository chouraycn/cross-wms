// 移植自 openclaw/src/config/mcp-config-normalize.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveOpenClawMcpTransportAlias(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOpenClawMcpTransportAlias");
}
export function isKnownCliMcpTypeAlias(...args: unknown[]): unknown {
  throw new Error("not implemented: isKnownCliMcpTypeAlias");
}
export function canonicalizeConfiguredMcpServer(...args: unknown[]): unknown {
  throw new Error("not implemented: canonicalizeConfiguredMcpServer");
}
export function normalizeConfiguredMcpServers(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConfiguredMcpServers");
}
