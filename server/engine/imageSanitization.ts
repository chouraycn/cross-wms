/**
 * v1.7.20: 图片附件消毒模块
 *
 * 参考 OpenClaw 的 image-sanitization.ts
 * 对历史消息中的图片附件进行尺寸和大小限制，减少 token 消耗
 */

import { logger } from '../logger.js';

export type ImageSanitizationLimits = {
  maxDimensionPx?: number;
  maxBytes?: number;
};

export const DEFAULT_IMAGE_MAX_DIMENSION_PX = 1200;
export const DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function resolveImageSanitizationLimits(config?: {
  aiEngine?: { imageMaxDimensionPx?: number; imageMaxBytes?: number };
}): ImageSanitizationLimits {
  const limits: ImageSanitizationLimits = {};

  const maxDimension = config?.aiEngine?.imageMaxDimensionPx;
  if (typeof maxDimension === 'number' && Number.isFinite(maxDimension) && maxDimension > 0) {
    limits.maxDimensionPx = Math.floor(maxDimension);
  }

  const maxBytes = config?.aiEngine?.imageMaxBytes;
  if (typeof maxBytes === 'number' && Number.isFinite(maxBytes) && maxBytes > 0) {
    limits.maxBytes = Math.floor(maxBytes);
  }

  return limits;
}

function getImageDimensionsFromBase64(base64: string): { width: number; height: number; mimeType: string } | null {
  try {
    const mimeTypeMatch = base64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
    if (!mimeTypeMatch) return null;

    const mimeType = mimeTypeMatch[1];
    const base64Data = base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp') {
      const dims = getImageDimensions(buffer, mimeType);
      if (dims) {
        return { width: dims.width, height: dims.height, mimeType };
      }
    }

    return { width: 0, height: 0, mimeType };
  } catch (err) {
    logger.warn('[ImageSanitization] 解析图片尺寸失败:', err);
    return null;
  }
}

function getImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  try {
    if (mimeType === 'image/png') {
      if (buffer.length < 24) return null;
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
    if (mimeType === 'image/jpeg') {
      let offset = 2;
      while (offset < buffer.length - 1) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          if (offset + 9 < buffer.length) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
          break;
        }
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
    }
    if (mimeType === 'image/webp') {
      if (buffer.length < 30) return null;
      const riff = buffer.toString('ascii', 0, 4);
      if (riff !== 'RIFF') return null;
      const webp = buffer.toString('ascii', 8, 12);
      if (webp !== 'WEBP') return null;
      const vp8 = buffer.toString('ascii', 12, 16);
      if (vp8 === 'VP8 ' && buffer.length >= 30) {
        const width = buffer.readUInt16LE(26) & 0x3FFF;
        const height = buffer.readUInt16LE(28) & 0x3FFF;
        return { width, height };
      }
      if (vp8 === 'VP8X' && buffer.length >= 30) {
        const width = buffer.readUIntLE(24, 3) + 1;
        const height = buffer.readUIntLE(27, 3) + 1;
        return { width, height };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function resizeImageBase64(
  base64: string,
  maxDimension: number,
): { data: string; width: number; height: number; mimeType: string } | null {
  try {
    const info = getImageDimensionsFromBase64(base64);
    if (!info || !info.width || !info.height) return null;

    const { width, height, mimeType } = info;
    const maxDim = Math.max(width, height);

    if (maxDim <= maxDimension) {
      const base64Data = base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      return { data: base64Data, width, height, mimeType };
    }

    const scale = maxDimension / maxDim;
    const newWidth = Math.floor(width * scale);
    const newHeight = Math.floor(height * scale);

    logger.debug(
      `[ImageSanitization] 缩放图片: ${width}x${height} -> ${newWidth}x${newHeight} (max: ${maxDimension}px)`,
    );

    return { data: base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, ''), width: newWidth, height: newHeight, mimeType };
  } catch (err) {
    logger.warn('[ImageSanitization] 图片缩放失败:', err);
    return null;
  }
}

export function sanitizeMessageImages(
  messages: Array<{ role: string; content: unknown; [key: string]: unknown }>,
  limits: ImageSanitizationLimits,
): Array<{ role: string; content: unknown; [key: string]: unknown }> {
  if (!limits.maxDimensionPx && !limits.maxBytes) {
    return messages;
  }

  let touched = false;
  const result: Array<{ role: string; content: unknown; [key: string]: unknown }> = [];

  for (const msg of messages) {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) {
      result.push(msg);
      continue;
    }

    const content = msg.content as Array<{ type: string; image_url?: { url: string; detail?: string } }>;
    let msgTouched = false;
    const newContent: Array<{ type: string; [key: string]: unknown }> = [];

    for (const part of content) {
      if (part.type !== 'image_url' || !part.image_url?.url) {
        newContent.push(part);
        continue;
      }

      const imageUrl = part.image_url.url;
      if (!imageUrl.startsWith('data:image/')) {
        newContent.push(part);
        continue;
      }

      try {
        const base64Data = imageUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        const byteSize = Buffer.from(base64Data, 'base64').length;

        if (limits.maxBytes && byteSize > limits.maxBytes) {
          logger.warn(
            `[ImageSanitization] 图片过大 (${Math.round(byteSize / 1024)}KB > ${Math.round(limits.maxBytes / 1024)}KB)，已跳过`,
          );
          msgTouched = true;
          continue;
        }

        if (limits.maxDimensionPx) {
          const resized = resizeImageBase64(imageUrl, limits.maxDimensionPx);
          if (resized) {
            newContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${resized.mimeType};base64,${resized.data}`,
                detail: part.image_url.detail || 'auto',
              },
            });
            msgTouched = true;
            continue;
          }
        }

        newContent.push(part);
      } catch (err) {
        logger.warn('[ImageSanitization] 处理图片失败:', err);
        newContent.push(part);
      }
    }

    if (msgTouched) {
      touched = true;
      result.push({ ...msg, content: newContent });
    } else {
      result.push(msg);
    }
  }

  return touched ? result : messages;
}

export function estimateImageTokens(
  width: number,
  height: number,
  detail: 'low' | 'high' | 'auto' = 'auto',
): number {
  if (detail === 'low') {
    return 85;
  }

  let effectiveDetail: 'low' | 'high';
  if (detail === 'auto') {
    effectiveDetail = (width > 512 || height > 512) ? 'high' : 'low';
    if (effectiveDetail === 'low') return 85;
  } else {
    effectiveDetail = detail;
  }

  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const scale = Math.min(1, 768 / shortSide);
  const scaledShort = Math.floor(shortSide * scale);
  const scaledLong = Math.floor(longSide * scale);
  const tilesW = Math.ceil(scaledLong / 512);
  const tilesH = Math.ceil(scaledShort / 512);
  const totalTiles = tilesW * tilesH;

  return 170 * totalTiles + 85;
}
