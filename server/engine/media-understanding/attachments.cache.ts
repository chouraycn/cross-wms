import { realpathSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  isInboundPathAllowed,
  mergeInboundPathRoots,
} from "@openclaw/media-core/inbound-path-policy";
import { detectMime } from "@openclaw/media-core/mime";
import type { MediaAttachment } from "./types.js";

type MediaBufferResult = {
  buffer: Buffer;
  mime?: string;
  fileName: string;
  size: number;
};

type MediaPathResult = {
  path: string;
  cleanup?: () => Promise<void> | void;
};

type LocalReadResult = {
  buffer: Buffer;
  filePath: string;
};

type AttachmentCacheEntry = {
  attachment: MediaAttachment;
  resolvedPath?: string;
  statSize?: number;
  buffer?: Buffer;
  bufferMime?: string;
  bufferFileName?: string;
  tempPath?: string;
  tempCleanup?: () => Promise<void>;
};

export type SsrFPolicy = {
  allowPrivateNetwork?: boolean;
  allowLoopback?: boolean;
  blockedHostnames?: string[];
  allowedHostnames?: string[];
  blockedIpRanges?: string[];
  allowedIpRanges?: string[];
};

function concreteMime(mime: string | undefined): string | undefined {
  const normalized = mime?.trim();
  if (!normalized || normalized.endsWith("/*")) {
    return undefined;
  }
  return normalized;
}

function resolveUsableLocalCandidate(
  candidate: string,
  roots: readonly string[],
): string | undefined {
  try {
    const realPath = realpathSync(candidate);
    const canonicalRoots = roots.map((root) => {
      if (root.includes("*")) {
        return root;
      }
      try {
        return realpathSync(root);
      } catch {
        return root;
      }
    });
    return statSync(realPath).isFile() &&
      isInboundPathAllowed({ filePath: realPath, roots: canonicalRoots })
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
}

export type MediaAttachmentCacheOptions = {
  localPathRoots?: readonly string[];
  includeDefaultLocalPathRoots?: boolean;
  ssrfPolicy?: SsrFPolicy;
  workspaceDir?: string;
};

export class MediaAttachmentCache {
  private readonly entries = new Map<number, AttachmentCacheEntry>();
  private readonly attachments: MediaAttachment[];
  private readonly localPathRoots: readonly string[];
  private readonly ssrfPolicy: SsrFPolicy | undefined;
  private readonly workspaceDir?: string;
  private canonicalLocalPathRoots?: Promise<readonly string[]>;

  constructor(attachments: MediaAttachment[], options?: MediaAttachmentCacheOptions) {
    this.attachments = attachments;
    this.ssrfPolicy = options?.ssrfPolicy;
    this.localPathRoots = mergeInboundPathRoots(options?.localPathRoots);
    this.workspaceDir = options?.workspaceDir ? path.resolve(options.workspaceDir) : undefined;
    for (const attachment of attachments) {
      this.entries.set(attachment.index, { attachment });
    }
  }

  async getBuffer(params: {
    attachmentIndex: number;
    maxBytes: number;
    timeoutMs: number;
  }): Promise<MediaBufferResult> {
    const entry = await this.ensureEntry(params.attachmentIndex);
    const url = entry.attachment.url?.trim();
    if (entry.buffer) {
      if (entry.buffer.length > params.maxBytes) {
        throw new Error(
          `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`,
        );
      }
      return {
        buffer: entry.buffer,
        mime: entry.bufferMime,
        fileName: entry.bufferFileName ?? `media-${params.attachmentIndex + 1}`,
        size: entry.buffer.length,
      };
    }

    if (entry.resolvedPath) {
      try {
        const size = await this.ensureLocalStat(entry);
        if (entry.resolvedPath) {
          if (size !== undefined && size > params.maxBytes) {
            throw new Error(
              `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`,
            );
          }
          const { buffer, filePath } = await this.readLocalBuffer({
            attachmentIndex: params.attachmentIndex,
            filePath: entry.resolvedPath,
            maxBytes: params.maxBytes,
          });
          entry.resolvedPath = filePath;
          entry.buffer = buffer;
          entry.bufferMime =
            entry.bufferMime ??
            concreteMime(entry.attachment.mime) ??
            (await detectMime({
              buffer,
              filePath,
            }));
          entry.bufferFileName = path.basename(filePath) || `media-${params.attachmentIndex + 1}`;
          return {
            buffer,
            mime: entry.bufferMime,
            fileName: entry.bufferFileName,
            size: buffer.length,
          };
        }
      } catch (err) {
        if (!url) {
          throw err;
        }
      }
    }

    if (!url) {
      throw new Error(`Attachment ${params.attachmentIndex + 1} has no path or URL.`);
    }

    throw new Error(`Remote URL fetching not implemented in stub: ${url}`);
  }

  async getPath(params: {
    attachmentIndex: number;
    maxBytes?: number;
    timeoutMs: number;
  }): Promise<MediaPathResult> {
    const entry = await this.ensureEntry(params.attachmentIndex);
    if (entry.resolvedPath) {
      if (params.maxBytes) {
        try {
          const size = await this.ensureLocalStat(entry);
          if (entry.resolvedPath) {
            if (size !== undefined && size > params.maxBytes) {
              throw new Error(
                `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`,
              );
            }
          }
        } catch (err) {
          throw err;
        }
      }
      if (entry.resolvedPath) {
        return { path: entry.resolvedPath };
      }
    }

    if (entry.tempPath) {
      if (params.maxBytes && entry.buffer && entry.buffer.length > params.maxBytes) {
        throw new Error(
          `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`,
        );
      }
      return { path: entry.tempPath, cleanup: entry.tempCleanup };
    }

    const maxBytes = params.maxBytes ?? Number.POSITIVE_INFINITY;
    const bufferResult = await this.getBuffer({
      attachmentIndex: params.attachmentIndex,
      maxBytes,
      timeoutMs: params.timeoutMs,
    });
    const extension = path.extname(bufferResult.fileName || "") || "";
    const tmpPath = path.join(
      require("os").tmpdir(),
      `openclaw-media-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
    );
    await fs.writeFile(tmpPath, bufferResult.buffer);
    entry.tempPath = tmpPath;
    entry.tempCleanup = async () => {
      await fs.unlink(tmpPath).catch(() => {});
    };
    return { path: tmpPath, cleanup: entry.tempCleanup };
  }

  async cleanup(): Promise<void> {
    const cleanups: Promise<void>[] = [];
    for (const entry of this.entries.values()) {
      if (entry.tempCleanup) {
        cleanups.push(entry.tempCleanup());
        entry.tempCleanup = undefined;
      }
    }
    await Promise.all(cleanups);
  }

  private async ensureEntry(attachmentIndex: number): Promise<AttachmentCacheEntry> {
    const existing = this.entries.get(attachmentIndex);
    if (existing) {
      if (!existing.resolvedPath) {
        existing.resolvedPath = this.resolveLocalPath(existing.attachment);
      }
      return existing;
    }
    const attachment = this.attachments.find((item) => item.index === attachmentIndex) ?? {
      index: attachmentIndex,
    };
    const entry: AttachmentCacheEntry = {
      attachment,
      resolvedPath: this.resolveLocalPath(attachment),
    };
    this.entries.set(attachmentIndex, entry);
    return entry;
  }

  private resolveLocalPath(attachment: MediaAttachment): string | undefined {
    const rawPath = attachment.path;
    if (!rawPath) {
      return undefined;
    }
    if (this.workspaceDir) {
      return path.resolve(this.workspaceDir, rawPath);
    }
    if (!path.isAbsolute(rawPath)) {
      const cwdCandidate = path.resolve(rawPath);
      const usableCwdCandidate = resolveUsableLocalCandidate(cwdCandidate, this.localPathRoots);
      if (usableCwdCandidate) {
        return usableCwdCandidate;
      }
    }
    return path.resolve(rawPath);
  }

  private async ensureLocalStat(entry: AttachmentCacheEntry): Promise<number | undefined> {
    if (!entry.resolvedPath) {
      return undefined;
    }
    if (!isInboundPathAllowed({ filePath: entry.resolvedPath, roots: this.localPathRoots })) {
      entry.resolvedPath = undefined;
      throw new Error(
        `Attachment ${entry.attachment.index + 1} path is outside allowed roots.`,
      );
    }
    if (entry.statSize !== undefined) {
      return entry.statSize;
    }
    try {
      const stat = await fs.stat(entry.resolvedPath);
      entry.statSize = stat.size;
      return stat.size;
    } catch (err) {
      entry.resolvedPath = undefined;
      return undefined;
    }
  }

  private async getCanonicalLocalPathRoots(): Promise<readonly string[]> {
    if (this.canonicalLocalPathRoots) {
      return await this.canonicalLocalPathRoots;
    }
    this.canonicalLocalPathRoots = (async () =>
      mergeInboundPathRoots(
        this.localPathRoots,
        await Promise.all(
          this.localPathRoots.map(async (root) => {
            if (root.includes("*")) {
              return root;
            }
            return await fs.realpath(root).catch(() => root);
          }),
        ),
      ))();
    return await this.canonicalLocalPathRoots;
  }

  private async readLocalBuffer(params: {
    attachmentIndex: number;
    filePath: string;
    maxBytes: number;
  }): Promise<LocalReadResult> {
    try {
      const stat = await fs.stat(params.filePath);
      if (stat.size > params.maxBytes) {
        throw new Error(
          `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`,
        );
      }
      const canonicalRoots = await this.getCanonicalLocalPathRoots();
      const realPath = await fs.realpath(params.filePath);
      if (!isInboundPathAllowed({ filePath: realPath, roots: canonicalRoots })) {
        throw new Error(
          `Attachment ${params.attachmentIndex + 1} path is outside allowed roots.`,
        );
      }
      const buffer = await fs.readFile(params.filePath);
      if (buffer.length > params.maxBytes) {
        throw new Error(
          `Attachment ${params.attachmentIndex + 1} exceeds maxBytes ${params.maxBytes}`,
        );
      }
      return { buffer, filePath: realPath };
    } catch (err) {
      throw err;
    }
  }
}
