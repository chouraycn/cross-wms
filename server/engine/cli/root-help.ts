// 移植自 openclaw/src/cli/root-help.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export async function renderRootHelpText(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: renderRootHelpText");
}

export async function outputRootHelp(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: outputRootHelp");
}

export type RootHelpRenderOptions = unknown;
