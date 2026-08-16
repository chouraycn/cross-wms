/**
 * eventQuery — 会话事件查询（P1a：turn/step 词表对齐的可检索视图）
 *
 * 把 ledger_events 的扁平事件流折叠为"回合 → step → 工具调用"的审计视图：
 *   - turn.started 开启回合（携带 model / mode / systemPromptVersion / toolSchemaCount）
 *   - tool.call.started/completed/failed 组成 step（按 callId 配对）
 *   - message.created(user/assistant) 挂到当前回合
 *   - turn.completed / turn.failed 结束回合
 *   - context.compacted / channel.delivered 挂到当前回合（可选）
 *
 * foldStepTimeline 为纯函数（测试友好）；getStepTimeline 读真实账本。
 */

import { getEventLedger } from './eventLedger.js';
import type { LedgerEvent } from './eventLedger.js';

// ===================== 视图类型 =====================

export interface ToolCallStep {
  /** 回合内 step 序号（1-based，按 tool.call.started 出现顺序） */
  stepIndex: number;
  toolName: string;
  callId?: string;
  args?: string;
  result?: string;
  error?: string;
  durationMs?: number;
  status: 'started' | 'success' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
}

export interface ChannelDeliveryInfo {
  deliveryId?: string;
  channel?: string;
  status?: string;
  externalId?: string;
  error?: string;
  timestamp: number;
}

export interface TurnTimeline {
  turnIndex: number;
  status: 'active' | 'completed' | 'failed';
  startedAt?: number;
  endedAt?: number;
  model?: string;
  executionMode?: string;
  systemPromptVersion?: string;
  toolSchemaCount?: number;
  userMessage?: string;
  assistantContent?: string;
  thinkingDuration?: number;
  usage?: { totalTokens?: number };
  steps: ToolCallStep[];
  /** 本回合内发生的渠道投递 */
  deliveries: ChannelDeliveryInfo[];
  /** 本回合内发生的上下文压缩（摘要 + 触发原因 + token 变化） */
  compactions: Array<{ summary?: string; reason?: string; tokensBefore?: number; tokensAfter?: number }>;
  runId?: string;
}

/** 供测试构造的账本事件最小形态 */
export interface LedgerEventLike {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  runId?: string | null;
}

// ===================== 折叠 =====================

/**
 * 将扁平事件流折叠为回合/step 视图（纯函数，不依赖 DB）。
 * 输入需按 seq 升序。
 */
export function foldStepTimeline(events: LedgerEventLike[]): TurnTimeline[] {
  const turns: TurnTimeline[] = [];
  let current: TurnTimeline | undefined;

  const ensureTurn = (): TurnTimeline | undefined => {
    if (!current) return undefined;
    return current;
  };

  for (const ev of events) {
    const p = ev.payload;
    switch (ev.type) {
      case 'turn.started': {
        current = {
          turnIndex: turns.length + 1,
          status: 'active',
          startedAt: ev.timestamp,
          model: p.model as string | undefined,
          executionMode: p.executionMode as string | undefined,
          systemPromptVersion: p.systemPromptVersion as string | undefined,
          toolSchemaCount: p.toolSchemaCount as number | undefined,
          steps: [],
          deliveries: [],
          compactions: [],
          runId: ev.runId ?? undefined,
        };
        turns.push(current);
        break;
      }
      case 'message.created': {
        const turn = ensureTurn();
        if (!turn) break;
        if (p.role === 'user') turn.userMessage = String(p.content ?? '');
        else if (p.role === 'assistant') turn.assistantContent = String(p.content ?? '');
        break;
      }
      case 'tool.call.started': {
        const turn = ensureTurn();
        if (!turn) break;
        const stepIndex = turn.steps.length + 1;
        turn.steps.push({
          stepIndex,
          toolName: String(p.toolName ?? ''),
          callId: p.toolCallId as string | undefined,
          args: p.toolArgs as string | undefined,
          status: 'started',
          startedAt: ev.timestamp,
        });
        break;
      }
      case 'tool.call.completed':
      case 'tool.call.failed': {
        const turn = ensureTurn();
        if (!turn) break;
        const callId = p.toolCallId as string | undefined;
        const step = [...turn.steps].reverse().find((s) => s.callId === callId && s.status === 'started');
        if (step) {
          step.status = ev.type === 'tool.call.completed' ? 'success' : 'failed';
          step.completedAt = ev.timestamp;
          step.durationMs = p.duration as number | undefined;
          if (ev.type === 'tool.call.completed') step.result = String(p.result ?? '');
          else step.error = String(p.error ?? '');
        } else {
          // 孤儿完成事件（started 未记录或跨轮）：追加为独立 step
          turn.steps.push({
            stepIndex: turn.steps.length + 1,
            toolName: String(p.toolName ?? ''),
            callId,
            status: ev.type === 'tool.call.completed' ? 'success' : 'failed',
            completedAt: ev.timestamp,
            durationMs: p.duration as number | undefined,
            result: ev.type === 'tool.call.completed' ? String(p.result ?? '') : undefined,
            error: ev.type === 'tool.call.failed' ? String(p.error ?? '') : undefined,
          });
        }
        break;
      }
      case 'turn.completed': {
        const turn = ensureTurn();
        if (turn) {
          turn.status = 'completed';
          turn.endedAt = ev.timestamp;
          turn.thinkingDuration = p.thinkingDuration as number | undefined;
          turn.usage = p.usage as { totalTokens?: number } | undefined;
        }
        break;
      }
      case 'turn.failed': {
        const turn = ensureTurn();
        if (turn) {
          turn.status = 'failed';
          turn.endedAt = ev.timestamp;
        }
        break;
      }
      case 'context.compacted': {
        const turn = ensureTurn();
        if (!turn) break;
        turn.compactions.push({
          summary: p.summary as string | undefined,
          reason: p.reason as string | undefined,
          tokensBefore: p.tokensBefore as number | undefined,
          tokensAfter: p.tokensAfter as number | undefined,
        });
        break;
      }
      case 'channel.delivered': {
        const turn = ensureTurn();
        if (!turn) break;
        turn.deliveries.push({
          deliveryId: p.deliveryId as string | undefined,
          channel: p.channel as string | undefined,
          status: p.status as string | undefined,
          externalId: p.externalId as string | undefined,
          error: p.error as string | undefined,
          timestamp: ev.timestamp,
        });
        break;
      }
      default:
        break;
    }
  }
  return turns;
}

// ===================== 账本读取 =====================

function toLike(events: LedgerEvent[]): LedgerEventLike[] {
  return events.map((e) => ({
    seq: e.seq,
    type: e.type,
    payload: e.payload as Record<string, unknown>,
    timestamp: e.timestamp,
    runId: e.runId,
  }));
}

/** 读取会话的回合/step 审计视图（全部事件类型） */
export async function getStepTimeline(sessionId: string): Promise<TurnTimeline[]> {
  const events = await getEventLedger().getSessionEvents(sessionId);
  return foldStepTimeline(toLike(events));
}

/** 读取会话的 step 时间线（仅关注回合/工具/消息/压缩/渠道事件） */
export async function getStepTimelineAudit(sessionId: string): Promise<TurnTimeline[]> {
  const events = await getEventLedger().getSessionEvents(sessionId, {
    eventTypes: [
      'turn.started', 'turn.completed', 'turn.failed',
      'message.created', 'tool.call.started', 'tool.call.completed', 'tool.call.failed',
      'context.compacted', 'channel.delivered',
    ],
  });
  return foldStepTimeline(toLike(events));
}

/** 会话内某渠道的投递记录（channel.delivered 事件） */
export async function getChannelDeliveries(sessionId: string, channel?: string): Promise<ChannelDeliveryInfo[]> {
  const events = await getEventLedger().getSessionEvents(sessionId, { eventTypes: ['channel.delivered'] });
  const list = events.map((e) => e.payload as unknown as ChannelDeliveryInfo & { channel?: string });
  return channel ? list.filter((d) => d.channel === channel) : list;
}
