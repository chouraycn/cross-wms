// 移植自 openclaw/src/channels/plugins/pairing.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listPairingChannels(..._args: unknown[]): unknown {
  throw new Error("not implemented: listPairingChannels");
}

export function getPairingAdapter(..._args: unknown[]): unknown {
  throw new Error("not implemented: getPairingAdapter");
}

export function requirePairingAdapter(..._args: unknown[]): unknown {
  throw new Error("not implemented: requirePairingAdapter");
}

export async function notifyPairingApproved(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: notifyPairingApproved");
}
