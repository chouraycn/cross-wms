/**
 * * Validates and registers plugin command definitions into the global command registry.
 * 移植自 openclaw/src/plugins/command-registration.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type CommandRegistrationResult = unknown;

export function isReservedCommandName(...args: unknown[]): unknown {
  throw new Error("not implemented: isReservedCommandName");
}

export function validateCommandName(...args: unknown[]): unknown {
  throw new Error("not implemented: validateCommandName");
}

export function validatePluginCommandDefinition(...args: unknown[]): unknown {
  throw new Error("not implemented: validatePluginCommandDefinition");
}

export function listPluginInvocationKeys(...args: unknown[]): unknown {
  throw new Error("not implemented: listPluginInvocationKeys");
}

export function pluginCommandSupportsChannel(...args: unknown[]): unknown {
  throw new Error("not implemented: pluginCommandSupportsChannel");
}

export function registerPluginCommand(...args: unknown[]): unknown {
  throw new Error("not implemented: registerPluginCommand");
}


// Re-export: export type { RegisteredPluginCommand };

