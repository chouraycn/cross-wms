// 移植自 openclaw/src/cli/probe.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export async function probeGatewayStatus(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: probeGatewayStatus");
}
