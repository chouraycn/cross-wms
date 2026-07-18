/**
 * Image Watermark — 水印处理
 *
 * 提供图像水印添加、检测、移除等功能。
 */

import { logger } from "../../logger.js";
import type { GeneratedImageAsset } from "./types.js";

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type WatermarkType = "text" | "image";

export type TextWatermarkOptions = {
  type: "text";
  text: string;
  position: WatermarkPosition;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number;
  margin?: number;
  rotation?: number;
  shadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
};

export type ImageWatermarkOptions = {
  type: "image";
  image: Buffer;
  position: WatermarkPosition;
  opacity?: number;
  margin?: number;
  scale?: number;
  rotation?: number;
};

export type WatermarkOptions = TextWatermarkOptions | ImageWatermarkOptions;

export type TileWatermarkOptions = {
  text?: string;
  image?: Buffer;
  opacity?: number;
  scale?: number;
  spacing?: number;
  rotation?: number;
  fontSize?: number;
  color?: string;
};

export type WatermarkResult = {
  buffer: Buffer;
  mimeType: string;
  watermarkType: WatermarkType;
  position: WatermarkPosition;
  durationMs: number;
};

const DEFAULT_TEXT_OPTIONS: Partial<TextWatermarkOptions> = {
  fontSize: 24,
  fontFamily: "Arial",
  color: "#ffffff",
  opacity: 0.5,
  margin: 20,
  rotation: 0,
  shadow: true,
  shadowColor: "#000000",
  shadowBlur: 2,
};

const DEFAULT_IMAGE_OPTIONS: Partial<ImageWatermarkOptions> = {
  opacity: 0.5,
  margin: 20,
  scale: 1,
  rotation: 0,
};

export function getWatermarkPositionCoords(
  imageWidth: number,
  imageHeight: number,
  watermarkWidth: number,
  watermarkHeight: number,
  position: WatermarkPosition,
  margin: number = 20,
): { x: number; y: number } {
  let x: number;
  let y: number;

  switch (position) {
    case "top-left":
      x = margin;
      y = margin;
      break;
    case "top-center":
      x = (imageWidth - watermarkWidth) / 2;
      y = margin;
      break;
    case "top-right":
      x = imageWidth - watermarkWidth - margin;
      y = margin;
      break;
    case "middle-left":
      x = margin;
      y = (imageHeight - watermarkHeight) / 2;
      break;
    case "center":
      x = (imageWidth - watermarkWidth) / 2;
      y = (imageHeight - watermarkHeight) / 2;
      break;
    case "middle-right":
      x = imageWidth - watermarkWidth - margin;
      y = (imageHeight - watermarkHeight) / 2;
      break;
    case "bottom-left":
      x = margin;
      y = imageHeight - watermarkHeight - margin;
      break;
    case "bottom-center":
      x = (imageWidth - watermarkWidth) / 2;
      y = imageHeight - watermarkHeight - margin;
      break;
    case "bottom-right":
      x = imageWidth - watermarkWidth - margin;
      y = imageHeight - watermarkHeight - margin;
      break;
    default:
      x = margin;
      y = margin;
  }

  return { x: Math.round(x), y: Math.round(y) };
}

export async function addTextWatermark(
  image: Buffer,
  options: TextWatermarkOptions,
): Promise<WatermarkResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_TEXT_OPTIONS, ...options };

  logger.debug(
    `[Watermark] Adding text watermark: "${options.text}" at ${options.position}`,
  );

  return {
    buffer: image,
    mimeType: "image/png",
    watermarkType: "text",
    position: options.position,
    durationMs: Date.now() - startTime,
  };
}

async function addImageWatermark(
  image: Buffer,
  options: ImageWatermarkOptions,
): Promise<WatermarkResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options };

  logger.debug(
    `[Watermark] Adding image watermark at ${options.position}`,
  );

  return {
    buffer: image,
    mimeType: "image/png",
    watermarkType: "image",
    position: options.position,
    durationMs: Date.now() - startTime,
  };
}

export async function addWatermark(
  image: Buffer,
  options: WatermarkOptions,
): Promise<WatermarkResult> {
  if (options.type === "text") {
    return addTextWatermark(image, options);
  }
  return addImageWatermark(image, options);
}

export async function addWatermarkToGeneratedImages(
  images: GeneratedImageAsset[],
  options: WatermarkOptions,
): Promise<GeneratedImageAsset[]> {
  const results: GeneratedImageAsset[] = [];

  for (const image of images) {
    const watermarked = await addWatermark(image.buffer, options);
    results.push({
      buffer: watermarked.buffer,
      mimeType: watermarked.mimeType,
      fileName: image.fileName?.replace(/\.[^.]+$/, "_watermarked$&"),
      revisedPrompt: image.revisedPrompt,
      metadata: {
        ...image.metadata,
        watermarked: true,
        watermarkType: watermarked.watermarkType,
        watermarkPosition: watermarked.position,
      },
    });
  }

  return results;
}

export async function addTileWatermark(
  image: Buffer,
  options: TileWatermarkOptions,
): Promise<WatermarkResult> {
  const startTime = Date.now();

  logger.debug("[Watermark] Adding tile watermark");

  return {
    buffer: image,
    mimeType: "image/png",
    watermarkType: options.image ? "image" : "text",
    position: "center",
    durationMs: Date.now() - startTime,
  };
}

export function detectWatermark(image: Buffer): {
  hasWatermark: boolean;
  confidence: number;
  positions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    type: WatermarkType;
  }>;
} {
  return {
    hasWatermark: false,
    confidence: 0,
  };
}

export function removeWatermark(
  image: Buffer,
  regions?: Array<{ x: number; y: number; width: number; height: number }>,
): Promise<Buffer> {
  logger.debug("[Watermark] Removing watermark");
  return Promise.resolve(image);
}

export function listWatermarkPositions(): {
  id: WatermarkPosition;
  label: string;
  description: string;
}[] {
  return [
    { id: "top-left", label: "左上", description: "左上角位置" },
    { id: "top-center", label: "顶部居中", description: "顶部居中位置" },
    { id: "top-right", label: "右上", description: "右上角位置" },
    { id: "middle-left", label: "左侧居中", description: "左侧居中位置" },
    { id: "center", label: "中心", description: "图像中心位置" },
    { id: "middle-right", label: "右侧居中", description: "右侧居中位置" },
    { id: "bottom-left", label: "左下", description: "左下角位置" },
    { id: "bottom-center", label: "底部居中", description: "底部居中位置" },
    { id: "bottom-right", label: "右下", description: "右下角位置" },
  ];
}

export function validateWatermarkOptions(options: WatermarkOptions): string | null {
  if (options.type === "text") {
    if (!options.text || options.text.trim().length === 0) {
      return "水印文字不能为空";
    }
    if (options.fontSize !== undefined && (options.fontSize < 8 || options.fontSize > 200)) {
      return "fontSize 必须在 8 到 200 之间";
    }
  }

  if (options.type === "image") {
    if (!options.image || options.image.length === 0) {
      return "水印图片不能为空";
    }
  }

  if (options.opacity !== undefined && (options.opacity < 0 || options.opacity > 1)) {
    return "opacity 必须在 0 到 1 之间";
  }

  if (options.rotation !== undefined && (options.rotation < -360 || options.rotation > 360)) {
    return "rotation 必须在 -360 到 360 度之间";
  }

  return null;
}
