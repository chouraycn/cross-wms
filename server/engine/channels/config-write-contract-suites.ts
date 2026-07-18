// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/config-write-contract-suites.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function describeChannelConfigWritePolicyContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: describeChannelConfigWritePolicyContract");
}

export function describeChannelConfigWriteTargetContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: describeChannelConfigWriteTargetContract");
}
