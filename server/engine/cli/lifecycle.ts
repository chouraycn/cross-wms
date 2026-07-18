// 移植自 openclaw/src/cli/lifecycle.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export async function runDaemonUninstall(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: runDaemonUninstall");
}

export async function runDaemonStart(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: runDaemonStart");
}

export async function runDaemonStop(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: runDaemonStop");
}

export async function runDaemonRestart(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: runDaemonRestart");
}
