/**
 * Public SDK subpath for loading and optimizing local or remote web media.
 *
 * 移植自 openclaw/src/plugin-sdk/web-media.ts
 * 降级策略：openclaw 的 ../media/web-media.ts（1150 行）依赖 @openclaw/media-core、
 * ../infra/fs-safe.js、../infra/local-file-access.js、../infra/net/ssrf.js、
 * ../plugins/runtime.js 等大量未移植模块，无法整体移植。
 * 这里仅提供类型占位与函数 stub，调用时抛出 not implemented 错误。
 *
 * 注：outbound-media.ts 依赖本模块的 loadWebMedia 与 WebMediaResult 类型。
 */

/** Web media load result shape (local stub matching openclaw original). */
export type WebMediaResult = {
  buffer: Buffer;
  contentType?: string;
  sourceUrl: string;
};

/**
 * Load and optimize local or remote web media.
 * @deprecated cross-wms 降级 stub：未移植 media/web-media.ts，调用时抛错。
 */
export async function loadWebMedia(
  _mediaUrl: string,
  _options?: unknown,
): Promise<WebMediaResult> {
  throw new Error(
    "loadWebMedia: not implemented in cross-wms (media/web-media.ts not ported)",
  );
}

/**
 * Load raw local or remote web media without optimization.
 * @deprecated cross-wms 降级 stub：未移植 media/web-media.ts，调用时抛错。
 */
export async function loadWebMediaRaw(
  _mediaUrl: string,
  _options?: unknown,
): Promise<WebMediaResult> {
  throw new Error(
    "loadWebMediaRaw: not implemented in cross-wms (media/web-media.ts not ported)",
  );
}

/** @deprecated cross-wms 降级 stub：未移植 media/web-media.ts。 */
export function getDefaultLocalRoots(): readonly string[] {
  return [];
}

/** @deprecated cross-wms 降级 stub：未移植 media/web-media.ts。 */
export class LocalMediaAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalMediaAccessError";
  }
}

/** @deprecated cross-wms 降级 stub：未移植 media/web-media.ts。 */
export async function optimizeImageToJpeg(
  _buffer: Buffer,
  _options?: unknown,
): Promise<Buffer> {
  throw new Error(
    "optimizeImageToJpeg: not implemented in cross-wms (media/web-media.ts not ported)",
  );
}

/** @deprecated cross-wms 降级 stub：未移植 media/web-media.ts。 */
export async function optimizeImageToPng(
  _buffer: Buffer,
  _options?: unknown,
): Promise<Buffer> {
  throw new Error(
    "optimizeImageToPng: not implemented in cross-wms (media/web-media.ts not ported)",
  );
}

/** @deprecated cross-wms 降级 stub：未移植 media/web-media.ts。 */
export type LocalMediaAccessErrorCode = string;
