/**
 * Agent 事件系统 — 基于 OpenClaw 架构设计
 *
 * 核心概念：
 * - Event Stream: 事件流类型（lifecycle, assistant, tool, thinking, item 等）
 * - Run: 一次 Agent 运行的上下文（runId + sessionKey + metadata）
 * - Event Payload: 带有序列号、时间戳、运行上下文的事件载荷
 *
 * 关键设计（解决第二次思考卡住问题）：
 * 1. 思考流与正文流完全独立，有各自的事件通道
 * 2. 块缓冲策略（block-streaming）：按字符数和空闲时间合并事件
 * 3. 每个流有独立的序列号，避免顺序混乱
 * 4. 支持心跳过滤（heartbeat-filter）：空心跳不触发渲染
 *
 * 与旧版 SSE 的区别：
 * - 事件按 run 组织，每个 run 有独立的序列号
 * - 事件系统与传输层（SSE/WS）解耦
 * - 支持多订阅者模式（Gateway、持久化、日志等）
 * - 丰富的事件类型（item/approval/command_output/patch 等）
 */
import { randomUUID } from 'crypto';
import EventEmitter from 'events';
import { logger } from '../logger.js';

// ===================== 事件流类型 =====================

export type AgentEventStream =
  | 'lifecycle'
  | 'assistant'
  | 'tool'
  | 'thinking'
  | 'item'
  | 'error'
  | 'approval'
  | 'command_output'
  | 'patch'
  | 'compaction'
  | 'plan'
  | 'heartbeat'
  | (string & Record<string, never>);

// ===================== Item 事件类型 =====================

export type AgentItemEventPhase = 'start' | 'update' | 'end';
export type AgentItemEventStatus = 'running' | 'completed' | 'failed' | 'blocked';
export type AgentItemEventKind =
  | 'tool'
  | 'command'
  | 'patch'
  | 'search'
  | 'analysis'
  | 'plan'
  | (string & Record<string, never>);

export interface AgentItemEventData {
  itemId: string;
  phase: AgentItemEventPhase;
  kind: AgentItemEventKind;
  title: string;
  status: AgentItemEventStatus;
  name?: string;
  meta?: string;
  toolCallId?: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  error?: string;
  summary?: string;
  progressText?: string;
  progressPercent?: number;
}

// ===================== Approval 事件类型 =====================

export type AgentApprovalEventPhase = 'requested' | 'resolved';
export type AgentApprovalEventStatus = 'pending' | 'approved' | 'denied' | 'failed' | 'unavailable';
export type AgentApprovalEventKind = 'exec' | 'plugin' | 'tool' | 'unknown';

export interface AgentApprovalEventData {
  phase: AgentApprovalEventPhase;
  kind: AgentApprovalEventKind;
  status: AgentApprovalEventStatus;
  title: string;
  itemId?: string;
  toolCallId?: string;
  approvalId?: string;
  command?: string;
  reason?: string;
  scope?: 'turn' | 'session';
  message?: string;
}

// ===================== Command Output 事件类型 =====================

export interface AgentCommandOutputEventData {
  itemId: string;
  phase: 'delta' | 'end';
  title: string;
  toolCallId: string;
  name?: string;
  output?: string;
  status?: AgentItemEventStatus | 'running';
  exitCode?: number | null;
  durationMs?: number;
  cwd?: string;
}

// ===================== Patch 事件类型 =====================

export interface AgentPatchSummaryEventData {
  itemId: string;
  phase: 'end';
  title: string;
  toolCallId: string;
  name?: string;
  added: string[];
  modified: string[];
  deleted: string[];
  summary: string;
}

// ===================== 核心事件载荷 =====================

export interface AgentEventPayload {
  runId: string;
  seq: number;
  stream: AgentEventStream;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
}

// ===================== Run 上下文 =====================

export interface AgentRunContext {
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
  model?: string;
  verboseLevel?: 'minimal' | 'normal' | 'detailed';
  registeredAt?: number;
  lastActiveAt?: number;
  metadata?: Record<string, unknown>;
}

// ===================== 块缓冲配置 =====================

export interface BlockStreamingConfig {
  minChars: number;
  maxChars: number;
  idleMs: number;
  joiner: string;
}

const DEFAULT_BLOCK_STREAMING: BlockStreamingConfig = {
  minChars: 200,
  maxChars: 800,
  idleMs: 150,
  joiner: '',
};

const DEFAULT_THINKING_BLOCK_STREAMING: BlockStreamingConfig = {
  minChars: 150,
  maxChars: 600,
  idleMs: 100,
  joiner: '',
};

// ===================== 内部状态 =====================

interface AgentEventState {
  seqByRun: Map<string, number>;
  seqByRunAndStream: Map<string, Map<string, number>>;
  runContextById: Map<string, AgentRunContext>;
  emitter: EventEmitter;
  lifecycleGeneration: string;
  blockBuffers: Map<string, BlockStreamBuffer>;
  thinkingBuffers: Map<string, BlockStreamBuffer>;
}

interface BlockStreamBuffer {
  runId: string;
  stream: AgentEventStream;
  sessionKey?: string;
  content: string;
  lastEnqueueAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  flushed: boolean;
}

const AGENT_EVENT_STATE: AgentEventState = {
  seqByRun: new Map(),
  seqByRunAndStream: new Map(),
  runContextById: new Map(),
  emitter: new EventEmitter(),
  lifecycleGeneration: randomUUID(),
  blockBuffers: new Map(),
  thinkingBuffers: new Map(),
};

AGENT_EVENT_STATE.emitter.setMaxListeners(200);

// ===================== Lifecycle Generation =====================

export function getAgentEventLifecycleGeneration(): string {
  return AGENT_EVENT_STATE.lifecycleGeneration;
}

export function rotateAgentEventLifecycleGeneration(): string {
  AGENT_EVENT_STATE.lifecycleGeneration = randomUUID();
  return AGENT_EVENT_STATE.lifecycleGeneration;
}

// ===================== Run Context 管理 =====================

export function registerAgentRunContext(runId: string, context: AgentRunContext): void {
  if (!runId) return;

  const existing = AGENT_EVENT_STATE.runContextById.get(runId);
  if (!existing) {
    AGENT_EVENT_STATE.runContextById.set(runId, {
      ...context,
      registeredAt: context.registeredAt ?? Date.now(),
    });
    return;
  }

  Object.assign(existing, context);
}

export function getAgentRunContext(runId: string): AgentRunContext | undefined {
  return AGENT_EVENT_STATE.runContextById.get(runId);
}

export function clearAgentRunContext(runId: string): void {
  AGENT_EVENT_STATE.runContextById.delete(runId);
  AGENT_EVENT_STATE.seqByRun.delete(runId);
  AGENT_EVENT_STATE.seqByRunAndStream.delete(runId);
  clearBlockBuffer(runId, 'assistant');
  clearBlockBuffer(runId, 'thinking');
}

export function listAgentRunsForSession(sessionKey: string): Array<{ runId: string }> {
  const runs: Array<{ runId: string }> = [];
  for (const [runId, context] of AGENT_EVENT_STATE.runContextById.entries()) {
    if (context.sessionKey === sessionKey) {
      runs.push({ runId });
    }
  }
  return runs;
}

export function sweepStaleRunContexts(maxAgeMs = 30 * 60 * 1000): number {
  const now = Date.now();
  let swept = 0;
  for (const [runId, ctx] of AGENT_EVENT_STATE.runContextById.entries()) {
    const lastSeen = ctx.lastActiveAt ?? ctx.registeredAt;
    const age = lastSeen ? now - lastSeen : Infinity;
    if (age > maxAgeMs) {
      AGENT_EVENT_STATE.runContextById.delete(runId);
      AGENT_EVENT_STATE.seqByRun.delete(runId);
      AGENT_EVENT_STATE.seqByRunAndStream.delete(runId);
      clearBlockBuffer(runId, 'assistant');
      clearBlockBuffer(runId, 'thinking');
      swept++;
    }
  }
  if (swept > 0) {
    logger.debug(`[AgentEvents] 清理了 ${swept} 个过期 run 上下文`);
  }
  return swept;
}

// ===================== 序列号管理 =====================

export function nextSeqForRun(runId: string): number {
  const current = AGENT_EVENT_STATE.seqByRun.get(runId) ?? 0;
  const next = current + 1;
  AGENT_EVENT_STATE.seqByRun.set(runId, next);
  return next;
}

export function nextSeqForRunAndStream(runId: string, stream: string): number {
  let streamMap = AGENT_EVENT_STATE.seqByRunAndStream.get(runId);
  if (!streamMap) {
    streamMap = new Map();
    AGENT_EVENT_STATE.seqByRunAndStream.set(runId, streamMap);
  }
  const current = streamMap.get(stream) ?? 0;
  const next = current + 1;
  streamMap.set(stream, next);
  return next;
}

// ===================== 块缓冲机制 =====================

function getBufferKey(runId: string, stream: string): string {
  return `${runId}:${stream}`;
}

function getBufferMap(stream: AgentEventStream): Map<string, BlockStreamBuffer> {
  return stream === 'thinking' ? AGENT_EVENT_STATE.thinkingBuffers : AGENT_EVENT_STATE.blockBuffers;
}

function getConfigForStream(stream: AgentEventStream): BlockStreamingConfig {
  return stream === 'thinking' ? DEFAULT_THINKING_BLOCK_STREAMING : DEFAULT_BLOCK_STREAMING;
}

function clearBlockBuffer(runId: string, stream: AgentEventStream): void {
  const bufferMap = getBufferMap(stream);
  const key = getBufferKey(runId, stream);
  const buffer = bufferMap.get(key);
  if (buffer?.timer) {
    clearTimeout(buffer.timer);
  }
  bufferMap.delete(key);
}

function flushBlockBuffer(runId: string, stream: AgentEventStream): void {
  const bufferMap = getBufferMap(stream);
  const key = getBufferKey(runId, stream);
  const buffer = bufferMap.get(key);

  if (!buffer || !buffer.content) {
    return;
  }

  if (buffer.timer) {
    clearTimeout(buffer.timer);
    buffer.timer = null;
  }

  const content = buffer.content;
  buffer.content = '';
  buffer.flushed = true;

  const context = getAgentRunContext(runId);
  const seq = nextSeqForRunAndStream(runId, stream);
  const streamSeq = nextSeqForRun(runId);

  const payload: AgentEventPayload = {
    runId,
    seq: streamSeq,
    stream,
    ts: Date.now(),
    data: {
      content,
      delta: true,
      streamSeq: seq,
      block: true,
    },
    sessionKey: buffer.sessionKey ?? context?.sessionKey,
    sessionId: context?.sessionId,
    agentId: context?.agentId,
  };

  try {
    AGENT_EVENT_STATE.emitter.emit('agent:event', payload);
    AGENT_EVENT_STATE.emitter.emit(`agent:${stream}`, payload);
    AGENT_EVENT_STATE.emitter.emit(`agent:run:${runId}`, payload);
  } catch (err) {
    logger.error(`[AgentEvents] 发布块缓冲事件失败 (stream=${stream}):`, err);
  }
}

function scheduleIdleFlush(buffer: BlockStreamBuffer, stream: AgentEventStream): void {
  const config = getConfigForStream(stream);
  if (buffer.timer) {
    clearTimeout(buffer.timer);
  }
  buffer.timer = setTimeout(() => {
    flushBlockBuffer(buffer.runId, stream);
  }, config.idleMs);
  buffer.timer.unref?.();
}

/**
 * 使用块缓冲策略发布文本事件
 *
 * 这是解决第二次思考卡住问题的核心机制：
 * 1. 将小的文本块累积到一定大小再发布，减少渲染次数
 * 2. 有空闲时间阈值，避免长时间不更新
 * 3. 思考流和正文流有独立的缓冲区，互不影响
 */
export function emitBlockedTextEvent(params: {
  runId: string;
  stream: AgentEventStream;
  content: string;
  sessionKey?: string;
  config?: Partial<BlockStreamingConfig>;
}): void {
  const { runId, stream, content, sessionKey } = params;

  if (!content) {
    return;
  }

  const bufferMap = getBufferMap(stream);
  const key = getBufferKey(runId, stream);
  let buffer = bufferMap.get(key);

  if (!buffer) {
    buffer = {
      runId,
      stream,
      sessionKey,
      content: '',
      lastEnqueueAt: Date.now(),
      timer: null,
      flushed: false,
    };
    bufferMap.set(key, buffer);
  }

  buffer.content += content;
  buffer.lastEnqueueAt = Date.now();

  const config = { ...getConfigForStream(stream), ...params.config };

  if (buffer.content.length >= config.maxChars) {
    flushBlockBuffer(runId, stream);
  } else if (buffer.content.length >= config.minChars) {
    scheduleIdleFlush(buffer, stream);
  } else {
    scheduleIdleFlush(buffer, stream);
  }
}

/**
 * 强制刷新所有块缓冲区
 */
export function flushAllBlockBuffers(runId: string): void {
  flushBlockBuffer(runId, 'assistant');
  flushBlockBuffer(runId, 'thinking');
}

// ===================== 事件发布 =====================

export function emitAgentEvent(event: Omit<AgentEventPayload, 'seq' | 'ts'>): void {
  const { runId, stream, data } = event;

  const context = AGENT_EVENT_STATE.runContextById.get(runId);

  const nextSeq = nextSeqForRun(runId);
  const streamSeq = nextSeqForRunAndStream(runId, stream);

  if (context) {
    context.lastActiveAt = Date.now();
  }

  const enriched: AgentEventPayload = {
    ...event,
    seq: nextSeq,
    ts: Date.now(),
    data: {
      ...data,
      streamSeq,
    },
    sessionKey: event.sessionKey ?? context?.sessionKey,
    sessionId: event.sessionId ?? context?.sessionId,
    agentId: event.agentId ?? context?.agentId,
  };

  try {
    AGENT_EVENT_STATE.emitter.emit('agent:event', enriched);
    AGENT_EVENT_STATE.emitter.emit(`agent:${stream}`, enriched);
    AGENT_EVENT_STATE.emitter.emit(`agent:run:${runId}`, enriched);
  } catch (err) {
    logger.error(`[AgentEvents] 发布事件失败 (stream=${stream}):`, err);
  }
}

// ===================== 便捷事件发布函数 =====================

/**
 * Turn 级生命周期事件 — 对齐 OpenClaw agent-core 的 turn_start/turn_end
 *
 * 与 run 级 lifecycle 事件（start/end/error）互补：
 *   - run 级：一次完整 Agent 运行（可能包含多个 turn）
 *   - turn 级：一次对话轮次（用户输入 → Agent 响应 → 工具调用 → 结束）
 *
 * turn 事件用于：
 *   - 前端 UI 区分"思考中"和"等待输入"状态
 *   - compaction 在 turn_end 时触发
 *   - 插件 hook 订阅 turn 边界
 */
export function emitAgentTurnEvent(params: {
  runId: string;
  phase: 'turn_start' | 'turn_end';
  turnIndex: number;
  data?: Record<string, unknown>;
  sessionKey?: string;
}): void {
  emitAgentEvent({
    runId: params.runId,
    stream: 'lifecycle',
    data: {
      phase: params.phase,
      turnIndex: params.turnIndex,
      ...params.data,
    },
    sessionKey: params.sessionKey,
  });

  // turn_end 时刷新所有块缓冲
  if (params.phase === 'turn_end') {
    flushAllBlockBuffers(params.runId);
  }
}

export function emitAgentLifecycleEvent(params: {
  runId: string;
  phase: 'start' | 'end' | 'error';
  data: Record<string, unknown>;
  sessionKey?: string;
}): void {
  emitAgentEvent({
    runId: params.runId,
    stream: 'lifecycle',
    data: {
      phase: params.phase,
      ...params.data,
    },
    sessionKey: params.sessionKey,
  });

  if (params.phase === 'end' || params.phase === 'error') {
    flushAllBlockBuffers(params.runId);
    clearBlockBuffer(params.runId, 'assistant');
    clearBlockBuffer(params.runId, 'thinking');
  }
}

export function emitAgentItemEvent(params: {
  runId: string;
  data: AgentItemEventData;
  sessionKey?: string;
}): void {
  emitAgentEvent({
    runId: params.runId,
    stream: 'item',
    data: params.data as unknown as Record<string, unknown>,
    sessionKey: params.sessionKey,
  });
}

export function emitAgentApprovalEvent(params: {
  runId: string;
  data: AgentApprovalEventData;
  sessionKey?: string;
}): void {
  emitAgentEvent({
    runId: params.runId,
    stream: 'approval',
    data: params.data as unknown as Record<string, unknown>,
    sessionKey: params.sessionKey,
  });
}

export function emitAgentCommandOutputEvent(params: {
  runId: string;
  data: AgentCommandOutputEventData;
  sessionKey?: string;
}): void {
  emitAgentEvent({
    runId: params.runId,
    stream: 'command_output',
    data: params.data as unknown as Record<string, unknown>,
    sessionKey: params.sessionKey,
  });
}

export function emitAgentPatchSummaryEvent(params: {
  runId: string;
  data: AgentPatchSummaryEventData;
  sessionKey?: string;
}): void {
  emitAgentEvent({
    runId: params.runId,
    stream: 'patch',
    data: params.data as unknown as Record<string, unknown>,
    sessionKey: params.sessionKey,
  });
}

export function emitAgentTextEvent(params: {
  runId: string;
  content: string;
  delta?: boolean;
  sessionKey?: string;
  useBlocking?: boolean;
}): void {
  const { runId, content, delta = true, sessionKey, useBlocking = true } = params;

  if (useBlocking && delta) {
    emitBlockedTextEvent({
      runId,
      stream: 'assistant',
      content,
      sessionKey,
    });
    return;
  }

  emitAgentEvent({
    runId,
    stream: 'assistant',
    data: {
      type: 'text',
      content,
      delta,
    },
    sessionKey,
  });
}

export function emitAgentThinkingEvent(params: {
  runId: string;
  content: string;
  delta?: boolean;
  sessionKey?: string;
  useBlocking?: boolean;
}): void {
  const { runId, content, delta = true, sessionKey, useBlocking = true } = params;

  if (useBlocking && delta) {
    emitBlockedTextEvent({
      runId,
      stream: 'thinking',
      content,
      sessionKey,
    });
    return;
  }

  emitAgentEvent({
    runId,
    stream: 'thinking',
    data: {
      content,
      delta,
    },
    sessionKey,
  });
}

export function emitAgentToolCallEvent(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  sessionKey?: string;
}): void {
  flushAllBlockBuffers(params.runId);

  emitAgentEvent({
    runId: params.runId,
    stream: 'tool',
    data: {
      type: 'call',
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      toolArgs: params.toolArgs ?? {},
    },
    sessionKey: params.sessionKey,
  });
}

export function emitAgentToolResultEvent(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  result?: unknown;
  error?: string;
  sessionKey?: string;
}): void {
  emitAgentEvent({
    runId: params.runId,
    stream: 'tool',
    data: {
      type: 'result',
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      result: params.result,
      error: params.error,
    },
    sessionKey: params.sessionKey,
  });
}

export function emitAgentErrorEvent(params: {
  runId: string;
  error: string;
  code?: string;
  sessionKey?: string;
}): void {
  flushAllBlockBuffers(params.runId);

  emitAgentEvent({
    runId: params.runId,
    stream: 'error',
    data: {
      message: params.error,
      code: params.code,
    },
    sessionKey: params.sessionKey,
  });
}

export function emitAgentHeartbeatEvent(params: {
  runId: string;
  status?: string;
  sessionKey?: string;
}): void {
  emitAgentEvent({
    runId: params.runId,
    stream: 'heartbeat',
    data: {
      status: params.status ?? 'alive',
    },
    sessionKey: params.sessionKey,
  });
}

// ===================== 事件订阅 =====================

export function onAgentEvent(
  listener: (evt: AgentEventPayload) => void,
): () => void {
  AGENT_EVENT_STATE.emitter.on('agent:event', listener);
  return () => {
    AGENT_EVENT_STATE.emitter.off('agent:event', listener);
  };
}

export function onAgentEventStream(
  stream: AgentEventStream,
  listener: (evt: AgentEventPayload) => void,
): () => void {
  const eventName = `agent:${stream}`;
  AGENT_EVENT_STATE.emitter.on(eventName, listener);
  return () => {
    AGENT_EVENT_STATE.emitter.off(eventName, listener);
  };
}

export function onAgentRunEvent(
  runId: string,
  listener: (evt: AgentEventPayload) => void,
): () => void {
  const eventName = `agent:run:${runId}`;
  AGENT_EVENT_STATE.emitter.on(eventName, listener);
  return () => {
    AGENT_EVENT_STATE.emitter.off(eventName, listener);
  };
}

export function onAgentEventForSession(
  sessionKey: string,
  listener: (evt: AgentEventPayload) => void,
): () => void {
  const filteredListener = (evt: AgentEventPayload) => {
    if (evt.sessionKey === sessionKey) {
      listener(evt);
    }
  };
  AGENT_EVENT_STATE.emitter.on('agent:event', filteredListener);
  return () => {
    AGENT_EVENT_STATE.emitter.off('agent:event', filteredListener);
  };
}

// ===================== 测试辅助函数 =====================

export function resetAgentEventsForTest(): void {
  AGENT_EVENT_STATE.seqByRun.clear();
  AGENT_EVENT_STATE.seqByRunAndStream.clear();
  AGENT_EVENT_STATE.runContextById.clear();
  AGENT_EVENT_STATE.emitter.removeAllListeners();
  AGENT_EVENT_STATE.lifecycleGeneration = randomUUID();

  for (const buffer of AGENT_EVENT_STATE.blockBuffers.values()) {
    if (buffer.timer) clearTimeout(buffer.timer);
  }
  for (const buffer of AGENT_EVENT_STATE.thinkingBuffers.values()) {
    if (buffer.timer) clearTimeout(buffer.timer);
  }
  AGENT_EVENT_STATE.blockBuffers.clear();
  AGENT_EVENT_STATE.thinkingBuffers.clear();
}
