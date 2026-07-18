// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/runtime-artifacts.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveBundledChannelContractArtifactUrl(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledChannelContractArtifactUrl");
}

export async function importBundledChannelContractArtifact(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: importBundledChannelContractArtifact");
}
