// 移植自 openclaw/src/channels/plugins/contracts/test-helpers/bundled-channel-plugin-loader.ts
// 降级：channel plugin 依赖简化

/** Lists bundled channel plugin ids. Simplified without real plugin registry. */
export function listBundledChannelPluginIds(): string[] {
  return [];
}

/** Gets a bundled channel plugin asynchronously. Returns null without real plugins. */
export async function getBundledChannelPluginAsync(_pluginId: string): Promise<null> {
  return null;
}

/** Gets a bundled channel directory plugin asynchronously. Returns null without real plugins. */
export async function getBundledChannelDirectoryPluginAsync(_pluginId: string): Promise<null> {
  return null;
}
