/**
 * Emits redacted plugin lifecycle security diagnostics for SIEM consumers.
 * 移植自 openclaw/src/plugins/security-events.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginSecuritySourceFamily = unknown;

export function pluginAuditOutcomeForReason(...args: unknown[]): unknown {
  throw new Error("not implemented: pluginAuditOutcomeForReason");
}

export function emitPluginInstallSecurityEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: emitPluginInstallSecurityEvent");
}

export function emitPluginAuditSecurityEvent(...args: unknown[]): unknown {
  throw new Error("not implemented: emitPluginAuditSecurityEvent");
}

