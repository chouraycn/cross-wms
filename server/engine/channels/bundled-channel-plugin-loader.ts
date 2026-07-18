// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/bundled-channel-plugin-loader.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function listBundledChannelPluginIds(..._args: unknown[]): unknown {
  throw new Error("not implemented: listBundledChannelPluginIds");
}

export async function getBundledChannelPluginAsync(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: getBundledChannelPluginAsync");
}

export async function getBundledChannelDirectoryPluginAsync(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: getBundledChannelDirectoryPluginAsync");
}
