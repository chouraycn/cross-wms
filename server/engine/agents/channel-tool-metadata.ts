/** Dependency-light ownership metadata for channel-contributed agent tools.
 *
 * 降级说明：
 *  - openclaw `../channels/plugins/types.public.js` 的 `ChannelAgentTool` 类型
 *    在 cross-wms 中路径不同且签名可能不一致，这里定义本地最小占位类型
 *    （WeakMap 仅需对象引用，结构兼容即可）。
 */

/** Channel agent tool 占位类型（与 cross-wms `ChannelAgentTool` 结构兼容）。 */
type ChannelAgentTool = {
  name: string;
  description?: string;
  schema?: unknown;
};

type ChannelAgentToolMeta = {
  channelId: string;
};

const channelAgentToolMeta = new WeakMap<object, ChannelAgentToolMeta>();

/** Read channel metadata attached to a channel-owned agent tool. */
export function getChannelAgentToolMeta(tool: ChannelAgentTool): ChannelAgentToolMeta | undefined {
  return channelAgentToolMeta.get(tool);
}

/** Attach channel ownership metadata to a concrete agent tool. */
export function setChannelAgentToolMeta(tool: ChannelAgentTool, meta: ChannelAgentToolMeta): void {
  channelAgentToolMeta.set(tool, meta);
}

/** Copy channel metadata when wrapping or replacing a channel-owned tool. */
export function copyChannelAgentToolMeta(source: ChannelAgentTool, target: ChannelAgentTool): void {
  const meta = channelAgentToolMeta.get(source);
  if (meta) {
    channelAgentToolMeta.set(target, meta);
  }
}
