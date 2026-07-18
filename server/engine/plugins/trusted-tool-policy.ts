/**
 * Resolves trusted tool policy for plugins from runtime config.
 * 移植自 openclaw/src/plugins/trusted-tool-policy.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type TrustedToolPolicyDiagnosticEntry = unknown;

export function hasTrustedToolPolicies(...args: unknown[]): unknown {
  throw new Error("not implemented: hasTrustedToolPolicies");
}

export function getTrustedToolPolicyDiagnosticEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: getTrustedToolPolicyDiagnosticEntries");
}


