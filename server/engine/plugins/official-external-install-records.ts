/**
 * Defines official external install records for plugins.
 * 移植自 openclaw/src/plugins/official-external-install-records.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function resolveTrustedSourceLinkedOfficialNpmSpec(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveTrustedSourceLinkedOfficialNpmSpec");
}

export function resolveTrustedSourceLinkedOfficialClawHubSpec(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveTrustedSourceLinkedOfficialClawHubSpec");
}

export function resolveTrustedSourceLinkedOfficialClawHubInstall(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveTrustedSourceLinkedOfficialClawHubInstall");
}

