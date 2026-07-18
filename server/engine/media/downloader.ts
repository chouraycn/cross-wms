/**
 * Media Downloader — 媒体下载器
 *
 * 提供 URL 下载、Range 请求计算、重试策略等。
 */

import { logger } from "../../logger.js";
import { getAsset } from "./media-store.js";
import {
  detectMediaFormat,
  detectMediaType,
} from "./asset-manager.js";
import type { DownloadRequest, DownloadResult } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 60000;
export const MAX_DOWNLOAD_SIZE = 1024 * 1024 * 1024; // 1GB
export const DEFAULT_RETRY_COUNT = 3;
export const DEFAULT_RETRY_BACKOFF_MS = 1000;

export function validateDownloadRequest(req: DownloadRequest): string[] {
  const errors: string[] = [];
  if (!req.url && !req.assetId) {
    errors.push("url or assetId is required");
  }
  if (req.url && !/^https?:\/\//i.test(req.url)) {
    errors.push("url must be http/https");
  }
  if (req.range) {
    if (req.range.start < 0) errors.push("range.start must be >= 0");
    if (req.range.end < req.range.start) {
      errors.push("range.end must be >= range.start");
    }
  }
  return errors;
}

export function buildRangeHeader(range?: { start: number; end: number }): string | undefined {
  if (!range) return undefined;
  return `bytes=${range.start}-${range.end}`;
}

export function parseContentRange(header: string): {
  start?: number;
  end?: number;
  total?: number;
} {
  if (!header) return {};
  const match = header.match(/bytes\s+(\d+)-(\d+)\/(\d+)/);
  if (!match) return {};
  return {
    start: parseInt(match[1], 10),
    end: parseInt(match[2], 10),
    total: parseInt(match[3], 10),
  };
}

export function parseContentLength(header: string | number | undefined): number | undefined {
  if (header === undefined) return undefined;
  const value = typeof header === "number" ? header : parseInt(header, 10);
  return Number.isNaN(value) ? undefined : value;
}

export function computeRetryDelay(attempt: number, baseMs: number = DEFAULT_RETRY_BACKOFF_MS): number {
  return baseMs * Math.pow(2, attempt);
}

export async function download(req: DownloadRequest): Promise<DownloadResult> {
  const errors = validateDownloadRequest(req);
  if (errors.length > 0) {
    throw new Error(`Invalid download request: ${errors.join("; ")}`);
  }

  if (req.assetId) {
    const asset = getAsset(req.assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${req.assetId}`);
    }
    const buffer = asset.buffer ?? Buffer.alloc(0);
    return {
      buffer,
      mimeType: asset.mimeType,
      size: buffer.length,
      statusCode: 200,
      headers: { "Content-Type": asset.mimeType },
    };
  }

  // URL 下载路径
  const url = req.url!;
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  logger.debug(`[Downloader] Downloading from ${url}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {};
    const rangeHeader = buildRangeHeader(req.range);
    if (rangeHeader) headers["Range"] = rangeHeader;

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Download failed (HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_DOWNLOAD_SIZE) {
      throw new Error(`Download exceeds max size ${MAX_DOWNLOAD_SIZE}`);
    }

    const mimeType =
      response.headers.get("content-type") ?? "application/octet-stream";

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      buffer,
      mimeType,
      size: buffer.length,
      statusCode: response.status,
      headers: responseHeaders,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Download timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

export async function downloadWithRetry(
  req: DownloadRequest,
  retryCount: number = DEFAULT_RETRY_COUNT,
): Promise<DownloadResult> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      return await download(req);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retryCount) {
        const delay = computeRetryDelay(attempt);
        logger.debug(
          `[Downloader] Attempt ${attempt + 1} failed, retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("Download failed");
}

export function getDownloadSummary(result: DownloadResult): string {
  const type = detectMediaType(result.mimeType);
  const format = detectMediaFormat(result.mimeType);
  return `${type}/${format} | ${result.size}B | HTTP ${result.statusCode}`;
}

export function getMaxDownloadSize(): number {
  return MAX_DOWNLOAD_SIZE;
}

export function getDefaultTimeoutMs(): number {
  return DEFAULT_TIMEOUT_MS;
}
