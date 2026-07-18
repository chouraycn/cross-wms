/**
 * Agent 媒体负载 — 将出站媒体描述符转换为 legacy agent payload 字段布局
 *
 * 注：openclaw 原版有 re-export `getAgentScopedMediaLocalRoots` 来自
 * `../media/local-roots.js`，cross-wms 暂无对应模块，已裁剪。
 *
 * 参考 openclaw/src/plugin-sdk/agent-media-payload.ts
 */

/** 老 agent 适配器消费的 legacy 媒体负载布局。 */
export type AgentMediaPayload = {
  MediaPath?: string;
  MediaType?: string;
  MediaUrl?: string;
  MediaPaths?: string[];
  MediaUrls?: string[];
  MediaTypes?: string[];
};

/**
 * 将出站媒体描述符列表转换为 legacy agent payload 字段布局。
 *
 * - 首项填充单个字段（MediaPath/MediaType/MediaUrl）
 * - 全部项填充数组字段（MediaPaths/MediaUrls/MediaTypes）
 * - 数组为空时省略
 */
export function buildAgentMediaPayload(
  mediaList: Array<{ path: string; contentType?: string | null }>,
): AgentMediaPayload {
  const first = mediaList[0];
  const mediaPaths = mediaList.map((media) => media.path);
  const mediaTypes = mediaList.map((media) => media.contentType).filter(Boolean) as string[];
  return {
    MediaPath: first?.path,
    MediaType: first?.contentType ?? undefined,
    MediaUrl: first?.path,
    MediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaUrls: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
  };
}
