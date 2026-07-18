// 移植自 openclaw/src/channels/plugins/stateful-target-drivers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type StatefulBindingTargetReadyResult = unknown;

export type StatefulBindingTargetSessionResult = unknown;

export type StatefulBindingTargetResetResult = unknown;

export type StatefulBindingTargetDriver = unknown;

export function registerStatefulBindingTargetDriver(..._args: unknown[]): unknown {
  throw new Error("not implemented: registerStatefulBindingTargetDriver");
}

export function unregisterStatefulBindingTargetDriver(..._args: unknown[]): unknown {
  throw new Error("not implemented: unregisterStatefulBindingTargetDriver");
}

export function getStatefulBindingTargetDriver(..._args: unknown[]): unknown {
  throw new Error("not implemented: getStatefulBindingTargetDriver");
}

export function resolveStatefulBindingTargetBySessionKey(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveStatefulBindingTargetBySessionKey");
}
