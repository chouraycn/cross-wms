// 移植自 openclaw/src/config/mcp-config.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listConfiguredMcpServers(...args: unknown[]): unknown {
  throw new Error("not implemented: listConfiguredMcpServers");
}
export function updateConfiguredMcpServerTools(...args: unknown[]): unknown {
  throw new Error("not implemented: updateConfiguredMcpServerTools");
}
export function updateConfiguredMcpServer(...args: unknown[]): unknown {
  throw new Error("not implemented: updateConfiguredMcpServer");
}
export function setConfiguredMcpServer(...args: unknown[]): unknown {
  throw new Error("not implemented: setConfiguredMcpServer");
}
export function unsetConfiguredMcpServer(...args: unknown[]): unknown {
  throw new Error("not implemented: unsetConfiguredMcpServer");
}
