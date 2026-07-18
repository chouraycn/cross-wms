/**
 * Internal state and composed-registry view for the global hook runner.
 * 移植自 openclaw/src/plugins/hook-runner-global-state.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type HookRunnerGlobalState = unknown;

export function getHookRunnerGlobalState(...args: unknown[]): unknown {
  throw new Error("not implemented: getHookRunnerGlobalState");
}

export function createComposedHookRegistryFacade(...args: unknown[]): unknown {
  throw new Error("not implemented: createComposedHookRegistryFacade");
}

export function getGlobalHookRunnerRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: getGlobalHookRunnerRegistry");
}

