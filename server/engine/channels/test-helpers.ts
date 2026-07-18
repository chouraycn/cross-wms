// 移植自 openclaw/src/channels/plugins/contracts/test-helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function primeChannelOutboundSendMock(..._args: unknown[]): unknown {
  throw new Error("not implemented: primeChannelOutboundSendMock");
}

export function expectChannelInboundContextContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: expectChannelInboundContextContract");
}

export function expectChannelTurnDispatchResultContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: expectChannelTurnDispatchResultContract");
}
