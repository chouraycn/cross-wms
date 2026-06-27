/**
 * Image asset utilities — 图片资产工具
 *
 * 移植自 openclaw/src/image-generation/image-assets.ts
 *
 * 处理 API 响应解析、MIME 类型检测等。
 */

import type { GeneratedImageAsset } from "./types.js";

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
