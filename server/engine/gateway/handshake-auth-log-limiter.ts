// 移植自 openclaw/src/gateway/server/ws-connection/handshake-auth-log-limiter.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export class HandshakeAuthLogLimiter {
  constructor(...args: unknown[]) {
    throw new Error("not implemented: HandshakeAuthLogLimiter constructor");
  }
}

export function buildHandshakeAuthLogKey(...args: unknown[]): unknown {
  throw new Error("not implemented: buildHandshakeAuthLogKey");
}

export function shouldLimitMissingCredentialAuthLog(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldLimitMissingCredentialAuthLog");
}
