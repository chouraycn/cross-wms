/**
 * Sessions Domain Gateway Methods — 会话域 WS RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/sessions.ts 与 sessions-files.ts
 * - 精简版：复用 dao/chat.ts 的消息存储与 coreMethods 的会话注册
 * - 补齐 sessions.preview / describe / abort / patch / reset / compact /
 *   usage / usage.timeseries / usage.logs / files.list / files.get
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { getWebSocketHub } from './webSocketHub.js';
import {
  getSessionMessages,
  getSessions,
  deleteSession,
  addMessage,
} from '../dao/chat.js';
import type { Message } from '../db-chat.js';
import { logger } from '../logger.js';

type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 会话使用量时间序列与日志的内存缓冲（按 sessionKey 维护）
interface UsageBucket {
  ts: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  messageCount: number;
}

interface UsageLogEntry {
  ts: number;
  runId?: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ok: boolean;
  error?: string;
}

const usageTimeseries = new Map<string, UsageBucket[]>();
const usageLogs = new Map<string, UsageLogEntry[]>();
const MAX_TIMESERIES_POINTS = 288; // 24h @ 5min
const MAX_USAGE_LOGS = 200;

function pushTimeseries(sessionKey: string, bucket: UsageBucket): void {
  const series = usageTimeseries.get(sessionKey) ?? [];
  series.push(bucket);
  if (series.length > MAX_TIMESERIES_POINTS) series.splice(0, series.length - MAX_TIMESERIES_POINTS);
  usageTimeseries.set(sessionKey, series);
}

function pushUsageLog(sessionKey: string, entry: UsageLogEntry): void {
  const logs = usageLogs.get(sessionKey) ?? [];
  logs.push(entry);
  if (logs.length > MAX_USAGE_LOGS) logs.splice(0, logs.length - MAX_USAGE_LOGS);
  usageLogs.set(sessionKey, logs);
}

/** 估算单条消息的 token 数（粗略：4 字符 ≈ 1 token） */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function classifyMessageTokens(msg: Message): {
  promptTokens: number;
  completionTokens: number;
} {
  // user / system 消息计入 prompt，assistant 计入 completion
  const text = msg.content ?? '';
  const toolCallsLen = msg.toolCalls ? msg.toolCalls.length : 0;
  const thinkingLen = msg.thinking ? msg.thinking.length : 0;
  const tokens = estimateTokens(text) + estimateTokens(msg.thinking ?? '') + Math.ceil(toolCallsLen / 4);
  if (msg.role === 'assistant') {
    return { promptTokens: 0, completionTokens: tokens + Math.ceil(thinkingLen / 4) };
  }
  return { promptTokens: tokens, completionTokens: 0 };
}

function requireSessionKey(params: unknown): string | null {
  const raw = (params as { key?: string; sessionKey?: string })?.key
    ?? (params as { sessionKey?: string })?.sessionKey;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  return raw.trim();
}

// ========== sessions.preview ==========

async function sessionsPreview(params: unknown, _ctx: GatewayMethodContext) {
  const p = params as { keys?: string[]; key?: string; limit?: number; maxChars?: number };
  const keysRaw = Array.isArray(p.keys) ? p.keys : p.key ? [p.key] : [];
  const keys = keysRaw
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    .map((k) => k.trim())
    .slice(0, 64);
  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit) ? Math.max(1, Math.floor(p.limit)) : 12;
  const maxChars = typeof p.maxChars === 'number' && Number.isFinite(p.maxChars) ? Math.max(20, Math.floor(p.maxChars)) : 240;

  if (keys.length === 0) {
    return { ts: Date.now(), previews: [] };
  }

  const previews = keys.map((key) => {
    try {
      const messages = getSessionMessages(key);
      if (messages.length === 0) {
        return { key, status: 'empty', items: [] };
      }
      const recent = messages.slice(-limit);
      const items = recent.map((msg) => {
        const text = msg.content ?? '';
        const truncated = text.length > maxChars ? text.slice(0, maxChars) + '…' : text;
        return {
          role: msg.role,
          content: truncated,
          ts: msg.timestamp,
          ...(msg.model ? { model: msg.model } : {}),
        };
      });
      return { key, status: 'ok', items };
    } catch {
      return { key, status: 'error', items: [] };
    }
  });

  return { ts: Date.now(), previews };
}

// ========== sessions.describe ==========

async function sessionsDescribe(params: unknown, _ctx: GatewayMethodContext) {
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key is required' } };
  }

  // 优先从 coreMethods 的内存会话表取元数据
  const registry = getMethodRegistry();
  const getResult = await registry.invoke('sessions.get', { key }, {
    requestId: `describe_${Date.now()}`,
    timestamp: Date.now(),
  });

  const messages = getSessionMessages(key);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;

  // 合并 dao 会话元数据（标题等）
  const daoSessions = getSessions();
  const daoSession = daoSessions.find((s) => s.id === key);

  const sessionRow = {
    key,
    label: (getResult.ok && getResult.result && typeof getResult.result === 'object'
      ? (getResult.result as { label?: string }).label : undefined) ?? daoSession?.title ?? null,
    messageCount: messages.length,
    lastMessageAt: lastMessage?.timestamp ?? null,
    lastMessageRole: lastMessage?.role ?? null,
    model: daoSession?.model ?? null,
    title: daoSession?.title ?? null,
    createdAt: daoSession?.createdAt ?? null,
    updatedAt: daoSession?.updatedAt ?? null,
    status: daoSession?.status ?? null,
    agentId: daoSession?.agentId ?? null,
    tags: daoSession?.tags ?? null,
    meta: (getResult.ok && getResult.result && typeof getResult.result === 'object'
      ? (getResult.result as { meta?: Record<string, unknown> }).meta : undefined) ?? null,
  };

  return { session: sessionRow };
}

// ========== sessions.abort ==========

async function sessionsAbort(params: unknown, ctx: GatewayMethodContext) {
  const p = params as { key?: string; sessionKey?: string; runId?: string };
  const key = requireSessionKey(params);
  const runId = p.runId;

  if (!key && !runId) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key or runId is required' } };
  }

  const registry = getMethodRegistry();
  const abortResult = await registry.invoke(
    'chat.abort',
    { sessionKey: key ?? undefined, runId: runId ?? undefined },
    ctx,
  );

  const aborted = (abortResult.ok && abortResult.result
    ? (abortResult.result as { aborted?: number }).aborted ?? 0
    : 0);

  return {
    ok: true,
    abortedRunId: runId ?? null,
    status: aborted > 0 ? 'aborted' : 'no-active-run',
    aborted,
  };
}

// ========== sessions.patch ==========

async function sessionsPatch(params: unknown, ctx: GatewayMethodContext) {
  const p = params as {
    key?: string;
    sessionKey?: string;
    label?: string;
    title?: string;
    meta?: Record<string, unknown>;
    tags?: string | string[];
  };
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key is required' } };
  }

  // 更新 dao 会话标题/标签
  const tagsValue = Array.isArray(p.tags) ? JSON.stringify(p.tags) : (typeof p.tags === 'string' ? p.tags : undefined);
  const { updateSession } = await import('../dao/chat.js');
  updateSession(key, {
    ...(p.label ?? p.title ? { title: p.label ?? p.title } : {}),
    ...(tagsValue !== undefined ? { tags: tagsValue } : {}),
  });

  // 更新 coreMethods 内存会话元数据
  const registry = getMethodRegistry();
  const existingResult = await registry.invoke('sessions.get', { key }, {
    requestId: `patch_get_${Date.now()}`,
    timestamp: Date.now(),
  });

  const existing = (existingResult.ok ? existingResult.result : null) as
    | { label?: string; meta?: Record<string, unknown>; messageCount?: number; createdAt?: number }
    | null
    | undefined;

  if (existing) {
    const mergedMeta = { ...(existing.meta ?? {}), ...(p.meta ?? {}) };
    // sessions.create 会覆盖；此处用 delete + create 重建以更新内存条目
    await registry.invoke('sessions.delete', { key }, {
      requestId: `patch_del_${Date.now()}`,
      timestamp: Date.now(),
    });
    await registry.invoke('sessions.create', {
      key,
      label: p.label ?? p.title ?? existing.label,
      meta: mergedMeta,
    }, {
      requestId: `patch_create_${Date.now()}`,
      timestamp: Date.now(),
    });
  }

  // 广播会话更新事件
  getWebSocketHub().broadcastEvent('session.update', {
    sessionKey: key,
    changes: {
      ...(p.label ?? p.title ? { label: p.label ?? p.title } : {}),
      ...(p.meta ? { meta: p.meta } : {}),
      ...(tagsValue !== undefined ? { tags: tagsValue } : {}),
    },
    reason: 'patch',
  });

  return {
    ok: true,
    key,
    patched: true,
  };
}

// ========== sessions.reset ==========

async function sessionsReset(params: unknown, _ctx: GatewayMethodContext) {
  const p = params as { key?: string; sessionKey?: string; reason?: string };
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key is required' } };
  }

  // 删除 dao 会话文件（含消息历史）
  deleteSession(key);

  // 重置 coreMethods 内存会话
  const registry = getMethodRegistry();
  await registry.invoke('sessions.delete', { key }, {
    requestId: `reset_del_${Date.now()}`,
    timestamp: Date.now(),
  });
  await registry.invoke('sessions.create', { key, label: `reset_${key}` }, {
    requestId: `reset_create_${Date.now()}`,
    timestamp: Date.now(),
  });

  // 清空使用量缓冲
  usageTimeseries.delete(key);
  usageLogs.delete(key);

  getWebSocketHub().broadcastEvent('session.reset', {
    sessionKey: key,
    reason: p.reason ?? 'reset',
  });

  return {
    ok: true,
    key,
    reset: true,
  };
}

// ========== sessions.compact ==========

async function sessionsCompact(params: unknown, _ctx: GatewayMethodContext) {
  const p = params as { key?: string; sessionKey?: string; maxLines?: number };
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key is required' } };
  }

  const messages = getSessionMessages(key);
  if (messages.length === 0) {
    return { ok: true, key, compacted: false, reason: 'no messages' };
  }

  const maxLines = typeof p.maxLines === 'number' && Number.isFinite(p.maxLines)
    ? Math.max(1, Math.floor(p.maxLines))
    : Math.min(50, Math.max(10, Math.floor(messages.length / 2)));

  // 保留最近 maxLines 条消息，其余归档为摘要
  const keepCount = Math.min(maxLines, messages.length);
  const toCompact = messages.slice(0, messages.length - keepCount);
  const kept = messages.slice(messages.length - keepCount);

  // 生成压缩摘要消息
  let summaryContent = '';
  if (toCompact.length > 0) {
    const promptTokens = toCompact.reduce((sum, m) => sum + classifyMessageTokens(m).promptTokens, 0);
    const completionTokens = toCompact.reduce((sum, m) => sum + classifyMessageTokens(m).completionTokens, 0);
    summaryContent = `[compacted ${toCompact.length} messages: prompt≈${promptTokens} tokens, completion≈${completionTokens} tokens]`;
  }

  // 重建会话：删除旧会话，写入摘要 + 保留消息
  deleteSession(key);
  if (summaryContent) {
    addMessage({
      sessionId: key,
      role: 'assistant',
      content: summaryContent,
      model: 'compactor',
      toolCalls: undefined,
      thinking: '',
    } as Parameters<typeof addMessage>[0]);
  }
  for (const msg of kept) {
    addMessage({
      sessionId: key,
      role: msg.role,
      content: msg.content,
      model: msg.model ?? '',
      toolCalls: msg.toolCalls,
      thinking: msg.thinking,
    } as Parameters<typeof addMessage>[0]);
  }

  getWebSocketHub().broadcastEvent('session.compact', {
    sessionKey: key,
    compacted: true,
    beforeCount: messages.length,
    afterCount: kept.length + (summaryContent ? 1 : 0),
  });

  return {
    ok: true,
    key,
    compacted: true,
    beforeCount: messages.length,
    afterCount: kept.length + (summaryContent ? 1 : 0),
    archived: toCompact.length,
    kept: kept.length,
  };
}

// ========== sessions.usage ==========

async function sessionsUsage(params: unknown, _ctx: GatewayMethodContext) {
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key is required' } };
  }

  const messages = getSessionMessages(key);
  let promptTokens = 0;
  let completionTokens = 0;
  let userMessageCount = 0;
  let assistantMessageCount = 0;

  for (const msg of messages) {
    const cls = classifyMessageTokens(msg);
    promptTokens += cls.promptTokens;
    completionTokens += cls.completionTokens;
    if (msg.role === 'user') userMessageCount++;
    else if (msg.role === 'assistant') assistantMessageCount++;
  }

  const series = usageTimeseries.get(key) ?? [];
  const logs = usageLogs.get(key) ?? [];

  return {
    ok: true,
    sessionKey: key,
    messageCount: messages.length,
    userMessageCount,
    assistantMessageCount,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    timeseriesPoints: series.length,
    logEntries: logs.length,
    firstMessageAt: messages[0]?.timestamp ?? null,
    lastMessageAt: messages.length > 0 ? messages[messages.length - 1].timestamp : null,
  };
}

// ========== sessions.usage.timeseries ==========

async function sessionsUsageTimeseries(params: unknown, _ctx: GatewayMethodContext) {
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key is required' } };
  }

  const p = params as { limit?: number; since?: number };
  let series = usageTimeseries.get(key) ?? [];

  if (typeof p.since === 'number' && Number.isFinite(p.since)) {
    series = series.filter((b) => b.ts >= p.since!);
  }

  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit)
    ? Math.max(1, Math.floor(p.limit))
    : 288;
  const trimmed = series.slice(-limit);

  // 若无缓冲数据，基于当前消息生成单点快照
  if (trimmed.length === 0) {
    const messages = getSessionMessages(key);
    if (messages.length > 0) {
      let pt = 0;
      let ct = 0;
      for (const msg of messages) {
        const cls = classifyMessageTokens(msg);
        pt += cls.promptTokens;
        ct += cls.completionTokens;
      }
      return {
        ok: true,
        sessionKey: key,
        points: [{
          ts: Date.now(),
          promptTokens: pt,
          completionTokens: ct,
          totalTokens: pt + ct,
          messageCount: messages.length,
        }],
      };
    }
  }

  return {
    ok: true,
    sessionKey: key,
    points: trimmed,
  };
}

// ========== sessions.usage.logs ==========

async function sessionsUsageLogs(params: unknown, _ctx: GatewayMethodContext) {
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key is required' } };
  }

  const p = params as { limit?: number; since?: number };
  let logs = usageLogs.get(key) ?? [];

  if (typeof p.since === 'number' && Number.isFinite(p.since)) {
    logs = logs.filter((l) => l.ts >= p.since!);
  }

  const limit = typeof p.limit === 'number' && Number.isFinite(p.limit)
    ? Math.max(1, Math.floor(p.limit))
    : 50;

  return {
    ok: true,
    sessionKey: key,
    logs: logs.slice(-limit),
  };
}

// ========== sessions.files.list ==========

interface TouchedFile {
  path: string;
  kind: 'modified' | 'read';
}

/** 从消息内容中提取被引用的文件路径 */
function extractTouchedFiles(messages: Message[]): TouchedFile[] {
  const files = new Map<string, TouchedFile>();

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.toolCalls) continue;
    try {
      const calls = JSON.parse(msg.toolCalls);
      if (!Array.isArray(calls)) continue;
      for (const call of calls) {
        const name = (call?.function?.name ?? call?.name ?? '').toLowerCase();
        const args = call?.function?.arguments ?? call?.arguments ?? call?.input ?? call?.args ?? {};
        const parsedArgs = typeof args === 'string' ? safeParseJson(args) : args;
        if (!parsedArgs || typeof parsedArgs !== 'object') continue;

        const filePath = (parsedArgs as Record<string, unknown>).path
          ?? (parsedArgs as Record<string, unknown>).file_path
          ?? (parsedArgs as Record<string, unknown>).filePath
          ?? (parsedArgs as Record<string, unknown>).file;
        if (typeof filePath !== 'string' || !filePath.trim()) continue;

        const trimmed = filePath.trim();
        const existing = files.get(trimmed);
        if (name === 'read') {
          if (!existing) files.set(trimmed, { path: trimmed, kind: 'read' });
        } else if (name === 'write' || name === 'edit' || name === 'apply_patch') {
          files.set(trimmed, { path: trimmed, kind: 'modified' });
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return Array.from(files.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'modified' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function sessionsFilesList(params: unknown, _ctx: GatewayMethodContext) {
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionKey is required' } };
  }

  const messages = getSessionMessages(key);
  const files = extractTouchedFiles(messages);

  const entries = files.map((f) => ({
    path: f.path,
    name: f.path.split('/').pop() ?? f.path,
    kind: f.kind,
  }));

  return {
    sessionKey: key,
    files: entries,
    total: entries.length,
  };
}

// ========== sessions.files.get ==========

async function sessionsFilesGet(params: unknown, _ctx: GatewayMethodContext) {
  const p = params as { key?: string; sessionKey?: string; path?: string; filePath?: string; file?: string };
  const key = requireSessionKey(params);
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'sessionKey is required' } };
  }

  const filePath = p.path ?? p.filePath ?? p.file;
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'path is required' } };
  }

  const trimmedPath = filePath.trim();
  const messages = getSessionMessages(key);
  const files = extractTouchedFiles(messages);
  const match = files.find((f) => f.path === trimmedPath);

  if (!match) {
    return { ok: false, error: { code: 'NOT_FOUND', message: `session file not found: ${trimmedPath}` } };
  }

  // 尝试读取文件内容（限 256KB）
  const MAX_BYTES = 256 * 1024;
  let content: string | null = null;
  let size = 0;
  let updatedAtMs: number | null = null;
  let missing = true;

  try {
    const fs = await import('node:fs');
    const stat = fs.statSync(trimmedPath);
    if (stat.isFile() && stat.size <= MAX_BYTES) {
      content = fs.readFileSync(trimmedPath, 'utf8');
      size = stat.size;
      updatedAtMs = Math.floor(stat.mtimeMs);
      missing = false;
    } else if (stat.isFile()) {
      size = stat.size;
      updatedAtMs = Math.floor(stat.mtimeMs);
      missing = false;
      return {
        ok: false,
        error: {
          code: 'TOO_LARGE',
          message: 'session file is too large to preview',
          data: { maxPreviewBytes: MAX_BYTES, path: trimmedPath, size },
        },
      };
    }
  } catch {
    // 文件不可读（可能已被删除）
    missing = true;
  }

  return {
    sessionKey: key,
    file: {
      path: match.path,
      name: match.path.split('/').pop() ?? match.path,
      kind: match.kind,
      missing,
      ...(size > 0 ? { size } : {}),
      ...(updatedAtMs !== null ? { updatedAtMs } : {}),
      ...(content !== null ? { content } : {}),
    },
  };
}

/**
 * 注册所有 Sessions 域 WS 方法
 */
export function registerSessionsMethods(registry: GatewayMethodRegistry): void {
  registry.register('sessions.preview', sessionsPreview);
  registry.register('sessions.describe', sessionsDescribe);
  registry.register('sessions.abort', sessionsAbort);
  registry.register('sessions.patch', sessionsPatch);
  registry.register('sessions.reset', sessionsReset);
  registry.register('sessions.compact', sessionsCompact);
  registry.register('sessions.usage', sessionsUsage);
  registry.register('sessions.usage.timeseries', sessionsUsageTimeseries);
  registry.register('sessions.usage.logs', sessionsUsageLogs);
  registry.register('sessions.files.list', sessionsFilesList);
  registry.register('sessions.files.get', sessionsFilesGet);

  logger.info('[gateway] Sessions 域 WS 方法已注册 (preview/describe/abort/patch/reset/compact/usage/files)');
}

/**
 * 记录会话使用量（供 chatMethods 在消息发送后调用以填充时间序列与日志）。
 */
export function recordSessionUsage(params: {
  sessionKey: string;
  runId?: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  ok: boolean;
  error?: string;
}): void {
  const ts = Date.now();
  pushTimeseries(params.sessionKey, {
    ts,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens: params.promptTokens + params.completionTokens,
    messageCount: 1,
  });
  pushUsageLog(params.sessionKey, {
    ts,
    runId: params.runId,
    model: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens: params.promptTokens + params.completionTokens,
    ok: params.ok,
    error: params.error,
  });
}
