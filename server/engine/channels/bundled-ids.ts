// 移植自 openclaw/src/channels/plugins/bundled-ids.ts
// 复用 _openclaw-stubs.ts 中的 listBundledChannelIds 真实实现
import { listBundledChannelIds as listBundledChannelIdsImpl } from "./_openclaw-stubs.js";

export function listBundledChannelPluginIdsForRoot(
  _packageRoot: string,
  env?: NodeJS.ProcessEnv,
  discovery?: any,
): string[] {
  // openclaw 按 pluginId 列出；cross-wms 暂只支持 channelId，这里返回与 channelId 相同的列表
  return listBundledChannelIdsImpl(env, discovery) as string[];
}

export function listBundledChannelIdsForRoot(
  _packageRoot: string,
  env?: NodeJS.ProcessEnv,
  discovery?: any,
): string[] {
  return listBundledChannelIdsImpl(env, discovery) as string[];
}

export function listBundledChannelPluginIds(
  env?: NodeJS.ProcessEnv,
  discovery?: any,
): string[] {
  return listBundledChannelIdsImpl(env, discovery) as string[];
}

export function listBundledChannelIds(
  env?: NodeJS.ProcessEnv,
  discovery?: any,
): string[] {
  return listBundledChannelIdsImpl(env, discovery) as string[];
}
