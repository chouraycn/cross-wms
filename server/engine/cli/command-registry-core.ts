// 移植自 openclaw/src/cli/command-registry-core.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export function getCoreCliCommandNames(..._args: unknown[]): unknown {
  throw new Error("not implemented: getCoreCliCommandNames");
}

export async function registerCoreCliByName(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: registerCoreCliByName");
}

export function registerCoreCliCommands(..._args: unknown[]): unknown {
  throw new Error("not implemented: registerCoreCliCommands");
}

export type CommandRegistration = unknown;

export const getCoreCliCommandDescriptors: unknown = undefined;
export const getCoreCliCommandsWithSubcommands: unknown = undefined;
