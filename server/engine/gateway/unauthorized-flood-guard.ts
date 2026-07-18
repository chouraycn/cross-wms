// 移植自 openclaw/src/gateway/server/ws-connection/unauthorized-flood-guard.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export class UnauthorizedFloodGuard {
  constructor(...args: unknown[]) {
    throw new Error("not implemented: UnauthorizedFloodGuard constructor");
  }
}

export function isUnauthorizedRoleError(...args: unknown[]): unknown {
  throw new Error("not implemented: isUnauthorizedRoleError");
}
