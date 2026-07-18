// 移植自 openclaw/src/cli/register.subclis-core.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export function getSubCliEntries(..._args: unknown[]): unknown {
  throw new Error("not implemented: getSubCliEntries");
}

export async function registerSubCliByName(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: registerSubCliByName");
}

export function registerSubCliCommands(..._args: unknown[]): unknown {
  throw new Error("not implemented: registerSubCliCommands");
}

export type SubCliRegistrationContext = unknown;

export const getSubCliCommandsWithSubcommands: unknown = undefined;
