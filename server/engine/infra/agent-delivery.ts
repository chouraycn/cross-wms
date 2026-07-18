// 移植自 openclaw/src/infra/agent-delivery.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type AgentDeliveryPlan = unknown;
export function resolveAgentDeliveryPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAgentDeliveryPlan");
}
export function resolveAgentDeliveryPlanWithSessionRoute(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAgentDeliveryPlanWithSessionRoute");
}
export function resolveAgentOutboundTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveAgentOutboundTarget");
}
