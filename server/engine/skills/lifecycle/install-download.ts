/**
 * 技能安装 - 下载管理器
 *
 * 提供文件下载、重试机制、校验和验证等功能。
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../../../logger.js";
import type { DownloadOptions, ClawHubSkillArchive } from "./install-types.js";

/** 默认下载超时时间（30秒） */
const DEFAULT_DOWNLOAD_TIMEOUT = 30_000;

/** 默认重试次数 */
const DEFAULT_RETRIES = 3;

/** 重试间隔（毫秒） */
const RETRY_DELAY_MS = 1000;

/**
 * 下载文件到指定路径
 *
 * @param url - 下载 URL
 * @param destPath - 目标文件路径
 * @param options - 下载选项
 * @returns Promise<void>
 */
export async function downloadFile(
  url: string,
  destPath: string,
  options: DownloadOptions = {},
): Promise<void> {
  const { timeout = DEFAULT_DOWNLOAD_TIMEOUT, headers = {}, onProgress } = options;

  logger.debug("[Skills] Downloading file:", url, "->", destPath);

  const destDir = path.dirname(destPath);
  await fs.mkdir(destDir, { recursive: true });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let downloaded = 0;

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        downloaded += value.length;
        if (onProgress && total > 0) {
          onProgress(downloaded, total);
        }
      }
    }

    const buffer = concatenateChunks(chunks);
    await fs.writeFile(destPath, buffer);

    logger.debug("[Skills] Download complete:", destPath, `(${downloaded} bytes)`);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Download timed out after ${timeout}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 连接多个 Uint8Array 块
 */
function concatenateChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * 带重试的文件下载
 *
 * @param url - 下载 URL
 * @param destPath - 目标文件路径
 * @param retries - 重试次数（默认 3 次）
 * @param options - 下载选项
 * @returns Promise<void>
 */
export async function downloadWithRetry(
  url: string,
  destPath: string,
  retries: number = DEFAULT_RETRIES,
  options: DownloadOptions = {},
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        logger.debug(
          "[Skills] Download attempt",
          attempt + 1,
          "/",
          retries + 1,
          "for:",
          url,
        );
        await delay(RETRY_DELAY_MS * attempt);
      }

      await downloadFile(url, destPath, options);
      return;
    } catch (err) {
      lastError = err;
      logger.warn(
        "[Skills] Download attempt",
        attempt + 1,
        "failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Download failed after ${retries + 1} attempts: ${errorMessage}`);
}

/**
 * 延迟指定毫秒数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 校验文件的 SHA256 校验和
 *
 * @param filePath - 文件路径
 * @param expectedSha256 - 期望的 SHA256 哈希值（十六进制）
 * @returns Promise<boolean> - 校验是否通过
 */
export async function verifyChecksum(
  filePath: string,
  expectedSha256: string,
): Promise<boolean> {
  logger.debug("[Skills] Verifying checksum for:", filePath);

  try {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    const actualSha256 = hashSum.digest("hex");

    const isValid = actualSha256.toLowerCase() === expectedSha256.toLowerCase();

    if (!isValid) {
      logger.warn(
        "[Skills] Checksum mismatch for",
        filePath,
        "- expected:",
        expectedSha256,
        "actual:",
        actualSha256,
      );
    } else {
      logger.debug("[Skills] Checksum verified for:", filePath);
    }

    return isValid;
  } catch (err) {
    logger.error("[Skills] Failed to verify checksum:", err);
    return false;
  }
}

/**
 * 计算文件的 SHA256 校验和
 *
 * @param filePath - 文件路径
 * @returns Promise<string> - SHA256 哈希值（十六进制）
 */
export async function computeFileChecksum(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  return hashSum.digest("hex");
}

/**
 * 从 ClawHub 下载技能归档（Mock 实现）
 *
 * 注意：这是一个 mock 实现，用于演示下载流程。
 * 实际实现需要对接真实的 ClawHub API。
 *
 * @param slug - 技能标识
 * @param version - 版本号
 * @returns Promise<ClawHubSkillArchive> - 归档信息
 */
export async function downloadClawHubSkillArchive(
  slug: string,
  version: string,
): Promise<ClawHubSkillArchive> {
  logger.info("[Skills] Mock downloading ClawHub skill:", slug, "version:", version);

  const mockArchive: ClawHubSkillArchive = {
    slug,
    version,
    downloadUrl: `https://clawhub.example.com/skills/${slug}/${version}/archive.tar.gz`,
    sha256: generateMockChecksum(slug, version),
    size: 1024 * 100,
  };

  logger.debug("[Skills] Mock archive info:", JSON.stringify(mockArchive));

  return mockArchive;
}

/**
 * 生成 Mock 校验和（用于测试）
 */
function generateMockChecksum(slug: string, version: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(`${slug}-${version}-mock`);
  return hash.digest("hex");
}

/**
 * 获取临时目录路径
 *
 * @param prefix - 目录前缀
 * @returns Promise<string> - 临时目录路径
 */
export async function getTempDir(prefix: string = "skill-install"): Promise<string> {
  const tmpDir = path.join(
    process.env.TMPDIR || "/tmp",
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * 清理临时目录
 *
 * @param dirPath - 目录路径
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    logger.debug("[Skills] Cleaned up temp dir:", dirPath);
  } catch (err) {
    logger.warn("[Skills] Failed to clean up temp dir:", dirPath, err);
  }
}
