/**
 * Per-path queued append writer for logs and transcripts.
 *
 * Serializes writes, bounds queue/file growth, and exposes diagnostics for stuck-write probes.
 *
 * 移植自 openclaw/src/agents/queued-file-writer.ts。
 * 降级策略：
 *   - `appendRegularFile` 来自 ../infra/regular-file.js（cross-wms 已有，位置参数版本）。
 *     openclaw 上游使用对象参数 `appendRegularFile({ filePath, content, maxFileBytes, rejectSymlinkParents })`，
 *     这里在本地 safeAppendFile 中模拟：先检查文件大小（maxFileBytes），再调用位置参数版本，
 *     符号链接拒绝由 cross-wms 的 appendRegularFile 内部 lstat 守卫处理。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { appendRegularFile } from "../infra/regular-file.js";

/**
 * Serializes append-only writes per file path.
 *
 * Callers can enqueue log/transcript lines without awaiting each write; the
 * writer preserves order and exposes queue diagnostics for stuck-write probes.
 */
export type QueuedFileWriterDiagnostics = {
  pendingWrites: number;
  queuedBytes: number;
  activeOperation: "idle" | "mkdir" | "yield" | "file-append";
  activeWriteBytes?: number;
  maxFileBytes?: number;
  maxQueuedBytes?: number;
  yieldBeforeWrite: boolean;
};

/** Append writer handle shared by callers that target the same path. */
export type QueuedFileWriter = {
  filePath: string;
  write: (line: string) => unknown;
  flush: () => Promise<void>;
  describeQueue?: () => QueuedFileWriterDiagnostics;
};

type QueuedFileWriterOptions = {
  maxFileBytes?: number;
  maxQueuedBytes?: number;
  yieldBeforeWrite?: boolean;
};

async function safeAppendFile(
  filePath: string,
  line: string,
  options: QueuedFileWriterOptions,
): Promise<void> {
  // 模拟 openclaw 上游 maxFileBytes 限制：追加前检查当前文件大小。
  if (options.maxFileBytes !== undefined) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile() && stat.size > options.maxFileBytes) {
        return;
      }
    } catch {
      // 文件不存在时忽略，继续追加创建。
    }
  }
  // cross-wms 的 appendRegularFile 内部已通过 lstat 拒绝符号链接。
  await appendRegularFile(filePath, line);
}

function waitForImmediate(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** Returns the cached writer for a path or creates a new ordered append queue. */
export function getQueuedFileWriter(
  writers: Map<string, QueuedFileWriter>,
  filePath: string,
  options: QueuedFileWriterOptions = {},
): QueuedFileWriter {
  const existing = writers.get(filePath);
  if (existing) {
    return existing;
  }

  const dir = path.dirname(filePath);
  const ready = fs.mkdir(dir, { recursive: true, mode: 0o700 }).catch(() => undefined);
  let queue: Promise<unknown> = Promise.resolve();
  let pendingWrites = 0;
  let queuedBytes = 0;
  let activeOperation: QueuedFileWriterDiagnostics["activeOperation"] = "idle";
  let activeWriteBytes: number | undefined;

  const writer: QueuedFileWriter = {
    filePath,
    write: (line: string) => {
      const lineBytes = Buffer.byteLength(line, "utf8");
      if (
        options.maxQueuedBytes !== undefined &&
        queuedBytes + lineBytes > options.maxQueuedBytes
      ) {
        // Backpressure is lossy by design for diagnostics/log queues; callers can inspect "dropped".
        return "dropped";
      }
      pendingWrites += 1;
      queuedBytes += lineBytes;
      queue = queue
        .then(async () => {
          activeOperation = "mkdir";
          await ready;
        })
        .then(async () => {
          if (options.yieldBeforeWrite) {
            activeOperation = "yield";
            await waitForImmediate();
          }
        })
        .then(async () => {
          activeOperation = "file-append";
          activeWriteBytes = lineBytes;
          await safeAppendFile(filePath, line, options);
        })
        .catch(() => undefined)
        .finally(() => {
          pendingWrites = Math.max(0, pendingWrites - 1);
          queuedBytes = Math.max(0, queuedBytes - lineBytes);
          activeWriteBytes = undefined;
          // Preserve the current operation while more writes are chained behind this one.
          activeOperation = pendingWrites > 0 ? activeOperation : "idle";
        });
      return "queued";
    },
    flush: async () => {
      await queue;
    },
    describeQueue: () => ({
      pendingWrites,
      queuedBytes,
      activeOperation,
      activeWriteBytes,
      maxFileBytes: options.maxFileBytes,
      maxQueuedBytes: options.maxQueuedBytes,
      yieldBeforeWrite: options.yieldBeforeWrite === true,
    }),
  };

  writers.set(filePath, writer);
  return writer;
}
