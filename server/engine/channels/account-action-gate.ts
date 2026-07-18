// 移植自 openclaw/src/channels/plugins/account-action-gate.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ActionGate = unknown;

export function createAccountActionGate(..._args: unknown[]): unknown {
  throw new Error("not implemented: createAccountActionGate");
}
