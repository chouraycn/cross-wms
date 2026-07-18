/**
 * Stores plugin command registry state for the current process lifecycle.
 * 移植自 openclaw/src/plugins/command-registry-state.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type RegisteredPluginCommand = unknown;

export const pluginCommands: unknown = undefined;

export function isPluginCommandRegistryLocked(...args: unknown[]): unknown {
  throw new Error("not implemented: isPluginCommandRegistryLocked");
}

export function setPluginCommandRegistryLocked(...args: unknown[]): unknown {
  throw new Error("not implemented: setPluginCommandRegistryLocked");
}

export function clearPluginCommands(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginCommands");
}

export function clearPluginCommandsForPlugin(...args: unknown[]): unknown {
  throw new Error("not implemented: clearPluginCommandsForPlugin");
}

export function isTrustedReservedCommandOwner(...args: unknown[]): unknown {
  throw new Error("not implemented: isTrustedReservedCommandOwner");
}

export function canExposeSenderIsOwner(...args: unknown[]): unknown {
  throw new Error("not implemented: canExposeSenderIsOwner");
}

export function listRegisteredPluginCommands(...args: unknown[]): unknown {
  throw new Error("not implemented: listRegisteredPluginCommands");
}

export function listRegisteredPluginAgentPromptGuidance(...args: unknown[]): unknown {
  throw new Error("not implemented: listRegisteredPluginAgentPromptGuidance");
}

export function restorePluginCommands(...args: unknown[]): unknown {
  throw new Error("not implemented: restorePluginCommands");
}

