// 移植自 openclaw/src/cli/status.gather.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export async function gatherDaemonStatus(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: gatherDaemonStatus");
}

export function renderPortDiagnosticsForCli(..._args: unknown[]): unknown {
  throw new Error("not implemented: renderPortDiagnosticsForCli");
}

export function resolvePortListeningAddresses(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolvePortListeningAddresses");
}

export type DaemonStatus = unknown;
