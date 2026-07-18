// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/group-policy-contract-suites.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type RuntimeGroupPolicyResolver = unknown;

export function installChannelRuntimeGroupPolicyFallbackSuite(..._args: unknown[]): unknown {
  throw new Error("not implemented: installChannelRuntimeGroupPolicyFallbackSuite");
}
