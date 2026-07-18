/**
 * 频道出站负载构建器使用的输入媒体条目
 *
 * 参考 openclaw/src/channels/plugins/media-payload.ts
 */

/** 输入媒体条目 */
export type MediaPayloadInput = {
  path: string;
  contentType?: string;
};

/** 兼容旧版的媒体负载形状，供插件发送助手使用 */
export type MediaPayload = {
  MediaPath?: string;
  MediaType?: string;
  MediaUrl?: string;
  MediaPaths?: string[];
  MediaUrls?: string[];
  MediaTypes?: string[];
};

/** 为频道出站助手构建单项与列表媒体字段 */
export function buildMediaPayload(
  mediaList: MediaPayloadInput[],
  opts?: { preserveMediaTypeCardinality?: boolean },
): MediaPayload {
  const first = mediaList[0];
  const mediaPaths = mediaList.map((media) => media.path);
  const rawMediaTypes = mediaList.map((media) => media.contentType ?? "");
  // 一些调用者需要 MediaTypes 与 MediaPaths 保持对齐（包括空白条目）；
  // 其他调用者使用紧凑的旧版存在内容类型列表
  const mediaTypes = opts?.preserveMediaTypeCardinality
    ? rawMediaTypes
    : rawMediaTypes.filter((value): value is string => Boolean(value));
  return {
    MediaPath: first?.path,
    MediaType: first?.contentType,
    MediaUrl: first?.path,
    MediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaUrls: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
  };
}
