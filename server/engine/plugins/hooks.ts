/**
 * *
 * 移植自 openclaw/src/plugins/hooks.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

// Re-export: export type {

export type HookRunnerLogger = unknown;

export type HookFailurePolicy = unknown;

export type VoidHookRunOptions = unknown;

export type HookRunnerOptions = unknown;

export type PluginTargetedInboundClaimOutcome = unknown;

export function createHookRunner(...args: unknown[]): unknown {
  throw new Error("not implemented: createHookRunner");
}

export type HookRunner = unknown;

export type SubagentLifecycleHookRunner = unknown;

