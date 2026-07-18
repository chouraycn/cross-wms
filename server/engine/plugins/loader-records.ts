/**
 * * Converts loaded plugin registries into stable plugin records for status and diagnostics.
 * 移植自 openclaw/src/plugins/loader-records.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function createPluginRecord(...args: unknown[]): unknown {
  throw new Error("not implemented: createPluginRecord");
}

export function markPluginActivationDisabled(...args: unknown[]): unknown {
  throw new Error("not implemented: markPluginActivationDisabled");
}

export function formatAutoEnabledActivationReason(...args: unknown[]): unknown {
  throw new Error("not implemented: formatAutoEnabledActivationReason");
}

export function recordPluginError(...args: unknown[]): unknown {
  throw new Error("not implemented: recordPluginError");
}

export function formatPluginFailureSummary(...args: unknown[]): unknown {
  throw new Error("not implemented: formatPluginFailureSummary");
}

export function formatMissingPluginRegisterError(...args: unknown[]): unknown {
  throw new Error("not implemented: formatMissingPluginRegisterError");
}

