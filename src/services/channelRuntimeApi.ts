/**
 * Channel Runtime API — 前端调用后端 /api/channels 体系下的运行时端点
 *
 * 涵盖：
 * - ChannelManager    ：register / unregister / list / broadcast（后端已实现）
 * - TypingCallbacks   ：可视化哪些用户正在 typing（后端可选提供，降级模拟）
 * - PairingStore      ：可视化已配对 channel 列表（后端可选提供，降级模拟）
 * - InboundReplyPipeline：normalize -> filter -> route -> enrich 阶段展示
 *
 * 当后端未提供对应端点时，会在 UI 中展示降级（模拟）数据，并标注「演示」标记。
 *
 * 策略：所有调用使用 try/catch 包裹，失败时返回合理的默认结构（empty + ok=false），
 *       这样上游 UI 不会因为网络或后端缺失而崩。
 */

import { API_BASE_URL } from '../constants/api';

const BASE_URL = API_BASE_URL;

async function safeRequest<T>(path: string, options?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ===================== ChannelManager =====================

export interface ManagedChannel {
  /** 通道 id（与 /api/channels 中的 name 对应） */
  id: string;
  /** 类型：webhook / feishu / dingtalk / wechat / wechat_work / email */
  type: string;
  /** 当前状态：ready / closed / error */
  status: 'ready' | 'closed' | 'error' | 'unknown';
  /** 启动时间（ms） */
  startedAtMs?: number;
}

export interface BroadcastResult {
  /** 总广播目标数 */
  total: number;
  /** 成功数 */
  succeeded: number;
  /** 失败数 */
  failed: number;
  /** 失败明细 */
  failures: Array<{ channelId: string; error: string }>;
}

/** 列出 ChannelManager 已注册的运行时通道 */
export async function listManagedChannels(): Promise<{ ok: boolean; demo: boolean; channels: ManagedChannel[] }> {
  const res = await safeRequest<{ channels: ManagedChannel[] }>('/api/channels/manager/list');
  if (res.ok && res.data?.channels) {
    return { ok: true, demo: false, channels: res.data.channels };
  }
  // 降级：从通用 /api/channels 派生一个 ManagedChannel[] 视图
  try {
    const fallback = await safeRequest<{ channels: Array<{ name: string; type: string; status: string; enabled: boolean }> }>('/api/channels');
    if (fallback.ok && fallback.data?.channels) {
      const channels: ManagedChannel[] = fallback.data.channels.map(c => ({
        id: c.name,
        type: c.type,
        status: c.status === 'connected' ? 'ready' : c.status === 'error' ? 'error' : c.status === 'disconnected' ? 'closed' : 'unknown',
        startedAtMs: Date.now(),
      }));
      return { ok: true, demo: true, channels };
    }
  } catch {
    /* ignore */
  }
  return { ok: false, demo: true, channels: [] };
}

/** 立即广播一条消息到所有已注册通道 */
export async function broadcastMessage(payload: { content: string; contentType?: 'text' | 'markdown' | 'json' }): Promise<BroadcastResult> {
  const res = await safeRequest<BroadcastResult>('/api/channels/manager/broadcast', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.ok && res.data) return res.data;
  // 降级：依次调用 /api/channels/:name/send
  try {
    const list = await safeRequest<{ channels: Array<{ name: string; enabled: boolean }> }>('/api/channels');
    const targets = (list.data?.channels || []).filter(c => c.enabled);
    const failures: Array<{ channelId: string; error: string }> = [];
    let succeeded = 0;
    for (const t of targets) {
      const r = await safeRequest<{ ok: boolean }>(`/api/channels/${encodeURIComponent(t.name)}/send`, {
        method: 'POST',
        body: JSON.stringify({ content: payload.content, contentType: payload.contentType || 'text' }),
      });
      if (r.ok) {
        succeeded += 1;
      } else {
        failures.push({ channelId: t.name, error: r.error || 'send failed' });
      }
    }
    return { total: targets.length, succeeded, failed: failures.length, failures };
  } catch (e) {
    return { total: 0, succeeded: 0, failed: 0, failures: [{ channelId: '-', error: String(e) }] };
  }
}

// ===================== TypingCallbacks =====================

export interface ActiveTyper {
  channelId: string;
  userId: string;
  startedAtMs: number;
  expiresAtMs: number;
}

export interface TypingState {
  ok: boolean;
  demo: boolean;
  typers: ActiveTyper[];
}

/** 获取当前正在 typing 的用户列表 */
export async function listTypers(): Promise<TypingState> {
  const res = await safeRequest<{ typers: ActiveTyper[] }>('/api/channels/typing/list');
  if (res.ok && res.data?.typers) {
    return { ok: true, demo: false, typers: res.data.typers };
  }
  // 降级：返回空（前端仅做可视化，不阻塞）
  return { ok: false, demo: true, typers: [] };
}

// ===================== PairingStore =====================

export interface ChannelPair {
  a: string;
  b: string;
}

export interface PairingState {
  ok: boolean;
  demo: boolean;
  pairs: ChannelPair[];
}

/** 获取已配对 channel 列表 */
export async function listPairings(): Promise<PairingState> {
  const res = await safeRequest<{ pairs: ChannelPair[] }>('/api/channels/pairings/list');
  if (res.ok && res.data?.pairs) {
    return { ok: true, demo: false, pairs: res.data.pairs };
  }
  return { ok: false, demo: true, pairs: [] };
}

// ===================== InboundReplyPipeline =====================

export type PipelineStageName = 'normalize' | 'filter' | 'route' | 'enrich';

export interface PipelineStageStat {
  name: PipelineStageName;
  label: string;
  description: string;
  /** 进入阶段的消息数（最近窗口） */
  received: number;
  /** 通过阶段的消息数 */
  passed: number;
  /** 被阶段丢弃的消息数 */
  dropped: number;
  /** 平均处理耗时（毫秒） */
  avgDurationMs: number;
}

export interface PipelineSnapshot {
  ok: boolean;
  demo: boolean;
  stages: PipelineStageStat[];
  totalProcessed: number;
}

const STAGE_DEFS: Array<{ name: PipelineStageName; label: string; description: string }> = [
  { name: 'normalize', label: '规范化', description: '修剪空白、规范化时间戳、补齐默认字段' },
  { name: 'filter',    label: '过滤',   description: 'mention gating / 关键词白名单 / 权限校验' },
  { name: 'route',     label: '路由',   description: 'prefix routing / thread binding 决定目标 agent' },
  { name: 'enrich',    label: '富化',   description: '附加上下文、注入记忆、拼装消息载荷' },
];

/** 获取入站回复流水线的实时阶段统计 */
export async function fetchPipelineSnapshot(): Promise<PipelineSnapshot> {
  const res = await safeRequest<{ stages: PipelineStageStat[]; totalProcessed: number }>('/api/channels/pipeline/snapshot');
  if (res.ok && res.data?.stages) {
    return { ok: true, demo: false, stages: res.data.stages, totalProcessed: res.data.totalProcessed };
  }
  // 降级：用静态模板生成一份「演示」数据，保证 UI 完整
  const stages: PipelineStageStat[] = STAGE_DEFS.map((s) => ({
    ...s,
    received: 0,
    passed: 0,
    dropped: 0,
    avgDurationMs: 0,
  }));
  return { ok: false, demo: true, stages, totalProcessed: 0 };
}

/** 暴露给 UI 的「演示占位」工具方法 */
export function getStageDefinitions(): Array<{ name: PipelineStageName; label: string; description: string }> {
  return STAGE_DEFS;
}
