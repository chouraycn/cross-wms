// 移植自 openclaw/src/infra/message.gateway.runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type callGatewayLeastPrivilege = unknown;
export const callGatewayLeastPrivilege: unknown = undefined;
export type randomIdempotencyKey = unknown;
export const randomIdempotencyKey: unknown = undefined;
