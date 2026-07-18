// 移植自 openclaw/src/channels/message-access/sender-gates.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function senderGateForDirect(..._args: unknown[]): unknown {
  throw new Error("not implemented: senderGateForDirect");
}

export function senderGateForGroup(..._args: unknown[]): unknown {
  throw new Error("not implemented: senderGateForGroup");
}

export function applyEventAuthModeToSenderGate(..._args: unknown[]): unknown {
  throw new Error("not implemented: applyEventAuthModeToSenderGate");
}
