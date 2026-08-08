// 移植自 openclaw/src/infra/deliver-runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type deliverOutboundPayloads = unknown;
export const deliverOutboundPayloads: any = undefined;
export type deliverOutboundPayloadsInternal = unknown;
export const deliverOutboundPayloadsInternal: any = undefined;
