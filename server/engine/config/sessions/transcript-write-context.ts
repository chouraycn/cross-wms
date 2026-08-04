// Transcript write contexts let nested append paths reuse an already-owned session write lock.
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

type OwnedSessionTranscriptWriteContext = {
  sessionFile?: string;
  sessionKey?: string;
  canAdvanceSessionEntryCache?: (snapshot: OwnedSessionTranscriptCacheSnapshot) => boolean;
  publishSessionFileSnapshot?: (snapshot: OwnedSessionTranscriptCacheSnapshot) => boolean;
  withSessionWriteLock: <T>(
    run: () => Promise<T> | T,
    options?: OwnedSessionTranscriptWriteOptions<T>,
  ) => Promise<T>;
};

export type OwnedSessionTranscriptWriteOptions<T> = {
  publishOwnedWrite?: boolean;
  resolvePublishedEntries?: (result: T) => readonly OwnedSessionTranscriptPublishedEntry[];
  resolvePublishedEntriesAfterFailure?: () => readonly OwnedSessionTranscriptPublishedEntry[];
};

export type OwnedSessionTranscriptPublishedEntry =
  | { kind: "id"; id: string }
  | { kind: "header"; serialized: string }
  | { kind: "serialized"; serialized: string };

export type OwnedSessionTranscriptCacheSnapshot = {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
};

const ownedTranscriptWriteContext = new AsyncLocalStorage<OwnedSessionTranscriptWriteContext>();

// Compare resolved paths when available; fall back to session keys for lock reuse.
function normalizePathForCompare(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : undefined;
}

function contextMatches(params: {
  context: OwnedSessionTranscriptWriteContext;
  sessionFile?: string;
  sessionKey?: string;
}): boolean {
  const contextSessionFile = normalizePathForCompare(params.context.sessionFile);
  const sessionFile = normalizePathForCompare(params.sessionFile);
  if (contextSessionFile && sessionFile) {
    return contextSessionFile === sessionFile;
  }

  const contextSessionKey = params.context.sessionKey?.trim();
  const sessionKey = params.sessionKey?.trim();
  return Boolean(contextSessionKey && sessionKey && contextSessionKey === sessionKey);
}

/** Runs transcript writes with an owned write-lock context. */
export async function withOwnedSessionTranscriptWrites<T>(
  context: OwnedSessionTranscriptWriteContext,
  run: () => Promise<T>,
): Promise<T> {
  return await ownedTranscriptWriteContext.run(context, run);
}

export function bindOwnedSessionTranscriptWrites<TArgs extends unknown[], TResult>(
  context: OwnedSessionTranscriptWriteContext,
  run: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  // Bind callbacks that will run later but must still see the parent write-lock context.
  return (...args) => ownedTranscriptWriteContext.run(context, () => run(...args));
}

export async function runWithOwnedSessionTranscriptWriteLock<T>(
  params: {
    sessionFile?: string;
    sessionKey?: string;
  },
  run: () => Promise<T> | T,
): Promise<T> {
  return await runWithOwnedSessionTranscriptWriteContext(params, run);
}

export async function runWithOwnedSessionTranscriptWritePublication<T>(
  params: {
    sessionFile?: string;
    sessionKey?: string;
  },
  run: () => Promise<T> | T,
): Promise<T> {
  return await runWithOwnedSessionTranscriptWriteContext(params, run, {
    publishOwnedWrite: true,
  });
}

export function resolveOwnedSessionTranscriptWriteLockRunner(params: {
  sessionFile?: string;
  sessionKey?: string;
}): OwnedSessionTranscriptWriteContext["withSessionWriteLock"] | undefined {
  const context = ownedTranscriptWriteContext.getStore();
  if (!context || !contextMatches({ context, ...params })) {
    return undefined;
  }
  return context.withSessionWriteLock;
}

export function canAdvanceOwnedSessionEntryCache(params: {
  sessionFile?: string;
  sessionKey?: string;
  snapshot: OwnedSessionTranscriptCacheSnapshot;
}): boolean {
  const context = ownedTranscriptWriteContext.getStore();
  return Boolean(
    context &&
    contextMatches({ context, ...params }) &&
    context.publishSessionFileSnapshot &&
    context.canAdvanceSessionEntryCache?.(params.snapshot),
  );
}

export function publishOwnedSessionFileSnapshot(params: {
  sessionFile?: string;
  sessionKey?: string;
  snapshot: OwnedSessionTranscriptCacheSnapshot;
}): boolean | undefined {
  const context = ownedTranscriptWriteContext.getStore();
  if (!context || !contextMatches({ context, ...params }) || !context.publishSessionFileSnapshot) {
    return undefined;
  }
  return context.publishSessionFileSnapshot(params.snapshot);
}

async function runWithOwnedSessionTranscriptWriteContext<T>(
  params: {
    sessionFile?: string;
    sessionKey?: string;
  },
  run: () => Promise<T> | T,
  options?: OwnedSessionTranscriptWriteOptions<T>,
): Promise<T> {
  const context = ownedTranscriptWriteContext.getStore();
  if (!context || !contextMatches({ context, ...params })) {
    // No matching owner means the caller is responsible for acquiring its normal lock.
    return await run();
  }
  return await context.withSessionWriteLock(run, options);
}

// ============================================================================
// WMS 兼容：TranscriptStream 旧实现依赖的写入上下文辅助函数
// （createWriteContext / shouldFlush / addToBuffer / clearBuffer / closeContext /
//  formatMessageLine 及 TranscriptWriteContext / TranscriptWriteOptions 类型）。
// 这些不是 openclaw 上游 API，仅为 server/engine/config/sessions/transcript-stream.ts
// 提供。当前为最小可运行 stub。
// ============================================================================

export type TranscriptWriteOptions = {
  mode?: "overwrite" | "append";
  format?: "jsonl" | "text";
  flushIntervalMs?: number;
  header?: Record<string, unknown>;
  flushThresholdBytes?: number;
  flushThresholdLines?: number;
};

export type TranscriptWriteContext = {
  sessionId: string;
  filePath: string;
  mode: "overwrite" | "append";
  format: "jsonl" | "text";
  header: Record<string, unknown> | undefined;
  isOpen: boolean;
  bytesWritten: number;
  bufferSize: number;
  messageCount: number;
  startedAt: number;
  flushIntervalMs: number;
  flushThresholdBytes: number;
  flushThresholdLines: number;
  error: Error | undefined;
  /** 内部缓冲区（不导出给消费者，但 addToBuffer/clearBuffer 会读写）。 */
  _buffer: string[];
};

export function createWriteContext(
  sessionId: string,
  filePath: string,
  options: TranscriptWriteOptions = {},
): TranscriptWriteContext {
  return {
    sessionId,
    filePath,
    mode: options.mode ?? "append",
    format: options.format ?? "jsonl",
    header: options.header,
    isOpen: false,
    bytesWritten: 0,
    bufferSize: 0,
    messageCount: 0,
    startedAt: Date.now(),
    flushIntervalMs: options.flushIntervalMs ?? 1000,
    flushThresholdBytes: options.flushThresholdBytes ?? 64 * 1024,
    flushThresholdLines: options.flushThresholdLines ?? 100,
    error: undefined,
    _buffer: [],
  };
}

export function shouldFlush(ctx: TranscriptWriteContext): boolean {
  if (ctx.bufferSize >= ctx.flushThresholdBytes) return true;
  if (ctx._buffer.length >= ctx.flushThresholdLines) return true;
  return false;
}

export function addToBuffer(ctx: TranscriptWriteContext, line: string): void {
  ctx._buffer.push(line);
  ctx.bufferSize += line.length + 1;
  ctx.messageCount += 1;
}

export function clearBuffer(ctx: TranscriptWriteContext): string[] {
  const lines = ctx._buffer.splice(0);
  ctx.bufferSize = 0;
  return lines;
}

export function closeContext(ctx: TranscriptWriteContext): void {
  ctx.isOpen = false;
}

export function formatMessageLine(
  message: unknown,
  format: "jsonl" | "text",
): string {
  if (format === "jsonl") {
    return JSON.stringify(message);
  }
  if (message && typeof message === "object" && "content" in message) {
    return String((message as { content: unknown }).content);
  }
  return String(message);
}
