// 移植自 openclaw/src/infra/outbound-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type CrossContextPresentationBuilder = unknown;
export type CrossContextDecoration = unknown;
export function resolveEffectiveMessageToolsConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEffectiveMessageToolsConfig");
}
export function resolveAllowedMessageActions(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAllowedMessageActions");
}
export function enforceMessageActionAllowlist(...args: unknown[]): unknown {
  throw new Error("not implemented: enforceMessageActionAllowlist");
}
export function enforceCrossContextPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: enforceCrossContextPolicy");
}
export function buildCrossContextDecoration(...args: unknown[]): unknown {
  throw new Error("not implemented: buildCrossContextDecoration");
}
export function shouldApplyCrossContextMarker(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldApplyCrossContextMarker");
}
export function applyCrossContextDecoration(...args: unknown[]): unknown {
  throw new Error("not implemented: applyCrossContextDecoration");
}
