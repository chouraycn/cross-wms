/**
 * Image asset utilities — 图片资产工具
 *
 * 移植自 openclaw/src/image-generation/image-assets.ts
 *
 * 处理 API 响应解析、MIME 类型检测、资产管理、缓存、元数据等。
 */

import { logger } from "../../logger.js";
import type { GeneratedImageAsset } from "./types.js";

export type ImageAssetMetadata = {
  id: string;
  width?: number;
  height?: number;
  fileSize: number;
  mimeType: string;
  createdAt: number;
  prompt?: string;
  revisedPrompt?: string;
  provider?: string;
  model?: string;
  style?: string;
  tags?: string[];
  hash?: string;
  source?: "generated" | "uploaded" | "edited";
  parentId?: string;
  edits?: string[];
  nsfwScore?: number;
  nsfwCategory?: string;
};

export type ImageAsset = GeneratedImageAsset & {
  metadata?: ImageAssetMetadata;
};

type CacheEntry = {
  key: string;
  asset: ImageAsset;
  timestamp: number;
  accessCount: number;
};

const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;
const imageCache: Map<string, CacheEntry> = new Map();

function generateAssetId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateCacheKey(prompt: string, params: Record<string, unknown> = {}): string {
  const normalized = prompt.trim().toLowerCase();
  const paramsStr = JSON.stringify(params);
  const hash = simpleHash(`${normalized}:${paramsStr}`);
  return `cache_${hash}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Parse OpenAI-compatible image generation response.
 *
 * Handles both b64_json and URL response formats.
 */
export function parseOpenAiCompatibleImageResponse(data: {
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}): GeneratedImageAsset[] {
  const images: GeneratedImageAsset[] = [];
  const dataArray = data.data || [];

  for (const item of dataArray) {
    if (item.b64_json) {
      try {
        const buffer = Buffer.from(item.b64_json, "base64");
        images.push({
          buffer,
          mimeType: "image/png",
          revisedPrompt: item.revised_prompt,
        });
      } catch {
        // Skip invalid base64
      }
    }
  }

  return images;
}

/**
 * Sniff MIME type from buffer magic bytes.
 *
 * Supports PNG, JPEG, WebP, GIF.
 */
export function sniffImageMimeType(buffer: Buffer): string {
  if (buffer.length < 12) {
    return "application/octet-stream";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // GIF: GIF8
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }

  return "application/octet-stream";
}

/**
 * Get file extension from MIME type.
 */
export function getImageExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

/**
 * Save generated images to local filesystem.
 *
 * @param images - Generated image assets
 * @param outputDir - Output directory
 * @param baseName - Base filename (without extension)
 * @returns Array of saved file paths
 */
export function saveGeneratedImages(
  images: GeneratedImageAsset[],
  outputDir: string,
  baseName: string,
): string[] {
  const fs = require("fs");
  const path = require("path");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const savedPaths: string[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const ext = getImageExtension(image.mimeType);
    const fileName = image.fileName || `${baseName}_${timestamp}_${i + 1}.${ext}`;
    const filePath = path.join(outputDir, fileName);

    fs.writeFileSync(filePath, image.buffer);
    savedPaths.push(filePath);
  }

  return savedPaths;
}

export function createImageAsset(
  buffer: Buffer,
  options: Partial<ImageAssetMetadata> = {},
): ImageAsset {
  const mimeType = sniffImageMimeType(buffer);
  const id = options.id || generateAssetId();

  const metadata: ImageAssetMetadata = {
    id,
    fileSize: buffer.length,
    mimeType,
    createdAt: Date.now(),
    ...options,
  };

  return {
    buffer,
    mimeType,
    metadata,
  };
}

export function getImageAssetFromCache(
  prompt: string,
  params: Record<string, unknown> = {},
): ImageAsset | undefined {
  const key = generateCacheKey(prompt, params);
  const entry = imageCache.get(key);

  if (!entry) return undefined;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL_MS) {
    imageCache.delete(key);
    return undefined;
  }

  entry.accessCount++;
  entry.timestamp = now;
  return entry.asset;
}

export function setImageAssetCache(
  prompt: string,
  asset: ImageAsset,
  params: Record<string, unknown> = {},
): void {
  const key = generateCacheKey(prompt, params);

  if (imageCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [k, v] of imageCache) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      imageCache.delete(oldestKey);
      logger.debug(`[ImageAssets] Cache evicted: ${oldestKey}`);
    }
  }

  imageCache.set(key, {
    key,
    asset,
    timestamp: Date.now(),
    accessCount: 0,
  });

  logger.debug(`[ImageAssets] Cache set: ${key} (cache size: ${imageCache.size})`);
}

export function clearImageCache(): void {
  imageCache.clear();
  logger.info("[ImageAssets] Cache cleared");
}

export function getCacheStats(): {
  size: number;
  maxSize: number;
  hitRate: number;
  totalAccesses: number;
} {
  let totalAccesses = 0;
  for (const entry of imageCache.values()) {
    totalAccesses += entry.accessCount;
  }

  return {
    size: imageCache.size,
    maxSize: MAX_CACHE_SIZE,
    hitRate: 0,
    totalAccesses,
  };
}

export function generateFileName(
  options: {
    baseName?: string;
    prefix?: string;
    suffix?: string;
    extension?: string;
    includeTimestamp?: boolean;
    includeRandom?: boolean;
    index?: number;
  } = {},
): string {
  const {
    baseName = "image",
    prefix = "",
    suffix = "",
    extension = "png",
    includeTimestamp = true,
    includeRandom = false,
    index,
  } = options;

  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  parts.push(baseName);
  if (includeTimestamp) parts.push(Date.now().toString());
  if (includeRandom) parts.push(Math.random().toString(36).slice(2, 8));
  if (index !== undefined) parts.push(String(index + 1));
  if (suffix) parts.push(suffix);

  return `${parts.join("_")}.${extension}`;
}

export function compareImageAssets(a: ImageAsset, b: ImageAsset): boolean {
  if (a.buffer.length !== b.buffer.length) return false;
  for (let i = 0; i < a.buffer.length; i++) {
    if (a.buffer[i] !== b.buffer[i]) return false;
  }
  return true;
}

export function calculateImageHash(buffer: Buffer): string {
  let hash = 0;
  const step = Math.max(1, Math.floor(buffer.length / 1000));
  for (let i = 0; i < buffer.length; i += step) {
    hash = ((hash << 5) - hash) + buffer[i];
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function cloneImageAsset(asset: GeneratedImageAsset): GeneratedImageAsset {
  return {
    buffer: Buffer.from(asset.buffer),
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    revisedPrompt: asset.revisedPrompt,
    metadata: asset.metadata ? { ...asset.metadata } : undefined,
  };
}

export function validateImageAsset(asset: GeneratedImageAsset): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!asset.buffer || asset.buffer.length === 0) {
    errors.push("图像缓冲区为空");
  }

  if (!asset.mimeType) {
    errors.push("缺少 MIME 类型");
  }

  if (asset.buffer && asset.buffer.length > 0) {
    const sniffed = sniffImageMimeType(asset.buffer);
    if (sniffed === "application/octet-stream") {
      errors.push("无法识别的图像格式");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function loadImageFromFile(filePath: string): Promise<ImageAsset> {
  return new Promise((resolve, reject) => {
    const fs = require("fs");
    const path = require("path");

    fs.readFile(filePath, (err: Error, data: Buffer) => {
      if (err) {
        reject(err);
        return;
      }

      const mimeType = sniffImageMimeType(data);
      const fileName = path.basename(filePath);

      resolve({
        buffer: data,
        mimeType,
        fileName,
        metadata: {
          id: generateAssetId(),
          fileSize: data.length,
          mimeType,
          createdAt: Date.now(),
          source: "uploaded",
        },
      });
    });
  });
}
