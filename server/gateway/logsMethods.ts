/**
 * Logs Gateway Methods — 日志 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/logs.ts
 * - 精简版：logs.tail 返回有界的日志尾部快照
 * - 内存环形缓冲收集最近日志条目（供 tail 读取）
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 日志环形缓冲（模块级，跨请求共享）
interface LogEntry {
  ts: number;
  level: string;
  msg: string;
}

const MAX_LOG_ENTRIES = 500;
const logBuffer: LogEntry[] = [];

/** 内部接口：供 logger 适配层推送日志条目（避免循环依赖） */
export function pushLogEntry(level: string, msg: string): void {
  logBuffer.push({ ts: Date.now(), level, msg });
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
  }
}

// ========== Logs Tail ==========

async function logsTail(params: unknown, _ctx: GatewayMethodContext) {
  const p = (params || {}) as { cursor?: number; limit?: number; maxBytes?: number };

  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit) && p.limit > 0
    ? Math.min(Math.floor(p.limit), 200)
    : 100;
  const maxBytes = typeof p.maxBytes === 'number' && Number.isFinite(p.maxBytes) && p.maxBytes > 0
    ? Math.floor(p.maxBytes)
    : 64 * 1024;

  // 从 cursor（时间戳）之后的日志开始读取
  const cursor = typeof p.cursor === 'number' && Number.isFinite(p.cursor) ? p.cursor : 0;
  const filtered = cursor > 0
    ? logBuffer.filter((e) => e.ts > cursor)
    : logBuffer;

  const tail = filtered.slice(-limit);

  // 按 maxBytes 裁剪
  let totalBytes = 0;
  const trimmed: LogEntry[] = [];
  for (const entry of tail) {
    const entryBytes = Buffer.byteLength(entry.msg, 'utf8');
    if (totalBytes + entryBytes > maxBytes) break;
    trimmed.push(entry);
    totalBytes += entryBytes;
  }

  const nextCursor = trimmed.length > 0 ? trimmed[trimmed.length - 1].ts : cursor;
  const hasMore = filtered.length > trimmed.length;

  return {
    ok: true,
    entries: trimmed,
    cursor: nextCursor,
    hasMore,
    count: trimmed.length,
  };
}

/**
 * 注册所有日志方法
 */
export function registerLogsMethods(registry: GatewayMethodRegistry): void {
  registry.register('logs.tail', logsTail);
}
