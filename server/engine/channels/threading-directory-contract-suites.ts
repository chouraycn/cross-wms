// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/threading-directory-contract-suites.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function expectChannelThreadingBaseContract(..._args: unknown[]): unknown {
  throw new Error("not implemented: expectChannelThreadingBaseContract");
}

export function expectChannelThreadingReturnValuesNormalized(..._args: unknown[]): unknown {
  throw new Error("not implemented: expectChannelThreadingReturnValuesNormalized");
}

export async function expectChannelDirectoryBaseContract(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: expectChannelDirectoryBaseContract");
}
