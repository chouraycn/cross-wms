/**
 * *
 * 移植自 openclaw/src/plugins/commands.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */


export function matchPluginCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: matchPluginCommand");
}


export function listPluginCommands(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginCommands");
}

const testing: unknown = undefined;
export { testing as __testing_commands };


