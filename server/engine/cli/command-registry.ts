// 移植自 openclaw/src/cli/command-registry.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export function registerProgramCommands(..._args: unknown[]): unknown {
  throw new Error("not implemented: registerProgramCommands");
}

export const getCoreCliCommandDescriptors: unknown = undefined;
export const getCoreCliCommandNames: unknown = undefined;
export const getCoreCliCommandsWithSubcommands: unknown = undefined;
export const registerCoreCliByName: unknown = undefined;
export const registerCoreCliCommands: unknown = undefined;
